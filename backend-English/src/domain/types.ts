export interface ParentUser {
  id: string;
  openid: string;
  nickname: string;
  currentChildId: string | null;
}

export interface ChildProfile {
  id: string;
  parentId: string;
  nickname: string;
  grade: number;
  textbookId: string | null;
  newWordsPerDay: number;
  reviewLimitPerDay: number;
}

export interface Textbook {
  id: string;
  name: string;
  publisher: string;
  grade: number;
  volume: string;
}

export interface Unit {
  id: string;
  textbookId: string;
  title: string;
  order: number;
  free: boolean;
}

export interface Word {
  id: string;
  unitId: string;
  spelling: string;
  phonetic: string;
  meaning: string;
  example: string;
}

export interface Plan {
  id: string;
  name: string;
  price: number;
  days: number;
  highlight: boolean;
  desc: string;
}

export interface MembershipRecord {
  parentId: string;
  planId: string;
  startAt: string;
  endAt: string;
}

export interface OrderRecord {
  id: string;
  parentId: string;
  planId: string;
  amount: number;
  status: 'pending' | 'paid' | 'closed';
  outTradeNo: string | null;
  channel: 'mock' | 'wechat';
  prepayId: string | null;
  transactionId: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface AttemptRecord {
  id: string;
  childId: string;
  wordId: string;
  correct: boolean;
  rating?: number;
  createdAt: string;
  day: string;
}

export interface WrongRecord {
  childId: string;
  wordId: string;
  wrongCount: number;
  updatedAt: string;
}

export interface ReviewStateRecord {
  childId: string;
  wordId: string;
  box: number;
  intervalDays: number;
  ease: number;
  nextReviewAt: string;
  lapses: number;
  lastRating: number;
  lastStudiedAt: string | null;
}

export interface ReminderSettingRecord {
  parentId: string;
  enabled: boolean;
  accepted: boolean;
  acceptedAt: string | null;
  lastSentAt: string | null;
  lastSentDay: string | null;
}

export interface PublicChild {
  id: string;
  nickname: string;
  grade: number;
  textbookId: string | null;
}

export function toPublicChild(child: ChildProfile): PublicChild {
  return {
    id: child.id,
    nickname: child.nickname,
    grade: child.grade,
    textbookId: child.textbookId,
  };
}

export interface PublicStudyWord {
  id: string;
  spelling: string;
  phonetic: string;
  meaning: string;
  example: string;
  audioUrl: string;
  queueKind: 'new' | 'review';
  box: number;
  nextReviewAt: string | null;
}
