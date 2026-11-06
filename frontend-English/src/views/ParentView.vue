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
import { resolveAvatar } from '../utils/avatar'
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
const reminderTime = ref(localStorage.getItem('wq_reminder_time') || '20:00')
const router = useRouter()
const session = useSessionStore()
const avatar = ref(resolveAvatar())

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
const maxCount = computed(() => Math.max(1, ...(report.value?.daily.map((item) => item.count) || [1])))
const weekday = ['一', '二', '三', '四', '五', '六', '日']

function barHeight(count: number) {
  return `${Math.max(8, Math.round((count / maxCount.value) * 120))}px`
}

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
  const currentChild =
    childResult.items.find((item) => item.id === currentId.value) || childResult.items[0]
  textbookId.value = currentChild?.textbookId || ''
  avatar.value = resolveAvatar(currentChild?.nickname)
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

function saveTime() {
  localStorage.setItem('wq_reminder_time', reminderTime.value)
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
  <section class="page page-wide">
    <header class="head">
      <div>
        <h1>家长中心</h1>
        <p class="muted">每一点进步，都值得被看见</p>
      </div>
      <button class="btn line" type="button" @click="router.push('/home')">返回孩子的学习页</button>
    </header>

    <p v-if="errorText" class="card">{{ errorText }}</p>

    <div class="card child">
      <div class="child-main">
        <img :src="avatar" alt="" />
        <div>
          <div class="name-row">
            <h2>{{ childText }}</h2>
            <span class="tag green">当前孩子</span>
          </div>
          <select
            v-if="gradeBooks.length"
            v-model="textbookId"
            class="field compact"
            @change="onTextbookChange"
          >
            <option v-for="book in gradeBooks" :key="book.id" :value="book.id">
              {{ book.publisher }} · {{ book.name }} · {{ book.volume }}
            </option>
          </select>
          <p class="muted">学习教材随时可调整</p>
        </div>
      </div>
      <div class="child-actions">
        <select
          v-if="children.length > 1"
          v-model="currentId"
          class="field compact"
          @change="onSwitch"
        >
          <option v-for="child in children" :key="child.id" :value="child.id">
            切换：{{ child.nickname }}
          </option>
        </select>
        <button class="btn line" type="button" @click="router.push('/child')">添加孩子</button>
      </div>
    </div>

    <div class="stats-row">
      <div class="card stat">
        <div class="icon">📖</div>
        <div class="muted">学习词次</div>
        <div class="num">{{ report?.studiedCount || 0 }}</div>
      </div>
      <div class="card stat">
        <div class="icon">✅</div>
        <div class="muted">答题正确率</div>
        <div class="num">{{ report?.accuracy || 0 }}%</div>
      </div>
      <div class="card stat">
        <div class="icon">📅</div>
        <div class="muted">打卡天数</div>
        <div class="num">{{ report?.activeDays || 0 }}天</div>
      </div>
    </div>
    <p class="muted sample">本周学习概览</p>

    <div class="split">
      <div class="card chart">
        <div class="row">
          <h3>这一周的学习足迹</h3>
          <button class="btn line small" type="button" @click="router.push('/report')">
            查看完整周报
          </button>
        </div>
        <div class="bars">
          <div v-for="(item, index) in report?.daily || []" :key="item.date" class="bar-col">
            <strong>{{ item.count }}</strong>
            <div class="bar" :style="{ height: barHeight(item.count) }" />
            <span>周{{ weekday[index] || item.date.slice(5) }}</span>
          </div>
        </div>
        <div class="total">合计 {{ report?.studiedCount || 0 }}</div>
      </div>

      <div class="card remind">
        <h3>学习提醒</h3>
        <label class="toggle">
          <span>每日提醒</span>
          <input type="checkbox" :checked="reminder?.enabled" @change="onToggle" />
        </label>
        <label class="label">提醒时间</label>
        <select v-model="reminderTime" class="field" @change="saveTime">
          <option>19:00</option>
          <option>19:30</option>
          <option>20:00</option>
          <option>20:30</option>
          <option>21:00</option>
        </select>
        <p class="muted">提醒发给家长，一起陪伴孩子学习</p>
        <div class="row auth">
          <span class="muted">微信通知{{ reminder?.accepted ? '已授权' : '待授权' }}</span>
          <button class="btn line small" :disabled="testing" @click="testSend">
            {{ testing ? '发送中...' : '设置提醒' }}
          </button>
        </div>
      </div>
    </div>

    <div class="card tip">
      <img src="/illustrations/fox.png" alt="" />
      <div>
        <strong>陪伴小建议</strong>
        <p class="muted">先肯定坚持，再一起复习还没记牢的单词。</p>
      </div>
    </div>

    <div class="card member">
      <div class="kicker">会员</div>
      <h3>{{ memberText }}</h3>
      <p class="muted">{{ memberHint }}</p>
      <button class="btn" @click="router.push('/member')">
        {{ status?.active ? '续费会员' : '开通会员' }}
      </button>
    </div>

    <button class="btn line" @click="logout">退出登录</button>
  </section>
</template>

<style scoped>
.head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 16px;
}

.head h1 {
  margin: 0;
  font-size: 32px;
}

.child {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: center;
}

.child-main {
  display: flex;
  gap: 16px;
  align-items: center;
}

.child-main img {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  object-fit: cover;
}

.name-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.name-row h2 {
  margin: 0;
}

.field.compact {
  margin-top: 10px;
  width: min(320px, 100%);
  height: 42px;
}

.child-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.stat {
  margin-bottom: 0;
}

.stat .icon {
  font-size: 24px;
}

.sample {
  margin: 10px 0 14px;
}

.split {
  display: grid;
  grid-template-columns: 1.3fr 0.7fr;
  gap: 14px;
  align-items: start;
}

.small {
  height: 40px;
  padding: 0 14px;
  box-shadow: none;
}

.bars {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  height: 180px;
  margin-top: 18px;
  gap: 8px;
}

.bar-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: var(--muted);
  font-size: 12px;
}

.bar-col strong {
  color: var(--ink);
  font-size: 13px;
}

.bar {
  width: 18px;
  border-radius: 999px;
  background: var(--brand);
}

.total {
  margin-top: 14px;
  display: inline-flex;
  padding: 8px 12px;
  border-radius: 12px;
  background: var(--brand-soft);
  color: var(--brand-dark);
  font-weight: 750;
}

.toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 16px 0;
  font-weight: 700;
}

.label {
  display: block;
  font-weight: 750;
}

.auth {
  margin-top: 16px;
}

.tip {
  display: flex;
  gap: 14px;
  align-items: center;
  background: linear-gradient(90deg, #fff 0%, #f5fbf8 100%);
}

.tip img {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  object-fit: cover;
}

.tip .muted {
  margin: 4px 0 0;
}

.member {
  margin-top: 4px;
}

@media (max-width: 960px) {
  .child,
  .split,
  .stats-row,
  .head {
    display: grid;
    grid-template-columns: 1fr;
  }
}
</style>
