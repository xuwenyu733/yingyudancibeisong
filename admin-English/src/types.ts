export type AdminRole = 'ADMIN' | 'SUPER_ADMIN'

export interface PageResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface AdminUser {
  id: string
  username: string
  role: AdminRole
  enabled: boolean
  createdAt: string
}

export interface DashboardStats {
  parents: number
  children: number
  words: number
  orders: number
  paidOrders: number
  orderByStatus: Array<{ status: string; count: number }>
  last7Days: Array<{ day: string; total: number; paid: number }>
  recentAudits: Array<{
    id: string
    username: string
    action: string
    path: string
    createdAt: string
  }>
}

export interface AuditRow {
  id: string
  adminId: string | null
  username: string
  role: string
  method: string
  path: string
  action: string
  detail: string
  ip: string
  createdAt: string
}

export interface Textbook {
  id: string
  name: string
  publisher: string
  grade: number
  volume: string
  _count?: { units: number }
}

export interface Unit {
  id: string
  textbookId: string
  title: string
  order: number
  free: boolean
  _count?: { words: number }
}

export interface Word {
  id: string
  unitId: string
  spelling: string
  phonetic: string
  meaning: string
  example: string
}

export interface ParentRow {
  id: string
  nickname: string
  openid: string
  childrenCount: number
  ordersCount: number
  memberUntil: string | null
  createdAt: string
}

export interface ChildRow {
  id: string
  nickname: string
  grade: number
  parentNickname: string
  balance: number
  attempts: number
  createdAt: string
}

export interface OrderRow {
  id: string
  parentNickname: string
  planId: string
  amount: number
  status: string
  channel: string
  outTradeNo: string | null
  paidAt: string | null
  createdAt: string
}

export interface ShopItem {
  id: string
  name: string
  category: string
  price: number
  desc: string
  roomAction: string
  active: boolean
}

export interface TaskDef {
  id: string
  key: string
  title: string
  desc: string
  metric: string
  target: number
  reward: number
  sort: number
  active: boolean
}

export interface PlanRow {
  id: string
  name: string
  price: number
  days: number
  highlight: boolean
  desc: string
  overridden?: boolean
}
