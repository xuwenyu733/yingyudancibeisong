export interface AvatarOption {
  id: string
  label: string
  color: string
  bg: string
}

export const AVATAR_OPTIONS: AvatarOption[] = [
  { id: 'mint', label: '薄荷绿', color: '#2eb086', bg: '#d9f3e8' },
  { id: 'orange', label: '暖橙色', color: '#f59a3a', bg: '#ffe8cc' },
  { id: 'sky', label: '天空蓝', color: '#3b82f6', bg: '#dbeafe' },
  { id: 'violet', label: '葡萄紫', color: '#8b5cf6', bg: '#ede9fe' },
]

export function avatarDataUrl(option: AvatarOption, name = '词') {
  const letter = (name.trim()[0] || '词').toUpperCase()
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
  <circle cx="40" cy="40" r="40" fill="${option.bg}"/>
  <circle cx="40" cy="40" r="30" fill="${option.color}"/>
  <text x="40" y="52" text-anchor="middle" fill="#ffffff" font-size="30" font-family="Nunito, PingFang SC, Microsoft YaHei, sans-serif" font-weight="700">${letter}</text>
</svg>`.trim()
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function resolveAvatar(name?: string) {
  const id = localStorage.getItem('wq_avatar_id') || AVATAR_OPTIONS[0].id
  const option = AVATAR_OPTIONS.find((item) => item.id === id) || AVATAR_OPTIONS[0]
  const stored = localStorage.getItem('wq_avatar')
  if (stored?.startsWith('data:image/svg+xml')) return stored
  return avatarDataUrl(option, name || localStorage.getItem('wq_nickname') || '词')
}
