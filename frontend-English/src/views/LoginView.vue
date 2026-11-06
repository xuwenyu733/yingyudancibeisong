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
const stage = ref<'primary' | 'junior'>(
  (localStorage.getItem('wq_stage') as 'primary' | 'junior') || 'primary',
)

function chooseStage(next: 'primary' | 'junior') {
  stage.value = next
  localStorage.setItem('wq_stage', next)
}

async function login() {
  loading.value = true
  errorText.value = ''
  localStorage.setItem('wq_stage', stage.value)
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
    <div class="panel left">
      <div class="brand-row">
        <img src="/illustrations/fox.png" alt="" />
        <div>
          <strong>单词闯关</strong>
          <span>小学 · 初中</span>
        </div>
      </div>
      <h1>让每一个单词<br />成为一次小冒险</h1>
      <p class="muted lead">从小学同步到初中进阶，陪你一点点成长</p>
      <div class="features">
        <span class="chip">📚 同步教材</span>
        <span class="chip">🏔 闯关记单词</span>
        <span class="chip">🦊 伙伴陪伴</span>
      </div>
      <div class="hero-art">
        <img src="/illustrations/fox.png" alt="" />
        <div class="float a">Aa</div>
        <div class="float b">Bb</div>
        <div class="float c">Cc</div>
      </div>
    </div>

    <div class="panel right">
      <router-link class="parent-link" to="/parent">家长入口</router-link>
      <div class="card box">
        <div class="box-head">
          <img src="/illustrations/fox.png" alt="" />
          <div>
            <h2>准备好出发了吗？</h2>
            <p class="muted">选择你的学段，开启学习之旅</p>
          </div>
        </div>

        <div class="stages">
          <button
            type="button"
            class="stage"
            :class="{ active: stage === 'primary' }"
            @click="chooseStage('primary')"
          >
            <span class="check" v-if="stage === 'primary'">✓</span>
            <div class="stage-icon">🌱</div>
            <strong>小学</strong>
            <span>1—6年级</span>
          </button>
          <button
            type="button"
            class="stage"
            :class="{ active: stage === 'junior' }"
            @click="chooseStage('junior')"
          >
            <span class="check" v-if="stage === 'junior'">✓</span>
            <div class="stage-icon">🧭</div>
            <strong>初中</strong>
            <span>7—9年级</span>
          </button>
        </div>

        <button class="btn block wechat" :disabled="loading" @click="login">
          {{ loading ? '登录中...' : '微信登录，开启学习' }}
        </button>
        <p v-if="errorText" class="error">{{ errorText }}</p>
        <p class="muted tip">首次使用，可以请家长陪你一起完成</p>
        <p class="muted foot">使用帮助 · 隐私保护</p>
        <p class="muted foot">开发环境：当前为演示登录账号</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 1.05fr 0.95fr;
  gap: 24px;
  padding: 36px 48px;
  background:
    radial-gradient(700px 280px at 20% 0%, #fff6df 0%, transparent 60%),
    linear-gradient(180deg, #fbfaf7 0%, #eef6ef 100%);
}

.panel {
  position: relative;
}

.left {
  padding: 24px 12px 12px;
}

.brand-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 48px;
}

.brand-row img {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  object-fit: cover;
}

.brand-row strong {
  display: block;
  font-size: 18px;
}

.brand-row span {
  color: var(--muted);
  font-size: 13px;
}

h1 {
  margin: 0;
  font-size: clamp(36px, 4vw, 52px);
  line-height: 1.2;
  font-weight: 850;
}

.lead {
  margin-top: 16px;
  font-size: 16px;
}

.features {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 28px;
}

.hero-art {
  position: relative;
  margin-top: 48px;
  width: min(420px, 100%);
  aspect-ratio: 1.1;
  border-radius: 36px;
  background:
    radial-gradient(circle at 50% 70%, #d9f0e3 0%, transparent 55%),
    linear-gradient(180deg, #fff8ea 0%, #e7f6ee 100%);
  display: grid;
  place-items: center;
  overflow: hidden;
}

.hero-art > img {
  width: 68%;
  border-radius: 24px;
}

.float {
  position: absolute;
  width: 54px;
  height: 54px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  font-weight: 800;
  background: #fff;
  box-shadow: var(--shadow);
  color: var(--brand-dark);
}

.float.a {
  left: 18px;
  top: 28%;
  transform: rotate(-8deg);
}

.float.b {
  right: 24px;
  top: 18%;
  transform: rotate(10deg);
  color: var(--orange);
}

.float.c {
  right: 48px;
  bottom: 18%;
  transform: rotate(-4deg);
}

.right {
  display: grid;
  place-items: center;
}

.parent-link {
  position: absolute;
  top: 8px;
  right: 18px;
  color: var(--brand-dark);
  font-weight: 700;
  font-size: 14px;
}

.box {
  width: min(460px, 100%);
  padding: 28px;
}

.box-head {
  display: flex;
  gap: 14px;
  align-items: center;
  margin-bottom: 22px;
}

.box-head img {
  width: 56px;
  height: 56px;
  border-radius: 18px;
  object-fit: cover;
}

.box-head h2 {
  margin: 0;
  font-size: 24px;
}

.stages {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.stage {
  position: relative;
  display: grid;
  gap: 6px;
  justify-items: start;
  padding: 18px 16px;
  border-radius: 20px;
  border: 1.5px solid var(--line);
  background: #fcfdfc;
  text-align: left;
  color: var(--ink);
}

.stage.active {
  border-color: var(--brand);
  background: var(--brand-soft);
  box-shadow: 0 0 0 3px rgba(46, 176, 134, 0.12);
}

.stage-icon {
  font-size: 28px;
}

.stage strong {
  font-size: 18px;
}

.stage span {
  color: var(--muted);
  font-size: 13px;
}

.check {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--brand);
  color: #fff;
  font-size: 12px;
  display: grid;
  place-items: center;
}

.wechat {
  margin-top: 20px;
}

.tip,
.foot {
  text-align: center;
}

.tip {
  margin-top: 14px;
}

.foot {
  margin-top: 6px;
  font-size: 12px;
}

.error {
  color: var(--danger);
  text-align: center;
}

@media (max-width: 960px) {
  .login {
    grid-template-columns: 1fr;
    padding: 24px;
  }

  .parent-link {
    position: static;
    justify-self: end;
    margin-bottom: 8px;
  }
}
</style>
