import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { addDays, shanghaiDate } from '../common/day';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from './wallet.service';

@Injectable()
export class MissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
  ) {}

  async status(childId: string) {
    const day = shanghaiDate();
    const checkIn = await this.prisma.dailyCheckIn.findUnique({
      where: { childId_day: { childId, day } },
    });
    const streak = checkIn
      ? checkIn.streak
      : await this.previewStreak(childId, day);
    const rewardPreview = this.checkInReward(streak);

    const defs = await this.prisma.dailyTaskDef.findMany({
      where: { active: true },
      orderBy: { sort: 'asc' },
    });
    const claims = await this.prisma.dailyTaskClaim.findMany({
      where: { childId, day },
    });
    const claimed = new Set(claims.map((row) => row.taskId));
    const progressMap = await this.computeProgress(childId, day);

    return {
      day,
      balance: await this.wallet.getBalance(childId),
      checkIn: {
        done: !!checkIn,
        streak: checkIn?.streak ?? streak,
        reward: checkIn?.reward ?? rewardPreview,
        rewardPreview,
      },
      tasks: defs.map((def) => {
        const progress = this.readProgress(progressMap, def.metric);
        const done = claimed.has(def.id);
        const complete = progress >= def.target;
        return {
          id: def.id,
          key: def.key,
          title: def.title,
          desc: def.desc,
          target: def.target,
          reward: def.reward,
          progress: Math.min(progress, def.target),
          complete,
          claimed: done,
          claimable: complete && !done,
        };
      }),
    };
  }

  async checkIn(childId: string) {
    const day = shanghaiDate();
    const existing = await this.prisma.dailyCheckIn.findUnique({
      where: { childId_day: { childId, day } },
    });
    if (existing) {
      return {
        already: true,
        day,
        streak: existing.streak,
        reward: existing.reward,
        balance: await this.wallet.getBalance(childId),
      };
    }

    const streak = await this.previewStreak(childId, day);
    const reward = this.checkInReward(streak);
    const eventId = `checkin:${childId}:${day}`;

    await this.prisma.dailyCheckIn.create({
      data: { childId, day, streak, reward },
    });

    const payout = await this.wallet.credit({
      childId,
      eventId,
      amount: reward,
      reason: `每日签到 · 连续 ${streak} 天`,
    });

    return {
      already: false,
      day,
      streak,
      reward: payout.delta || reward,
      balance: payout.balance,
    };
  }

  async claimTask(childId: string, taskId: string) {
    const day = shanghaiDate();
    const def = await this.prisma.dailyTaskDef.findUnique({
      where: { id: taskId },
    });
    if (!def || !def.active) throw new NotFoundException('任务不存在');

    const existing = await this.prisma.dailyTaskClaim.findUnique({
      where: { childId_taskId_day: { childId, taskId, day } },
    });
    if (existing) {
      return {
        already: true,
        reward: existing.reward,
        balance: await this.wallet.getBalance(childId),
        status: await this.status(childId),
      };
    }

    const progressMap = await this.computeProgress(childId, day);
    const progress = this.readProgress(progressMap, def.metric);
    if (progress < def.target) {
      throw new BadRequestException(
        `还差一点点：${progress}/${def.target}，先去完成再领奖励哦`,
      );
    }

    const eventId = `task:${childId}:${taskId}:${day}`;
    await this.prisma.dailyTaskClaim.create({
      data: { childId, taskId, day, reward: def.reward },
    });
    const payout = await this.wallet.credit({
      childId,
      eventId,
      amount: def.reward,
      reason: `每日任务 · ${def.title}`,
    });

    return {
      already: false,
      reward: payout.delta || def.reward,
      balance: payout.balance,
      status: await this.status(childId),
    };
  }

  private checkInReward(streak: number): number {
    return Math.min(30, 10 + Math.max(0, streak - 1) * 2);
  }

  private async previewStreak(childId: string, day: string): Promise<number> {
    const yesterday = addDays(day, -1);
    const prev = await this.prisma.dailyCheckIn.findUnique({
      where: { childId_day: { childId, day: yesterday } },
    });
    return prev ? prev.streak + 1 : 1;
  }

  private readProgress(
    map: Record<'attempts' | 'correct' | 'review_correct', number>,
    metric: string,
  ) {
    if (metric === 'attempts' || metric === 'correct' || metric === 'review_correct') {
      return map[metric];
    }
    return 0;
  }

  private async computeProgress(childId: string, day: string) {
    const rows = await this.prisma.studyAttempt.findMany({
      where: { childId, day },
      select: { correct: true, rating: true, wordId: true, createdAt: true },
    });

    let correctCount = 0;
    let reviewCorrect = 0;

    for (const row of rows) {
      const ok = row.correct || row.rating >= 2;
      if (ok) correctCount += 1;

      const state = await this.prisma.reviewState.findUnique({
        where: { childId_wordId: { childId, wordId: row.wordId } },
        select: { createdAt: true },
      });
      if (!ok || !state) continue;

      const createdDay = shanghaiDate(state.createdAt);
      if (createdDay < day) {
        reviewCorrect += 1;
      } else if (
        createdDay === day &&
        state.createdAt.getTime() < row.createdAt.getTime() - 500
      ) {
        reviewCorrect += 1;
      }
    }

    return {
      attempts: rows.length,
      correct: correctCount,
      review_correct: reviewCorrect,
    };
  }
}
