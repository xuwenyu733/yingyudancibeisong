/** 五格记忆法（Leitner）+ 简易 ease，面向小学生 */

export type Rating = 1 | 2 | 3; // 1 不认识 / 2 模糊 / 3 认识

export interface ReviewSnapshot {
  box: number;
  intervalDays: number;
  ease: number;
  nextReviewAt: Date;
  lapses: number;
  lastRating: Rating;
}

/** 升到某一格后的复习间隔（天） */
const BOX_INTERVALS = [0, 1, 2, 4, 7, 15] as const;

export function defaultReviewState(now = new Date()): ReviewSnapshot {
  return {
    box: 1,
    intervalDays: 0,
    ease: 2.5,
    nextReviewAt: now,
    lapses: 0,
    lastRating: 1,
  };
}

export function applyRating(
  prev: ReviewSnapshot | null,
  rating: Rating,
  now = new Date(),
): ReviewSnapshot {
  const current = prev ?? defaultReviewState(now);
  let box = current.box;
  let ease = current.ease;
  let lapses = current.lapses;
  let intervalDays = current.intervalDays;

  if (rating === 1) {
    // 不认识：回到第 1 格，尽快再练
    box = 1;
    lapses += 1;
    ease = Math.max(1.3, ease - 0.2);
    intervalDays = 0;
    return {
      box,
      intervalDays,
      ease,
      nextReviewAt: now,
      lapses,
      lastRating: rating,
    };
  }

  if (rating === 2) {
    // 模糊：降一格（最低 1），明天再看
    box = Math.max(1, box - 1);
    ease = Math.max(1.3, ease - 0.05);
    intervalDays = 1;
    return {
      box,
      intervalDays,
      ease,
      nextReviewAt: addCalendarDays(now, intervalDays),
      lapses,
      lastRating: rating,
    };
  }

  // 认识：升一格，按格子排期
  box = Math.min(5, box + 1);
  ease = Math.min(3.0, ease + 0.05);
  intervalDays = BOX_INTERVALS[box] ?? 15;
  return {
    box,
    intervalDays,
    ease,
    nextReviewAt: addCalendarDays(now, intervalDays),
    lapses,
    lastRating: rating,
  };
}

function addCalendarDays(from: Date, days: number): Date {
  const d = new Date(from.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

export function endOfShanghaiDay(day: string): Date {
  // day = YYYY-MM-DD，按上海日界取当天 23:59:59.999 的近似 UTC
  return new Date(`${day}T15:59:59.999Z`);
}

export function ratingToCorrect(rating: Rating): boolean {
  return rating >= 2;
}
