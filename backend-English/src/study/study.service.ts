import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { shanghaiDate } from '../common/day';
import { toPublicWord } from '../common/word';
import {
  AttemptRecord,
  ParentUser,
  PublicStudyWord,
  toPublicChild,
} from '../domain/types';
import { WalletService } from '../economy/wallet.service';
import { DataStore } from '../store/data.store';
import { SubmitSessionDto } from './dto/submit-session.dto';
import { Rating, ratingToCorrect } from './srs';

@Injectable()
export class StudyService {
  constructor(
    private readonly store: DataStore,
    private readonly wallet: WalletService,
  ) {}

  async today(parent: ParentUser) {
    const child = await this.currentChild(parent);
    const member = await this.store.isActiveMember(parent.id);
    const textbooks = await this.store.listTextbooks();
    const studiedToday = child ? await this.store.countToday(child.id) : 0;

    if (!child) {
      const fallback = textbooks[0];
      return {
        needChild: true,
        child: null,
        textbook: fallback ? { id: fallback.id, name: fallback.name } : null,
        unit: null,
        words: [] as PublicStudyWord[],
        studiedToday,
        dailyLimit: this.store.limits.freeDaily,
        remaining: this.store.limits.freeDaily,
        newLimit: this.store.limits.freeDaily,
        newRemaining: this.store.limits.freeDaily,
        reviewLimit: 20,
        reviewDue: 0,
        reviewRemaining: 20,
        streak: 0,
        member,
      };
    }

    const newLimit = this.store.resolveDailyNewLimit(child, member);
    const reviewLimit = this.store.resolveDailyReviewLimit(child, member);
    const introducedToday = await this.store.countNewIntroducedToday(child.id);
    const newRemaining = Math.max(0, newLimit - introducedToday);

    const book =
      (child.textbookId
        ? textbooks.find((item) => item.id === child.textbookId)
        : undefined) ??
      textbooks.find(
        (item) => item.grade === child.grade && item.volume === '上册',
      ) ??
      textbooks.find((item) => item.grade === child.grade) ??
      textbooks[0];
    const units = await this.store.listUnits(book?.id);
    const unlocked = units.filter((item) => item.free || member);
    const unit = unlocked[0];

    const dueStates = await this.store.listDueReviews(
      child.id,
      shanghaiDate(),
      reviewLimit,
    );
    const knownIds = await this.store.listKnownWordIds(child.id);

    const reviewWords: PublicStudyWord[] = [];
    for (const state of dueStates) {
      const word = await this.store.findWord(state.wordId);
      if (!word) continue;
      reviewWords.push({
        ...toPublicWord(word),
        queueKind: 'review',
        box: state.box,
        nextReviewAt: state.nextReviewAt,
      });
    }

    const newWords: PublicStudyWord[] = [];
    if (unit && newRemaining > 0) {
      const pool = await this.store.listWords(unit.id);
      for (const word of pool) {
        if (newWords.length >= newRemaining) break;
        if (knownIds.has(word.id)) continue;
        newWords.push({
          ...toPublicWord(word),
          queueKind: 'new',
          box: 0,
          nextReviewAt: null,
        });
      }
    }

    // 复习优先，再补新词（芝士单词式）
    const words = [...reviewWords, ...newWords];
    const remaining = newRemaining + reviewWords.length;

    return {
      needChild: false,
      child: toPublicChild(child),
      textbook: book ? { id: book.id, name: book.name } : null,
      unit: unit ? { id: unit.id, title: unit.title, locked: false } : null,
      words,
      studiedToday,
      dailyLimit: newLimit,
      remaining,
      newLimit,
      newRemaining,
      reviewLimit,
      reviewDue: reviewWords.length,
      reviewRemaining: Math.max(0, reviewLimit - reviewWords.length),
      streak: await this.store.streak(child.id),
      member,
    };
  }

  async review(parent: ParentUser) {
    const child = await this.currentChild(parent);
    if (!child) {
      return {
        needChild: true,
        child: null,
        words: [] as PublicStudyWord[],
        totalWrong: 0,
      };
    }

    const due = await this.store.listDueReviews(child.id, shanghaiDate(), 40);
    const items: PublicStudyWord[] = [];
    for (const state of due) {
      const word = await this.store.findWord(state.wordId);
      if (!word) continue;
      items.push({
        ...toPublicWord(word),
        queueKind: 'review',
        box: state.box,
        nextReviewAt: state.nextReviewAt,
      });
    }

    // 若没有到期词，回退弱词本
    if (items.length === 0) {
      const wrongs = await this.buildWrongItems(child.id);
      return {
        needChild: false,
        child: toPublicChild(child),
        words: wrongs.slice(0, 20).map((w) => ({
          ...w,
          queueKind: 'review' as const,
          box: 1,
          nextReviewAt: null,
        })),
        totalWrong: wrongs.length,
      };
    }

    return {
      needChild: false,
      child: toPublicChild(child),
      words: items,
      totalWrong: items.length,
    };
  }

