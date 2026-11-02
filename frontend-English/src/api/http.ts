const BASE_URL = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:3000/api'

interface RequestOptions {
  method?: 'GET' | 'POST'
  data?: unknown
  auth?: boolean
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const auth = options.auth !== false
  const token = localStorage.getItem('wq_token')
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

  if (response.ok) return response.json() as Promise<T>

  if (response.status === 401) {
    localStorage.removeItem('wq_token')
    if (!window.location.pathname.startsWith('/login')) {
      window.location.assign('/login')
    }
  }

  const body = (await response.json().catch(() => ({}))) as { message?: string | string[] }
  const message = Array.isArray(body.message) ? body.message[0] : body.message
  throw new Error(message || '请求失败')
}
