import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSessionStore = defineStore('session', () => {
  const token = ref(localStorage.getItem('wq_token') || '')

  function setToken(value: string) {
    token.value = value
    localStorage.setItem('wq_token', value)
  }

  function logout() {
    token.value = ''
    localStorage.removeItem('wq_token')
  }

  return { token, setToken, logout }
})
