<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { fetchChildren, wechatLogin } from '../api'
import { useSessionStore } from '../stores/session'
import { errorMessage } from '../utils/format'

const router = useRouter()
const session = useSessionStore()
const loading = ref(false)
const errorText = ref('')

async function login() {
  loading.value = true
  errorText.value = ''
  try {
    const result = await wechatLogin('demo-parent')
    session.setToken(result.token)
    const children = await fetchChildren()
    await router.push(children.items.length === 0 ? '/child' : '/home')
  } catch (error) {
    errorText.value = errorMessage(error)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login">
    <div class="card box">
      <div class="mark">词</div>
      <h1>小学单词闯关</h1>
      <p class="muted">家长登录后，为孩子建档并开通学习。这是电脑端。</p>
      <button class="btn block" :disabled="loading" @click="login">
        {{ loading ? '登录中...' : '开发环境登录' }}
      </button>
      <p v-if="errorText" class="error">{{ errorText }}</p>
      <p class="muted">正式版会改成微信登录。当前用固定开发账号，方便反复调试。</p>
    </div>
  </div>
</template>

<style scoped>
.login {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
}

.box {
  width: min(420px, 100%);
  text-align: center;
}

.mark {
  width: 64px;
  height: 64px;
  margin: 0 auto 8px;
  border-radius: 16px;
  background: #3d7eff;
  color: #fff;
  font-size: 32px;
  font-weight: 700;
  line-height: 64px;
}

.error {
  color: #b91c1c;
}
</style>
