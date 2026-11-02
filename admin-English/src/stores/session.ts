import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as api from '../api'
import type { AdminUser } from '../types'

const TOKEN_KEY = 'wq_admin_token'
const USER_KEY = 'wq_admin_user'

function readUser(): AdminUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as AdminUser) : null
  } catch {
    return null
  }
}

export const useSessionStore = defineStore('session', () => {
  const token = ref(localStorage.getItem(TOKEN_KEY) || '')
  const user = ref<AdminUser | null>(readUser())
  const notice = ref('')

  const isSuper = computed(() => user.value?.role === 'SUPER_ADMIN')
  const isLoggedIn = computed(() => Boolean(token.value))

  async function login(username: string, password: string) {
    const res = await api.login(username, password)
    token.value = res.token
    user.value = res.user
    localStorage.setItem(TOKEN_KEY, res.token)
    localStorage.setItem(USER_KEY, JSON.stringify(res.user))
  }

  function logout() {
    token.value = ''
    user.value = null
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }

  async function refreshMe() {
    if (!token.value) return
    const me = await api.fetchMe()
    user.value = me
    localStorage.setItem(USER_KEY, JSON.stringify(me))
  }

  function flash(message: string) {
    notice.value = message
    window.setTimeout(() => {
      if (notice.value === message) notice.value = ''
    }, 3200)
  }

  function clearNotice() {
    notice.value = ''
  }

  return {
    token,
    user,
    notice,
    isSuper,
    isLoggedIn,
    login,
    logout,
    refreshMe,
    flash,
    clearNotice,
  }
})
