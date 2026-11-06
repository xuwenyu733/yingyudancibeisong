<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { fetchTextbooks, fetchToday, fetchWeekly, fetchWrongWords } from '../api'
import type { Textbook, TodayTask, WeeklyReport } from '../types/api'
import { errorMessage, gradeLabel } from '../utils/format'

const task = ref<TodayTask | null>(null)
const books = ref<Textbook[]>([])
const weekly = ref<WeeklyReport | null>(null)
const wrongCount = ref(0)
const errorText = ref('')
const router = useRouter()

const isJunior = computed(() => (task.value?.child?.grade || 0) >= 7)
const progress = computed(() => {
  const limit = task.value?.dailyLimit || 1
  const done = task.value?.studiedToday || 0
  return Math.min(100, Math.round((done / limit) * 100))
})
const canStart = computed(() => (task.value?.words.length || 0) > 0)
const currentBook = computed(() => {
  const id = task.value?.textbook?.id
  return books.value.find((item) => item.id === id) || books.value[0] || null
})
const routeUnits = computed(() => currentBook.value?.units || [])
const dailyGoal = computed(() => Number(localStorage.getItem('wq_daily_goal') || task.value?.dailyLimit || 10))
const points = computed(() => weekly.value?.studiedCount || task.value?.studiedToday || 0)
const greeting = computed(() => {
  const name = task.value?.child?.nickname || '小朋友'
  return isJunior.value
    ? `今天，也进步一点点`
    : `你好，${name}！每天一点点，英语大不同`
})
const heroTitle = computed(() =>
  isJunior.value ? '按自己的节奏，完成今天的学习' : '今天，去单词森林探险',
)
const ctaLabel = computed(() => {
  if (!task.value) return '加载中...'
  if (!canStart.value) return '今日额度已用完'
  return isJunior.value ? '继续今日学习 >' : '继续闯关 >'
})
const recentDays = computed(() => {
  const days = weekly.value?.daily.slice(-5) || []
  return days.map((item, index) => ({
    label: `Day ${index + 1}`,
    done: item.count > 0,
    today: index === days.length - 1,
    count: item.count,
  }))
})

onMounted(() => {
  Promise.all([fetchToday(), fetchTextbooks(), fetchWeekly(), fetchWrongWords()])
    .then(([today, textbookResult, report, wrong]) => {
      task.value = today
      books.value = textbookResult.items
      weekly.value = report
      wrongCount.value = wrong.items.length
    })
    .catch((error: unknown) => {
      errorText.value = errorMessage(error)
    })
})

function start() {
  const unitId = task.value?.unit?.id
  void router.push(unitId ? { path: '/study', query: { unitId } } : '/study')
}
</script>

<template>
  <section class="page page-wide home">
    <header class="top">
      <div>
        <h1>{{ greeting }}</h1>
        <p class="muted">{{ heroTitle }}</p>
      </div>
      <div class="top-meta">
        <span class="chip">📅 连续学习 {{ task?.streak || 0 }} 天</span>
        <span class="chip">⭐ {{ points }} 积分</span>
        <router-link class="parent" to="/parent">家长入口</router-link>
      </div>
    </header>

    <div v-if="errorText" class="card">{{ errorText }}</div>
    <div v-else-if="task?.needChild" class="card">
      <h2>先给孩子建档</h2>
      <p class="muted">建档后才能开始今日任务。</p>
      <button class="btn" @click="router.push('/child')">创建档案</button>
    </div>

    <div v-else class="board">
      <div class="top-row">
        <div class="card hero">
          <div class="hero-copy">
            <span class="tag">{{ task?.textbook?.name || '同步词库' }} · {{ task?.unit?.title || '今日任务' }}</span>
            <h2>
              {{
                isJunior
                  ? task?.unit?.title || 'Unit · School life'
                  : task?.unit?.title || '打个招呼，认识新朋友'
              }}
            </h2>
            <p class="muted">
              今日目标 {{ dailyGoal }} 个单词，已经完成 {{ task?.studiedToday || 0 }} 个
            </p>
            <div class="progress"><span :style="{ width: progress + '%' }" /></div>
            <div class="hero-actions">
              <button class="btn" :disabled="!canStart" @click="start">{{ ctaLabel }}</button>
              <p class="muted motto">按自己的节奏，慢慢来就好</p>
            </div>
            <button
              v-if="task && !task.member"
              class="btn line member"
              @click="router.push('/member')"
            >
              开通学期会员
            </button>
          </div>
        </div>

        <aside class="card route">
          <div class="route-title">
            <span>{{ isJunior ? '学习路线' : '我的冒险路线' }}</span>
          </div>
          <div class="route-scroll">
            <ol>
              <li
                v-for="(unit, index) in routeUnits"
                :key="unit.id"
                :class="{
                  done: index === 0 && (task?.studiedToday || 0) > 0,
                  current: task?.unit?.id === unit.id,
                  locked: unit.locked,
                }"
              >
                <span class="dot">{{ unit.locked ? '🔒' : index === 0 ? '✓' : index + 1 }}</span>
                <div>
                  <strong>{{ isJunior ? `主题 ${index + 1} · ${unit.title}` : unit.title }}</strong>
                  <small>{{ unit.locked ? '待解锁' : unit.wordCount + ' 词' }}</small>
                </div>
              </li>
            </ol>
            <p v-if="!routeUnits.length" class="muted">加载路线中...</p>
          </div>
        </aside>
      </div>

      <div class="modules">
        <button class="card module" type="button" @click="start">
          <div class="icon">📖</div>
          <strong>新词学习</strong>
          <span>{{ task?.studiedToday || 0 }}/{{ task?.dailyLimit || dailyGoal }} 词</span>
        </button>
        <button class="card module" type="button" @click="router.push('/wrong')">
          <div class="icon">🔁</div>
          <strong>{{ isJunior ? '到期复习' : '温故知新' }}</strong>
          <span>{{ wrongCount }}/{{ Math.max(wrongCount, 8) }} 词</span>
        </button>
        <button
          v-if="isJunior"
          class="card module"
          type="button"
          @click="router.push('/report')"
        >
          <div class="icon">📊</div>
          <strong>本周掌握</strong>
          <span>{{ points }} 词</span>
        </button>
        <button
          v-else
          class="card module"
          type="button"
          @click="router.push('/partner')"
        >
          <div class="icon">🏠</div>
          <strong>伙伴小屋</strong>
          <span>学习赚积分，装扮小屋</span>
        </button>
      </div>

      <div v-if="isJunior" class="card rhythm">
        <div class="row">
          <div>
            <h3>学习节奏</h3>
            <p class="muted">最近一周的学习足迹</p>
          </div>
          <div class="goal-box">
            <strong>给自己的小目标</strong>
            <span>每天一点，稳稳向前</span>
          </div>
        </div>
        <div class="bars">
          <div v-for="item in weekly?.daily || []" :key="item.date" class="bar-col">
            <div class="bar" :style="{ height: Math.max(8, item.count * 4) + 'px' }" />
            <span>{{ item.date.slice(5) }}</span>
          </div>
        </div>
      </div>

      <div v-else class="card streak">
        <div class="row">
          <div>
            <h3>每一点努力都算数</h3>
            <p class="muted">最近 {{ recentDays.length || 5 }} 天的学习记录</p>
          </div>
          <router-link class="link" to="/member">学习权益 ></router-link>
        </div>
        <div class="days">
          <div
            v-for="day in recentDays"
            :key="day.label"
            class="day"
            :class="{ done: day.done, today: day.today }"
          >
            <span>{{ day.done ? '✓' : '·' }}</span>
            <small>{{ day.label }}</small>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.top {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 18px;
}

