<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '../stores/session'

const session = useSessionStore()
const router = useRouter()
const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''
  loading.value = true
  try {
    await session.login(username.value.trim(), password.value)
    await router.push('/dashboard')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '登录失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="brand" style="margin-bottom: 18px; padding: 0">
        <span class="mark">词</span>
        <div class="brand-copy">
          <strong style="color: #0f172a">小学单词闯关</strong>
          <span>管理后台</span>
        </div>
      </div>
      <h1>登录</h1>
      <p>管理员 / 超级管理员统一入口</p>
      <form @submit.prevent="submit">
        <label>
          用户名
          <input
            v-model="username"
            autocomplete="username"
            placeholder="请输入用户名"
            required
          />
        </label>
        <label>
          密码
          <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            placeholder="请输入密码"
            required
          />
        </label>
        <p v-if="error" class="err">{{ error }}</p>
        <button class="btn" type="submit" :disabled="loading" style="width: 100%">
          {{ loading ? '登录中…' : '进入后台' }}
        </button>
      </form>
    </div>
  </div>
</template>
