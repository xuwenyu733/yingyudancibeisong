import { Injectable, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { hashPassword } from '../admin/password';
import {
  DAILY_TASKS,
  LIMITS,
  PLANS,
  SHOP_CATALOG,
  TEXTBOOKS,
  UNITS,
  WORDS,
} from '../data/seed';
import {
  AttemptRecord,
  ChildProfile,
  MembershipRecord,
  OrderRecord,
  ParentUser,
  ReminderSettingRecord,
  ReviewStateRecord,
  Textbook,
  Unit,
  Word,
  WrongRecord,
} from '../domain/types';
import { addDays, shanghaiDate } from '../common/day';
import { PrismaService } from '../prisma/prisma.service';
import {
  applyRating,
  endOfShanghaiDay,
  Rating,
  ratingToCorrect,
} from '../study/srs';

@Injectable()
export class DataStore implements OnModuleInit {
  readonly plans = PLANS;

  async listPlanOverrides() {
    return this.prisma.planOverride.findMany();
  }
  readonly limits = LIMITS;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedCatalog();
  }

  private async seedCatalog() {
    for (const book of TEXTBOOKS) {
      await this.prisma.textbook.upsert({
        where: { id: book.id },
        create: {
          id: book.id,
          name: book.name,
          publisher: book.publisher,
          grade: book.grade,
          volume: book.volume,
        },
        update: {
          name: book.name,
          publisher: book.publisher,
          grade: book.grade,
          volume: book.volume,
        },
      });
    }

    for (const unit of UNITS) {
      await this.prisma.unit.upsert({
        where: { id: unit.id },
        create: {
          id: unit.id,
          textbookId: unit.textbookId,
          title: unit.title,
          order: unit.order,
          free: unit.free,
        },
        update: {
          textbookId: unit.textbookId,
          title: unit.title,
          order: unit.order,
          free: unit.free,
        },
      });
    }

    for (const word of WORDS) {
      await this.prisma.word.upsert({
        where: { id: word.id },
        create: {
          id: word.id,
          unitId: word.unitId,
          spelling: word.spelling,
          phonetic: word.phonetic,
          meaning: word.meaning,
          example: word.example,
        },
        update: {
          unitId: word.unitId,
          spelling: word.spelling,
          phonetic: word.phonetic,
          meaning: word.meaning,
          example: word.example,
        },
      });
    }

    for (const item of SHOP_CATALOG) {
      await this.prisma.shopItem.upsert({
        where: { id: item.id },
        create: {
          id: item.id,
          name: item.name,
          category: item.category,
          price: item.price,
          desc: item.desc,
          roomAction: JSON.stringify(item.roomAction),
          active: true,
        },
        update: {
          name: item.name,
          category: item.category,
          price: item.price,
          desc: item.desc,
          roomAction: JSON.stringify(item.roomAction),
          active: true,
        },
      });
    }

    for (const task of DAILY_TASKS) {
      await this.prisma.dailyTaskDef.upsert({
        where: { id: task.id },
        create: {
          id: task.id,
          key: task.key,
          title: task.title,
          desc: task.desc,
          metric: task.metric,
          target: task.target,
          reward: task.reward,
          sort: task.sort,
          active: true,
        },
        update: {
          key: task.key,
          title: task.title,
          desc: task.desc,
          metric: task.metric,
          target: task.target,
          reward: task.reward,
          sort: task.sort,
          active: true,
        },
      });
    }

    await this.seedAdminUsers();
  }

  private async seedAdminUsers() {
    const seeds: Array<{
      username: string;
      password: string;
      role: 'SUPER_ADMIN' | 'ADMIN';
    }> = [
      {
        username: 'superadmin',
        password: 'SuperAdmin123!',
        role: 'SUPER_ADMIN',
      },
      { username: 'admin', password: 'Admin123!', role: 'ADMIN' },
    ];
    for (const item of seeds) {
      const existing = await this.prisma.adminUser.findUnique({
        where: { username: item.username },
      });
      if (existing) {
        await this.prisma.adminUser.update({
          where: { username: item.username },
          data: { role: item.role, enabled: true },
        });
        continue;
      }
      try {
        await this.prisma.adminUser.create({
          data: {
            id: randomUUID(),
            username: item.username,
            passwordHash: hashPassword(item.password),
            role: item.role,
            enabled: true,
          },
        });
      } catch {
        // 并发启动时可能已由另一进程写入
      }
    }
  }

  async findParentByOpenid(openid: string): Promise<ParentUser | undefined> {
    const parent = await this.prisma.parent.findUnique({ where: { openid } });
    return parent ? this.toParent(parent) : undefined;
  }

  async findParent(id: string): Promise<ParentUser | undefined> {
    const parent = await this.prisma.parent.findUnique({ where: { id } });
    return parent ? this.toParent(parent) : undefined;
  }

  async saveParent(parent: ParentUser): Promise<void> {
    await this.prisma.parent.upsert({
      where: { id: parent.id },
      create: {
        id: parent.id,
        openid: parent.openid,
        nickname: parent.nickname,
        currentChildId: parent.currentChildId,
      },
      update: {
        nickname: parent.nickname,
        currentChildId: parent.currentChildId,
      },
    });
  }

  async listChildren(parentId: string): Promise<ChildProfile[]> {
    const children = await this.prisma.child.findMany({
      where: { parentId },
      orderBy: { createdAt: 'asc' },
    });
    return children.map((child) => this.toChild(child));
  }

  async findChild(id: string): Promise<ChildProfile | undefined> {
    const child = await this.prisma.child.findUnique({ where: { id } });
    return child ? this.toChild(child) : undefined;
  }

  async saveChild(child: ChildProfile): Promise<void> {
    await this.prisma.child.upsert({
      where: { id: child.id },
      create: {
        id: child.id,
        parentId: child.parentId,
        nickname: child.nickname,
        grade: child.grade,
        textbookId: child.textbookId,
        newWordsPerDay: child.newWordsPerDay,
        reviewLimitPerDay: child.reviewLimitPerDay,
      },
      update: {
        nickname: child.nickname,
        grade: child.grade,
        textbookId: child.textbookId,
        newWordsPerDay: child.newWordsPerDay,
        reviewLimitPerDay: child.reviewLimitPerDay,
      },
    });
  }

  async findTextbook(id: string): Promise<Textbook | undefined> {
    const book = await this.prisma.textbook.findUnique({ where: { id } });
    return book ?? undefined;
  }

  async isActiveMember(parentId: string, now = new Date()): Promise<boolean> {
    const membership = await this.prisma.membership.findUnique({
      where: { parentId },
    });
    if (!membership) return false;
    return membership.endAt.getTime() > now.getTime();
  }

  async getMembership(
    parentId: string,
  ): Promise<MembershipRecord | undefined> {
    const membership = await this.prisma.membership.findUnique({
      where: { parentId },
    });
    if (!membership) return undefined;
    return {
      parentId: membership.parentId,
      planId: membership.planId,
      startAt: membership.startAt.toISOString(),
      endAt: membership.endAt.toISOString(),
    };
  }

  async setMembership(record: MembershipRecord): Promise<void> {
    await this.prisma.membership.upsert({
      where: { parentId: record.parentId },
      create: {
        parentId: record.parentId,
        planId: record.planId,
        startAt: new Date(record.startAt),
        endAt: new Date(record.endAt),
      },
      update: {
        planId: record.planId,
        startAt: new Date(record.startAt),
        endAt: new Date(record.endAt),
      },
    });
  }

  async saveOrder(order: OrderRecord): Promise<void> {
    await this.prisma.order.upsert({
      where: { id: order.id },
      create: {
        id: order.id,
        parentId: order.parentId,
        planId: order.planId,
        amount: order.amount,
        status: order.status,
        outTradeNo: order.outTradeNo,
        channel: order.channel,
        prepayId: order.prepayId,
        transactionId: order.transactionId,
        paidAt: order.paidAt ? new Date(order.paidAt) : null,
        createdAt: new Date(order.createdAt),
      },
      update: {
        status: order.status,
        outTradeNo: order.outTradeNo,
        channel: order.channel,
        prepayId: order.prepayId,
        transactionId: order.transactionId,
        paidAt: order.paidAt ? new Date(order.paidAt) : null,
      },
    });
  }

  async findOrder(id: string): Promise<OrderRecord | undefined> {
    const order = await this.prisma.order.findUnique({ where: { id } });
    return order ? this.toOrder(order) : undefined;
  }

  async findOrderByOutTradeNo(
    outTradeNo: string,
  ): Promise<OrderRecord | undefined> {
    const order = await this.prisma.order.findUnique({ where: { outTradeNo } });
    return order ? this.toOrder(order) : undefined;
  }

  async listOrders(parentId: string, take = 20): Promise<OrderRecord[]> {
    const rows = await this.prisma.order.findMany({
      where: { parentId },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return rows.map((row) => this.toOrder(row));
  }

  async listTextbooks(): Promise<Textbook[]> {
    return this.prisma.textbook.findMany({ orderBy: { grade: 'asc' } });
  }

  async listUnits(textbookId?: string): Promise<Unit[]> {
    return this.prisma.unit.findMany({
      where: textbookId ? { textbookId } : undefined,
      orderBy: { order: 'asc' },
    });
  }

  async findUnit(id: string): Promise<Unit | undefined> {
    const unit = await this.prisma.unit.findUnique({ where: { id } });
    return unit ?? undefined;
  }

  async listWords(unitId?: string): Promise<Word[]> {
    return this.prisma.word.findMany({
      where: unitId ? { unitId } : undefined,
      orderBy: { id: 'asc' },
    });
  }

  async findWord(id: string): Promise<Word | undefined> {
    const word = await this.prisma.word.findUnique({ where: { id } });
    return word ?? undefined;
  }

  async addAttempts(records: AttemptRecord[]): Promise<void> {
    if (records.length === 0) return;
    await this.prisma.studyAttempt.createMany({
      data: records.map((record) => ({
        id: record.id,
        childId: record.childId,
        wordId: record.wordId,
        correct: record.correct,
        rating: record.rating ?? 0,
        day: record.day,
        createdAt: new Date(record.createdAt),
      })),
    });
  }

  async attemptsOf(childId: string): Promise<AttemptRecord[]> {
    const attempts = await this.prisma.studyAttempt.findMany({
      where: { childId },
      orderBy: { createdAt: 'asc' },
    });
    return attempts.map((item) => ({
      id: item.id,
      childId: item.childId,
      wordId: item.wordId,
      correct: item.correct,
      createdAt: item.createdAt.toISOString(),
      day: item.day,
    }));
  }

  async countToday(childId: string, day = shanghaiDate()): Promise<number> {
    return this.prisma.studyAttempt.count({
      where: { childId, day },
    });
  }

  async streak(childId: string): Promise<number> {
    const attempts = await this.prisma.studyAttempt.findMany({
      where: { childId },
      select: { day: true },
      distinct: ['day'],
    });
    const active = new Set(attempts.map((item) => item.day));
    const today = shanghaiDate();
    let cursor = active.has(today) ? today : addDays(today, -1);
    if (!active.has(cursor)) return 0;

    let days = 0;
    while (active.has(cursor)) {
      days += 1;
      cursor = addDays(cursor, -1);
    }
    return days;
  }

  async getReviewState(
    childId: string,
    wordId: string,
  ): Promise<ReviewStateRecord | undefined> {
    const row = await this.prisma.reviewState.findUnique({
      where: { childId_wordId: { childId, wordId } },
    });
    return row ? this.toReview(row) : undefined;
  }

  /** 应用三档自评，更新 SRS，并同步弱词本（box<=2） */
  async applyReviewRating(
    childId: string,
    wordId: string,
    rating: Rating,
  ): Promise<ReviewStateRecord> {
    const prev = await this.getReviewState(childId, wordId);
    const next = applyRating(
      prev
        ? {
            box: prev.box,
            intervalDays: prev.intervalDays,
            ease: prev.ease,
            nextReviewAt: new Date(prev.nextReviewAt),
            lapses: prev.lapses,
            lastRating: prev.lastRating as Rating,
          }
        : null,
      rating,
    );
    const now = new Date();
    const row = await this.prisma.reviewState.upsert({
      where: { childId_wordId: { childId, wordId } },
      create: {
        childId,
        wordId,
        box: next.box,
        intervalDays: next.intervalDays,
        ease: next.ease,
        nextReviewAt: next.nextReviewAt,
        lapses: next.lapses,
        lastRating: next.lastRating,
        lastStudiedAt: now,
      },
      update: {
        box: next.box,
        intervalDays: next.intervalDays,
        ease: next.ease,
        nextReviewAt: next.nextReviewAt,
        lapses: next.lapses,
        lastRating: next.lastRating,
        lastStudiedAt: now,
      },
    });

    if (next.box <= 2 || rating === 1) {
      const current = await this.prisma.wrongWord.findUnique({
        where: { childId_wordId: { childId, wordId } },
      });
      if (current) {
        await this.prisma.wrongWord.update({
          where: { childId_wordId: { childId, wordId } },
          data: {
            wrongCount:
              rating === 1 ? current.wrongCount + 1 : current.wrongCount,
          },
        });
      } else {
        await this.prisma.wrongWord.create({
          data: { childId, wordId, wrongCount: 1 },
        });
      }
    } else {
      await this.prisma.wrongWord.deleteMany({ where: { childId, wordId } });
    }

    return this.toReview(row);
  }

  /** @deprecated 兼容旧调用：正确≈认识，错误≈不认识 */
  async markAnswer(
    childId: string,
    wordId: string,
    correct: boolean,
  ): Promise<void> {
    await this.applyReviewRating(childId, wordId, correct ? 3 : 1);
  }

  async listDueReviews(
    childId: string,
    day = shanghaiDate(),
    take = 40,
  ): Promise<ReviewStateRecord[]> {
    const dueBefore = endOfShanghaiDay(day);
    const rows = await this.prisma.reviewState.findMany({
      where: {
        childId,
        nextReviewAt: { lte: dueBefore },
      },
      orderBy: [{ box: 'asc' }, { nextReviewAt: 'asc' }],
      take,
    });
    return rows.map((row) => this.toReview(row));
  }

  async listKnownWordIds(childId: string): Promise<Set<string>> {
    const rows = await this.prisma.reviewState.findMany({
      where: { childId },
      select: { wordId: true },
    });
    return new Set(rows.map((row) => row.wordId));
  }

  async countNewIntroducedToday(
    childId: string,
    day = shanghaiDate(),
  ): Promise<number> {
    const start = new Date(`${day}T00:00:00+08:00`);
    const end = endOfShanghaiDay(day);
    return this.prisma.reviewState.count({
      where: {
        childId,
        createdAt: { gte: start, lte: end },
      },
    });
  }

  async countReviewsDoneToday(
    childId: string,
    day = shanghaiDate(),
  ): Promise<number> {
    // 今日答题里，非当日新建的 ReviewState 视为复习
    const attempts = await this.prisma.studyAttempt.findMany({
      where: { childId, day },
      select: { wordId: true, createdAt: true },
    });
    if (attempts.length === 0) return 0;
    let reviewCount = 0;
    for (const attempt of attempts) {
      const state = await this.prisma.reviewState.findUnique({
        where: {
          childId_wordId: { childId, wordId: attempt.wordId },
        },
        select: { createdAt: true },
      });
      if (!state) continue;
      const createdDay = shanghaiDate(state.createdAt);
      if (createdDay < day) reviewCount += 1;
      else if (
        createdDay === day &&
        state.createdAt.getTime() < attempt.createdAt.getTime() - 1000
      ) {
        // 同日再次出现：算复习
        reviewCount += 1;
      }
    }
    return reviewCount;
  }

  resolveDailyNewLimit(child: ChildProfile, member: boolean): number {
    const planCap = child.newWordsPerDay || this.limits.freeDaily;
    const membershipCap = member
      ? this.limits.memberDaily
      : this.limits.freeDaily;
    return Math.min(planCap, membershipCap);
  }

  resolveDailyReviewLimit(child: ChildProfile, member: boolean): number {
    const planCap = child.reviewLimitPerDay || 40;
    return member ? planCap : Math.min(planCap, 20);
  }

  ratingToCorrect = ratingToCorrect;

  async listWrong(childId: string): Promise<WrongRecord[]> {
    const rows = await this.prisma.wrongWord.findMany({
      where: { childId },
      orderBy: { wrongCount: 'desc' },
    });
    return rows.map((row) => ({
      childId: row.childId,
      wordId: row.wordId,
      wrongCount: row.wrongCount,
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async getReminder(
    parentId: string,
  ): Promise<ReminderSettingRecord | undefined> {
    const row = await this.prisma.reminderSetting.findUnique({
      where: { parentId },
    });
    return row ? this.toReminder(row) : undefined;
  }

  async upsertReminder(
    parentId: string,
    data: Partial<{
      enabled: boolean;
      accepted: boolean;
      acceptedAt: Date | null;
      lastSentAt: Date | null;
      lastSentDay: string | null;
    }>,
  ): Promise<ReminderSettingRecord> {
    const row = await this.prisma.reminderSetting.upsert({
      where: { parentId },
      create: {
        parentId,
        enabled: data.enabled ?? false,
        accepted: data.accepted ?? false,
        acceptedAt: data.acceptedAt ?? null,
        lastSentAt: data.lastSentAt ?? null,
        lastSentDay: data.lastSentDay ?? null,
      },
      update: {
        ...(data.enabled === undefined ? {} : { enabled: data.enabled }),
        ...(data.accepted === undefined ? {} : { accepted: data.accepted }),
        ...(data.acceptedAt === undefined
          ? {}
          : { acceptedAt: data.acceptedAt }),
        ...(data.lastSentAt === undefined
          ? {}
          : { lastSentAt: data.lastSentAt }),
        ...(data.lastSentDay === undefined
          ? {}
          : { lastSentDay: data.lastSentDay }),
      },
    });
    return this.toReminder(row);
  }

  async listEnabledReminders(): Promise<ReminderSettingRecord[]> {
    const rows = await this.prisma.reminderSetting.findMany({
      where: { enabled: true },
    });
    return rows.map((row) => this.toReminder(row));
  }

  async listParents(): Promise<ParentUser[]> {
    const rows = await this.prisma.parent.findMany();
    return rows.map((row) => this.toParent(row));
  }

  async addReminderLog(input: {
    id: string;
    parentId: string;
    day: string;
    status: string;
    reason?: string;
  }): Promise<void> {
    await this.prisma.reminderLog.create({
      data: {
        id: input.id,
        parentId: input.parentId,
        day: input.day,
        status: input.status,
        reason: input.reason,
      },
    });
  }

  private toReminder(row: {
    parentId: string;
    enabled: boolean;
    accepted: boolean;
    acceptedAt: Date | null;
    lastSentAt: Date | null;
    lastSentDay: string | null;
  }): ReminderSettingRecord {
    return {
      parentId: row.parentId,
      enabled: row.enabled,
      accepted: row.accepted,
      acceptedAt: row.acceptedAt ? row.acceptedAt.toISOString() : null,
      lastSentAt: row.lastSentAt ? row.lastSentAt.toISOString() : null,
      lastSentDay: row.lastSentDay,
    };
  }

  private toParent(parent: {
    id: string;
    openid: string;
    nickname: string;
    currentChildId: string | null;
  }): ParentUser {
    return {
      id: parent.id,
      openid: parent.openid,
      nickname: parent.nickname,
      currentChildId: parent.currentChildId,
    };
  }

  private toChild(child: {
    id: string;
    parentId: string;
    nickname: string;
    grade: number;
    textbookId: string | null;
    newWordsPerDay?: number;
    reviewLimitPerDay?: number;
  }): ChildProfile {
    return {
      id: child.id,
      parentId: child.parentId,
      nickname: child.nickname,
      grade: child.grade,
      textbookId: child.textbookId,
      newWordsPerDay: child.newWordsPerDay ?? 10,
      reviewLimitPerDay: child.reviewLimitPerDay ?? 40,
    };
  }

  private toReview(row: {
    childId: string;
    wordId: string;
    box: number;
    intervalDays: number;
    ease: number;
    nextReviewAt: Date;
    lapses: number;
    lastRating: number;
    lastStudiedAt: Date | null;
  }): ReviewStateRecord {
    return {
      childId: row.childId,
      wordId: row.wordId,
      box: row.box,
      intervalDays: row.intervalDays,
      ease: row.ease,
      nextReviewAt: row.nextReviewAt.toISOString(),
      lapses: row.lapses,
      lastRating: row.lastRating,
      lastStudiedAt: row.lastStudiedAt
        ? row.lastStudiedAt.toISOString()
        : null,
    };
  }

  private toOrder(order: {
    id: string;
    parentId: string;
    planId: string;
    amount: number;
    status: string;
    outTradeNo: string | null;
    channel: string;
    prepayId: string | null;
    transactionId: string | null;
    paidAt: Date | null;
    createdAt: Date;
  }): OrderRecord {
    return {
      id: order.id,
      parentId: order.parentId,
      planId: order.planId,
      amount: order.amount,
      status: order.status as OrderRecord['status'],
      outTradeNo: order.outTradeNo,
      channel: order.channel === 'wechat' ? 'wechat' : 'mock',
      prepayId: order.prepayId,
      transactionId: order.transactionId,
      paidAt: order.paidAt ? order.paidAt.toISOString() : null,
      createdAt: order.createdAt.toISOString(),
    };
  }
}