.top h1 {
  margin: 0;
  font-size: 30px;
}

.top-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: flex-end;
}

.parent {
  color: var(--brand-dark);
  font-weight: 750;
}

.board {
  display: grid;
  gap: 16px;
}

.top-row {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(240px, 0.65fr);
  gap: 16px;
  align-items: stretch;
}

.hero {
  margin-bottom: 0;
  min-height: 280px;
  background: linear-gradient(135deg, #fff 0%, #f4fbf7 60%, #fff6e8 100%);
}

.hero h2 {
  font-size: 28px;
  margin-top: 12px;
}

.progress {
  margin: 16px 0 18px;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  align-items: center;
}

.motto {
  margin: 0;
}

.member {
  margin-top: 12px;
}

.modules {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.module {
  text-align: left;
  margin: 0;
  display: grid;
  gap: 6px;
  cursor: pointer;
}

.module .icon {
  font-size: 28px;
}

.module span {
  color: var(--muted);
  font-size: 13px;
}

.route {
  display: flex;
  flex-direction: column;
  margin-bottom: 0;
  /* 高度跟左侧学习卡走，内容再长也只在内部滚动 */
  height: 0;
  min-height: 100%;
  overflow: hidden;
}

.route-title {
  font-weight: 800;
  margin-bottom: 12px;
  flex-shrink: 0;
}

.route-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 6px;
  scrollbar-width: thin;
}

ol {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 14px;
}

li {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  opacity: 0.55;
}

li.current,
li.done {
  opacity: 1;
}

li.current {
  padding: 10px;
  border-radius: 16px;
  background: var(--brand-soft);
}

.dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: #eef3f0;
  font-size: 12px;
}

li.done .dot,
li.current .dot {
  background: var(--brand);
  color: #fff;
}

li strong {
  display: block;
}

li small {
  color: var(--muted);
}

.days {
  display: flex;
  gap: 14px;
  margin-top: 16px;
}

.day {
  width: 56px;
  height: 72px;
  border-radius: 18px;
  background: #f3f7f5;
  display: grid;
  place-items: center;
  color: var(--muted);
}

.day.done {
  background: var(--brand-soft);
  color: var(--brand-dark);
}

.day.today {
  background: var(--orange-soft);
  color: #c56a12;
}

.link {
  color: var(--brand-dark);
  font-weight: 700;
}

.bars {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  height: 120px;
  margin-top: 16px;
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

.bar {
  width: 18px;
  border-radius: 999px;
  background: var(--brand);
}

.goal-box {
  padding: 12px 14px;
  border-radius: 16px;
  background: var(--orange-soft);
  display: grid;
  gap: 4px;
}

.goal-box span {
  color: var(--muted);
  font-size: 13px;
}

@media (max-width: 980px) {
  .top-row,
  .modules {
    grid-template-columns: 1fr;
  }

  .route {
    max-height: 280px;
  }

  .top {
    flex-direction: column;
  }
}
</style>
