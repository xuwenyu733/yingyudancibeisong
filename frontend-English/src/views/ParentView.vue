<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  fetchChildren,
  fetchMembership,
  fetchReminder,
  fetchTextbooks,
  fetchWeekly,
  mockSendReminder,
  selectChild,
  setReminderEnabled,
  updateChildTextbook,
} from '../api'
import { useSessionStore } from '../stores/session'
import type {
  Child,
  MembershipStatus,
  ReminderStatus,
  Textbook,
  WeeklyReport,
} from '../types/api'
import { errorMessage, gradeLabel } from '../utils/format'

const children = ref<Child[]>([])
const currentId = ref('')
const report = ref<WeeklyReport | null>(null)
const status = ref<MembershipStatus | null>(null)
const reminder = ref<ReminderStatus | null>(null)
const books = ref<Textbook[]>([])
const textbookId = ref('')
const errorText = ref('')
const testing = ref(false)
const router = useRouter()
const session = useSessionStore()

const current = computed(() => children.value.find((item) => item.id === currentId.value))
const childText = computed(() =>
  current.value ? `${current.value.nickname} · ${gradeLabel(current.value.grade)}` : '还没有孩子档案',
)
const gradeBooks = computed(() =>
  current.value ? books.value.filter((item) => item.grade === current.value!.grade) : [],
)
const memberText = computed(() => (status.value?.active ? status.value.planName || '会员生效中' : '尚未开通'))
const memberHint = computed(() =>
  status.value?.active && status.value.endAt
    ? `有效期至 ${status.value.endAt.slice(0, 10)}`
    : '开通后解锁全部单元，每日 30 词',
)
const reminderTitle = computed(() => {
  if (!reminder.value) return '加载中'
  return reminder.value.studiedToday ? '今天已打卡' : '今天还没打卡'
})
const reminderHint = computed(() => {
  if (!reminder.value) return ''
  const modeText = reminder.value.mode === 'wechat' ? '真实微信推送' : '开发模拟推送'
  return `${modeText}。微信订阅授权请在小程序里完成。`
})

async function load() {
  const [childResult, weekly, membership, reminderStatus, textbookResult] =
    await Promise.all([
      fetchChildren(),
      fetchWeekly(),
      fetchMembership(),
      fetchReminder(),
      fetchTextbooks(),
    ])
  children.value = childResult.items
  currentId.value = childResult.currentChildId || ''
  report.value = weekly
  status.value = membership
  reminder.value = reminderStatus
  books.value = textbookResult.items
  textbookId.value = childResult.items.find((item) => item.id === currentId.value)
    ?.textbookId || ''
}

onMounted(() => {
  load().catch((error: unknown) => {
    errorText.value = errorMessage(error)
  })
})

async function onSwitch() {
  if (!currentId.value) return
  await selectChild(currentId.value)
  await load()
}

async function onTextbookChange() {
  if (!currentId.value || !textbookId.value) return
  try {
    await updateChildTextbook(currentId.value, textbookId.value)
    await load()
  } catch (error) {
    errorText.value = errorMessage(error)
  }
}

async function onToggle(event: Event) {
  const target = event.target as HTMLInputElement
  try {
    reminder.value = await setReminderEnabled(target.checked)
  } catch (error) {
    errorText.value = errorMessage(error)
    await load()
  }
}

async function testSend() {
  testing.value = true
  errorText.value = ''
  try {
    const result = await mockSendReminder()
    errorText.value = `${result.status}: ${result.reason}`
    reminder.value = await fetchReminder()
  } catch (error) {
    errorText.value = errorMessage(error)
  } finally {
    testing.value = false
  }
}

function logout() {
  session.logout()
  void router.push('/login')
}
</script>

<template>
  <section class="page">
    <p v-if="errorText" class="card">{{ errorText }}</p>
    <div class="card">
      <div class="kicker">当前孩子</div>
      <h1>{{ childText }}</h1>
      <select v-if="children.length > 1" v-model="currentId" class="field" @change="onSwitch">
        <option v-for="child in children" :key="child.id" :value="child.id">{{ child.nickname }}</option>
      </select>
      <select
        v-if="gradeBooks.length"
        v-model="textbookId"
        class="field"
        @change="onTextbookChange"
      >
        <option v-for="book in gradeBooks" :key="book.id" :value="book.id">
          {{ book.volume }} · {{ book.name }}
        </option>
      </select>
      <button class="btn line block" @click="router.push('/child')">再添加一个孩子</button>
    </div>
    <div class="card">
      <div class="kicker">本周</div>
      <div class="stats">
        <div><div class="num">{{ report?.studiedCount || 0 }}</div><div class="muted">学习词次</div></div>
        <div><div class="num">{{ report?.accuracy || 0 }}%</div><div class="muted">正确率</div></div>
        <div><div class="num">{{ report?.activeDays || 0 }}</div><div class="muted">打卡天数</div></div>
      </div>
      <button class="btn block" @click="router.push('/report')">查看周报</button>
    </div>
    <div class="card">
      <div class="kicker">打卡提醒</div>
      <h2>{{ reminderTitle }}</h2>
      <p class="muted">{{ reminderHint }}</p>
      <label class="toggle">
        <span>每日提醒</span>
        <input type="checkbox" :checked="reminder?.enabled" @change="onToggle" />
      </label>
      <button class="btn line" :disabled="testing" @click="testSend">
        {{ testing ? '发送中...' : '测试推送' }}
      </button>
    </div>
    <div class="card">
      <div class="kicker">会员</div>
      <h2>{{ memberText }}</h2>
      <p class="muted">{{ memberHint }}</p>
      <button class="btn" @click="router.push('/member')">{{ status?.active ? '续费会员' : '开通会员' }}</button>
    </div>
    <button class="btn line" @click="logout">退出登录</button>
  </section>
</template>

<style scoped>
.toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 16px 0;
}
</style>
