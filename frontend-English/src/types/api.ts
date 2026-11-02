export interface PublicUser {
  id: string
  nickname: string
  currentChildId: string | null
}

export interface Child {
  id: string
  nickname: string
  grade: number
  textbookId: string | null
}

export interface Word {
  id: string
  spelling: string
  phonetic: string
  meaning: string
  example: string
  audioUrl?: string
}

export interface UnitView {
  id: string
  title: string
  order: number
  free: boolean
  locked: boolean
  wordCount: number
}

export interface Textbook {
  id: string
  name: string
  publisher: string
  grade: number
  volume: string
  units: UnitView[]
}

export interface TodayTask {
  needChild: boolean
  child: Child | null
  textbook: { id: string; name: string } | null
  unit: { id: string; title: string; locked: boolean } | null
  words: Word[]
  studiedToday: number
  dailyLimit: number
  remaining: number
  streak: number
  member: boolean
}

export interface SessionResult {
  correct: number
  total: number
  accuracy: number
  studiedToday: number
  dailyLimit: number
  member: boolean
}

export interface WrongWord extends Word {
  wrongCount: number
}

export interface WeeklyReport {
  child: Child | null
  studiedCount: number
  accuracy: number
  activeDays: number
  streak: number
  wrongTop: { spelling: string; meaning: string; wrongCount: number }[]
  daily: { date: string; count: number }[]
}

export interface Plan {
  id: 'month' | 'term'
  name: string
  price: number
  days: number
  highlight: boolean
  desc: string
}

export interface MembershipStatus {
  active: boolean
  planId: string | null
  planName: string | null
  endAt: string | null
}

export interface CreatedOrder {
  orderId: string
  amount: number
  planId: string
  status: string
  devPay: boolean
}

export interface ReminderStatus {
  enabled: boolean
  accepted: boolean
  studiedToday: boolean
  lastSentAt: string | null
  lastSentDay: string | null
  childName: string | null
  templateConfigured: boolean
  mode: 'wechat' | 'mock'
}

export interface ReminderSendResult {
  parentId: string
  day: string
  status: string
  reason: string
}
