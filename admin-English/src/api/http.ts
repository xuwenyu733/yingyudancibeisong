const BASE_URL = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:3010/api'

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  data?: unknown
  auth?: boolean
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const auth = options.auth !== false
  const token = localStorage.getItem('wq_admin_token')
  if (auth && !token) {
    window.location.assign('/login')
    throw new Error('请先登录')
  }

  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.data === undefined ? undefined : JSON.stringify(options.data),
    })
  } catch {
    throw new Error('网络异常，请确认后端已启动')
  }

  if (response.ok) {
    if (response.status === 204) return undefined as T
    return response.json() as Promise<T>
  }

  const body = (await response.json().catch(() => ({}))) as {
    message?: string | string[]
  }
  const message = Array.isArray(body.message) ? body.message[0] : body.message

  if (response.status === 401) {
    localStorage.removeItem('wq_admin_token')
    localStorage.removeItem('wq_admin_user')
    if (!window.location.pathname.startsWith('/login')) {
      window.location.assign('/login')
    }
    throw new Error(message || '登录已失效，请重新登录')
  }

  if (response.status === 403) {
    throw new Error(message || '权限不足，需要超级管理员')
  }

  throw new Error(message || `请求失败 (${response.status})`)
}
