export interface PublicUser {
  id: string;
  nickname: string;
  currentChildId: string | null;
}

export interface Child {
  id: string;
  nickname: string;
  grade: number;
  textbookId: string | null;
}

export interface Word {
  id: string;
  spelling: string;
  phonetic: string;
  meaning: string;
  example: string;
  audioUrl?: string;
  /** new=新词 review=到期复习 */
  queueKind?: "new" | "review";
  /** 0=未学 1-5=五格 */
  box?: number;
  nextReviewAt?: string | null;
}

export interface UnitView {
  id: string;
  title: string;
  order: number;
  free: boolean;
  locked: boolean;
  wordCount: number;
}

export interface Textbook {
  id: string;
  name: string;
  publisher: string;
  grade: number;
  volume: string;
  units: UnitView[];
}

export interface TodayTask {
  needChild: boolean;
  child: Child | null;
  textbook: { id: string; name: string } | null;
  unit: { id: string; title: string; locked: boolean } | null;
  words: Word[];
  studiedToday: number;
  dailyLimit: number;
  remaining: number;
  newLimit?: number;
  newRemaining?: number;
  reviewLimit?: number;
  reviewDue?: number;
  reviewRemaining?: number;
  streak: number;
  member: boolean;
}

export interface SessionResult {
  correct: number;
  total: number;
  accuracy: number;
  studiedToday: number;
  dailyLimit: number;
  member: boolean;
  boxes?: { wordId: string; box: number }[];
  earnedPoints?: number;
  balance?: number;
  eventId?: string;
  learned?: number;
  reviewed?: number;
}

export interface ShopGoods {
  id: string;
  name: string;
  category: string;
  price: number;
  desc: string;
  roomAction?: Record<string, unknown>;
  owned?: boolean;
  equipped?: boolean;
}

export interface WrongWord extends Word {
  wrongCount: number;
  box?: number;
}

export interface WeeklyReport {
  child: Child | null;
  studiedCount: number;
  accuracy: number;
  activeDays: number;
  streak: number;
  wrongTop: { spelling: string; meaning: string; wrongCount: number }[];
  daily: { date: string; count: number }[];
}

export interface Plan {
  id: "month" | "term";
  name: string;
  price: number;
  days: number;
  highlight: boolean;
  desc: string;
}

export interface MembershipStatus {
  active: boolean;
  planId: string | null;
  planName: string | null;
  endAt: string | null;
  wechatPayReady?: boolean;
}

export interface CreatedOrder {
  orderId: string;
  outTradeNo?: string | null;
  amount: number;
  planId: string;
  status: string;
  channel?: "mock" | "wechat";
  payMode?: "mock" | "wechat";
  allowMock?: boolean;
  payParams?: {
    timeStamp: string;
    nonceStr: string;
    package: string;
    signType: string;
    paySign: string;
    appId?: string;
  } | null;
  wechatPayReady?: boolean;
  /** @deprecated 兼容旧字段 */
  devPay?: boolean;
}

export interface MembershipOrder {
  id: string;
  planId: string;
  planName: string;
  amount: number;
  status: string;
  channel: string;
  outTradeNo: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface ReminderStatus {
  enabled: boolean;
  accepted: boolean;
  studiedToday: boolean;
  lastSentAt: string | null;
  lastSentDay: string | null;
  childName: string | null;
  templateConfigured: boolean;
  mode: "wechat" | "mock";
}

export interface ReminderSendResult {
  parentId: string;
  day: string;
  status: string;
  reason: string;
}

/** 1 不认识 / 2 模糊 / 3 认识 */
export type MasteryRating = 1 | 2 | 3;
