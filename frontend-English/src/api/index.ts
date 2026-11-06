import type {
  Child,
  CreatedOrder,
  MembershipStatus,
  Plan,
  PublicUser,
  SessionResult,
  Textbook,
  TodayTask,
  ReminderSendResult,
  ReminderStatus,
  WeeklyReport,
  Word,
  WrongWord,
} from '../types/api'
import { request } from './http'

export function wechatLogin(code: string) {
  return request<{ token: string; user: PublicUser }>('/auth/wechat', {
    method: 'POST',
    data: { code },
    auth: false,
  })
}

export function fetchChildren() {
  return request<{ currentChildId: string | null; items: Child[] }>('/children')
}

export function createChild(data: {
  nickname: string
  grade: number
  textbookId?: string
}) {
  return request<Child>('/children', { method: 'POST', data })
}

export function updateChildTextbook(childId: string, textbookId: string) {
  return request<Child>(`/children/${childId}/textbook`, {
    method: 'POST',
    data: { textbookId },
  })
}

export function selectChild(id: string) {
  return request<{ currentChildId: string; child: Child }>(`/children/${id}/current`, {
    method: 'POST',
  })
}

export function fetchTextbooks() {
  return request<{ items: Textbook[] }>('/textbooks')
}

export function fetchUnitWords(unitId: string) {
  return request<{ words: Word[] }>(`/units/${unitId}/words`)
}

export function fetchToday() {
  return request<TodayTask>('/study/today')
}

export function submitSession(
  answers: { wordId: string; correct: boolean }[],
  mode: 'normal' | 'review' = 'normal',
) {
  return request<SessionResult>('/study/sessions', {
    method: 'POST',
    data: { answers, mode },
  })
}

export function fetchReview() {
  return request<{
    needChild: boolean
    words: Word[]
    totalWrong: number
  }>('/study/review')
}

export function fetchWrongWords() {
  return request<{ items: WrongWord[] }>('/wrong-words')
}

export function fetchWeekly() {
  return request<WeeklyReport>('/reports/weekly')
}

export function fetchPlans() {
  return request<{ items: Plan[] }>('/membership/plans', { auth: false })
}

export function fetchMembership() {
  return request<MembershipStatus>('/membership/status')
}

export function createOrder(planId: string) {
  return request<CreatedOrder>('/membership/orders', {
    method: 'POST',
    data: { planId },
  })
}

export function mockPay(orderId: string) {
  return request<MembershipStatus>(`/membership/orders/${orderId}/mock-pay`, {
    method: 'POST',
  })
}

export function fetchReminder() {
  return request<ReminderStatus>('/reminders/status')
}

export function setReminderEnabled(enabled: boolean) {
  return request<ReminderStatus>('/reminders/enabled', {
    method: 'POST',
    data: { enabled },
  })
}

export function mockSendReminder() {
  return request<ReminderSendResult>('/reminders/mock-send', { method: 'POST' })
}