  async submit(parent: ParentUser, dto: SubmitSessionDto) {
    const child = await this.currentChild(parent);
    if (!child) throw new BadRequestException('请先创建孩子档案');

    const member = await this.store.isActiveMember(parent.id);
    const newLimit = this.store.resolveDailyNewLimit(child, member);
    const reviewLimit = this.store.resolveDailyReviewLimit(child, member);
    const isReviewMode = dto.mode === 'review';
    const introducedToday = await this.store.countNewIntroducedToday(child.id);
    let newSlots = Math.max(0, newLimit - introducedToday);
    let reviewSlots = reviewLimit;

    const day = shanghaiDate();
    const now = new Date().toISOString();
    const records: AttemptRecord[] = [];
    const states: { wordId: string; box: number }[] = [];
    let learnedHits = 0;
    let reviewedHits = 0;
    const sessionId = randomUUID();

    for (const answer of dto.answers) {
      const word = await this.store.findWord(answer.wordId);
      if (!word) throw new NotFoundException('单词不存在');

      const rating = this.resolveRating(answer);
      const existing = await this.store.getReviewState(child.id, word.id);
      const isNewIntro = !existing;

      if (!isReviewMode) {
        if (isNewIntro) {
          if (newSlots <= 0) {
            throw new BadRequestException('今日新词额度已用完');
          }
          newSlots -= 1;
        } else {
          if (reviewSlots <= 0) {
            throw new BadRequestException('今日复习额度已用完');
          }
          reviewSlots -= 1;
        }

        const unit = await this.store.findUnit(word.unitId);
        if (!unit) throw new NotFoundException('单元不存在');
        if (!unit.free && !member) {
          throw new ForbiddenException('开通会员后解锁本单元');
        }
      }

      const state = await this.store.applyReviewRating(
        child.id,
        word.id,
        rating,
      );
      states.push({ wordId: word.id, box: state.box });

      const correctFlag = ratingToCorrect(rating);
      if (correctFlag) {
        if (isReviewMode || !isNewIntro) reviewedHits += 1;
        else learnedHits += 1;
      }

      records.push({
        id: randomUUID(),
        childId: child.id,
        wordId: word.id,
        correct: correctFlag,
        rating,
        createdAt: now,
        day,
      });
    }
    await this.store.addAttempts(records);

    const earnedPoints = learnedHits * 10 + reviewedHits * 5;
    const eventId = `study:${child.id}:${sessionId}`;
    const payout = await this.wallet.credit({
      childId: child.id,
      eventId,
      amount: earnedPoints,
      reason: isReviewMode
        ? `复习奖励 ${reviewedHits} 词`
        : `闯关奖励 新学${learnedHits}/复习${reviewedHits}`,
    });

    const correct = records.filter((item) => item.correct).length;
    const total = records.length;
    return {
      correct,
      total,
      accuracy: total === 0 ? 0 : Math.round((correct / total) * 100),
      studiedToday: await this.store.countToday(child.id),
      dailyLimit: newLimit,
      member,
      mode: isReviewMode ? 'review' : 'normal',
      boxes: states,
      earnedPoints: payout.delta > 0 ? payout.delta : earnedPoints,
      balance: payout.balance,
      eventId,
      learned: learnedHits,
      reviewed: reviewedHits,
    };
  }

  async wrongWords(parent: ParentUser) {
    const child = await this.currentChild(parent);
    if (!child) return { items: [] };
    const items = await this.buildWrongItems(child.id);
    const withBox = [];
    for (const item of items) {
      const state = await this.store.getReviewState(child.id, item.id);
      withBox.push({
        ...item,
        box: state?.box ?? 1,
        nextReviewAt: state?.nextReviewAt ?? null,
      });
    }
    return { items: withBox };
  }

  private resolveRating(answer: {
    rating?: 1 | 2 | 3;
    correct?: boolean;
  }): Rating {
    if (answer.rating === 1 || answer.rating === 2 || answer.rating === 3) {
      return answer.rating;
    }
    if (typeof answer.correct === 'boolean') {
      return answer.correct ? 3 : 1;
    }
    throw new BadRequestException('请提交 rating（1/2/3）或 correct');
  }

  private async buildWrongItems(childId: string) {
    const wrongs = await this.store.listWrong(childId);
    const items: {
      id: string;
      spelling: string;
      phonetic: string;
      meaning: string;
      example: string;
      wrongCount: number;
      audioUrl: string;
    }[] = [];
    for (const record of wrongs) {
      const word = await this.store.findWord(record.wordId);
      if (!word) continue;
      const publicWord = toPublicWord(word);
      items.push({
        ...publicWord,
        wrongCount: record.wrongCount,
      });
    }
    return items;
  }

  private async currentChild(parent: ParentUser) {
    if (!parent.currentChildId) return undefined;
    const child = await this.store.findChild(parent.currentChildId);
    if (!child || child.parentId !== parent.id) return undefined;
    return child;
  }
}
