import { request } from './http'
import type {
  AdminUser,
  AuditRow,
  ChildRow,
  DashboardStats,
  OrderRow,
  PageResult,
  ParentRow,
  PlanRow,
  ShopItem,
  TaskDef,
  Textbook,
  Unit,
  Word,
} from '../types'

function qs(params: Record<string, string | number | undefined>) {
  const sp = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue
    sp.set(key, String(value))
  }
  const text = sp.toString()
  return text ? `?${text}` : ''
}

export function login(username: string, password: string) {
  return request<{ token: string; user: AdminUser }>('/admin/auth/login', {
    method: 'POST',
    data: { username, password },
    auth: false,
  })
}

export function fetchMe() {
  return request<AdminUser>('/admin/me')
}

export function fetchDashboard() {
  return request<DashboardStats>('/admin/dashboard')
}

export function fetchAudits(params: {
  q?: string
  page?: number
  pageSize?: number
} = {}) {
  return request<PageResult<AuditRow>>(`/admin/audits${qs(params)}`)
}

export function fetchTextbooks() {
  return request<Textbook[]>('/admin/textbooks')
}

export function upsertTextbook(data: Omit<Textbook, '_count'>) {
  return request<Textbook>('/admin/textbooks', { method: 'POST', data })
}

export function deleteTextbook(id: string) {
  return request<{ ok: boolean }>(`/admin/textbooks/${id}`, { method: 'DELETE' })
}

export function fetchUnits(textbookId?: string) {
  const q = textbookId ? `?textbookId=${encodeURIComponent(textbookId)}` : ''
  return request<Unit[]>(`/admin/units${q}`)
}

export function upsertUnit(data: Omit<Unit, '_count'>) {
  return request<Unit>('/admin/units', { method: 'POST', data })
}

export function deleteUnit(id: string) {
  return request<{ ok: boolean }>(`/admin/units/${id}`, { method: 'DELETE' })
}

export function fetchWords(params: {
  unitId?: string
  q?: string
  page?: number
  pageSize?: number
} = {}) {
  return request<PageResult<Word>>(`/admin/words${qs(params)}`)
}

export function upsertWord(
  data: Partial<Word> &
    Pick<Word, 'unitId' | 'spelling' | 'phonetic' | 'meaning' | 'example'>,
) {
  return request<Word>('/admin/words', { method: 'POST', data })
}

export function deleteWord(id: string) {
  return request<{ ok: boolean }>(`/admin/words/${id}`, { method: 'DELETE' })
}

export function fetchParents(params: {
  q?: string
  page?: number
  pageSize?: number
} = {}) {
  return request<PageResult<ParentRow>>(`/admin/parents${qs(params)}`)
}

export function fetchChildren(params: {
  q?: string
  page?: number
  pageSize?: number
} = {}) {
  return request<PageResult<ChildRow>>(`/admin/children${qs(params)}`)
}

export function fetchOrders(params: {
  q?: string
  status?: string
  page?: number
  pageSize?: number
} = {}) {
  return request<PageResult<OrderRow>>(`/admin/orders${qs(params)}`)
}

export function fetchShop() {
  return request<ShopItem[]>('/admin/shop')
}

export function upsertShop(data: ShopItem) {
  return request<ShopItem>('/admin/shop', { method: 'POST', data })
}

export function deleteShop(id: string) {
  return request<{ ok: boolean }>(`/admin/shop/${id}`, { method: 'DELETE' })
}

export function fetchTasks() {
  return request<TaskDef[]>('/admin/tasks')
}

export function upsertTask(data: TaskDef) {
  return request<TaskDef>('/admin/tasks', { method: 'POST', data })
}

export function deleteTask(id: string) {
  return request<{ ok: boolean }>(`/admin/tasks/${id}`, { method: 'DELETE' })
}

export function fetchPlans() {
  return request<PlanRow[]>('/admin/plans')
}

export function upsertPlan(data: {
  planId: string
  name: string
  price: number
  days: number
  highlight: boolean
  desc: string
}) {
  return request('/admin/plans', { method: 'POST', data })
}

export function fetchAdmins() {
  return request<AdminUser[]>('/admin/admins')
}

export function createAdmin(data: {
  username: string
  password: string
  role: 'ADMIN' | 'SUPER_ADMIN'
}) {
  return request<AdminUser>('/admin/admins', { method: 'POST', data })
}

export function updateAdmin(
  id: string,
  data: { password?: string; role?: 'ADMIN' | 'SUPER_ADMIN'; enabled?: boolean },
) {
  return request<AdminUser>(`/admin/admins/${id}`, { method: 'PATCH', data })
}

export function creditWallet(
  childId: string,
  data: { amount: number; reason: string; eventId?: string },
) {
  return request(`/admin/wallets/${childId}/credit`, { method: 'POST', data })
}
