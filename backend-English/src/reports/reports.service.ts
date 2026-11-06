import { Injectable } from '@nestjs/common';
import { addDays, shanghaiDate } from '../common/day';
import { ParentUser, toPublicChild } from '../domain/types';
import { DataStore } from '../store/data.store';

@Injectable()
export class ReportsService {
  constructor(private readonly store: DataStore) {}

  async weekly(parent: ParentUser) {
    const child = parent.currentChildId
      ? await this.store.findChild(parent.currentChildId)
      : undefined;
    const today = shanghaiDate();
    const days = Array.from({ length: 7 }, (_, index) =>
      addDays(today, index - 6),
    );

    if (!child || child.parentId !== parent.id) {
      return {
        child: null,
        studiedCount: 0,
        accuracy: 0,
        activeDays: 0,
        streak: 0,
        wrongTop: [],
        daily: days.map((date) => ({ date, count: 0 })),
      };
    }

    const inRange = (await this.store.attemptsOf(child.id)).filter((item) =>
      days.includes(item.day),
    );
    const correct = inRange.filter((item) => item.correct).length;
    const activeDays = new Set(inRange.map((item) => item.day)).size;
    const counts = new Map<string, number>();
    for (const item of inRange) {
      counts.set(item.day, (counts.get(item.day) ?? 0) + 1);
    }

    const wrongTop: {
      spelling: string;
      meaning: string;
      wrongCount: number;
    }[] = [];
    for (const record of (await this.store.listWrong(child.id)).slice(0, 5)) {
      const word = await this.store.findWord(record.wordId);
      if (!word) continue;
      wrongTop.push({
        spelling: word.spelling,
        meaning: word.meaning,
        wrongCount: record.wrongCount,
      });
    }

    return {
      child: toPublicChild(child),
      studiedCount: inRange.length,
      accuracy:
        inRange.length === 0 ? 0 : Math.round((correct / inRange.length) * 100),
      activeDays,
      streak: await this.store.streak(child.id),
      wrongTop,
      daily: days.map((date) => ({ date, count: counts.get(date) ?? 0 })),
    };
  }
}
