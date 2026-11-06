<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { fetchChildren, fetchTextbooks, fetchToday } from '../api'
import type { Textbook, TodayTask, UnitView } from '../types/api'
import { errorMessage, gradeLabel } from '../utils/format'

const books = ref<Textbook[]>([])
const task = ref<TodayTask | null>(null)
const errorText = ref('')
const router = useRouter()
const stage = ref<'primary' | 'junior'>(
  (localStorage.getItem('wq_stage') as 'primary' | 'junior') || 'primary',
)
const grade = ref(3)
const volume = ref('全部')
const keyword = ref('')

const gradeOptions = computed(() =>
  stage.value === 'junior' ? [7, 8, 9] : [1, 2, 3, 4, 5, 6],
)
const volumes = computed(() => {
  const set = new Set(
    filteredByStage.value.map((item) => item.volume).filter(Boolean),
  )
  return ['全部', ...set]
})
const filteredByStage = computed(() =>
  books.value.filter((item) =>
    stage.value === 'junior' ? item.grade >= 7 : item.grade <= 6,
  ),
)
const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  return filteredByStage.value.filter((item) => {
    if (grade.value && item.grade !== grade.value) return false
    if (volume.value !== '全部' && item.volume !== volume.value) return false
    if (!q) return true
    return (
      item.name.toLowerCase().includes(q) ||
      item.publisher.toLowerCase().includes(q) ||
      item.units.some((unit) => unit.title.toLowerCase().includes(q))
    )
  })
})
const currentBook = computed(() => {
  const id = task.value?.textbook?.id
  return filtered.value.find((item) => item.id === id) || filtered.value[0] || null
})
const learned = computed(() => task.value?.studiedToday || 0)
const totalWords = computed(() =>
  currentBook.value?.units.reduce((sum, unit) => sum + unit.wordCount, 0) || 0,
)
const progress = computed(() => {
  if (!totalWords.value) return 0
  return Math.min(100, Math.round((learned.value / totalWords.value) * 100))
})
const nextBooks = computed(() =>
  filtered.value.filter((item) => item.id !== currentBook.value?.id).slice(0, 3),
)

onMounted(() => {
  Promise.all([fetchTextbooks(), fetchToday(), fetchChildren()])
    .then(([textbookResult, today, children]) => {
      books.value = textbookResult.items
      task.value = today
      const current =
        children.items.find((item) => item.id === children.currentChildId) || children.items[0]
      if (current) {
        grade.value = current.grade
        stage.value = current.grade >= 7 ? 'junior' : 'primary'
      } else if (!gradeOptions.value.includes(grade.value)) {
        grade.value = gradeOptions.value[0]
      }
    })
    .catch((error: unknown) => {
      errorText.value = errorMessage(error)
    })
})

function switchStage(next: 'primary' | 'junior') {
  stage.value = next
  localStorage.setItem('wq_stage', next)
  grade.value = next === 'junior' ? 7 : 3
  volume.value = '全部'
}

function openUnit(unit: UnitView) {
  if (unit.locked) {
    void router.push('/member')
    return
  }
  void router.push({ path: '/study', query: { unitId: unit.id } })
}
</script>

<template>
  <section class="page page-wide">
    <header class="head">
      <div>
        <h1>选一本单词书，开启新地图 ☀</h1>
        <p class="muted">找到和课堂同步的内容，让每次学习更有方向</p>
      </div>
      <label class="search">
        <span>🔍</span>
        <input v-model="keyword" placeholder="搜索教材或单词" />
      </label>
    </header>

    <div class="filters">
      <button class="pill" :class="{ active: stage === 'primary' }" @click="switchStage('primary')">
        小学
      </button>
      <button class="pill" :class="{ active: stage === 'junior' }" @click="switchStage('junior')">
        初中
      </button>
      <select v-model.number="grade" class="field compact">
        <option v-for="item in gradeOptions" :key="item" :value="item">{{ gradeLabel(item) }}</option>
      </select>
      <select v-model="volume" class="field compact">
        <option v-for="item in volumes" :key="item" :value="item">{{ item }}</option>
      </select>
      <span class="muted grow">查看全部教材 ></span>
    </div>

    <div v-if="errorText" class="card">{{ errorText }}</div>
    <div v-else-if="!currentBook" class="card">当前筛选下暂无教材。</div>
    <div v-else class="board">
      <div class="card current">
        <div class="book-head">
          <div class="cover">📘</div>
          <div>
            <h2>{{ currentBook.name }}</h2>
            <p class="muted">{{ currentBook.publisher }} · {{ gradeLabel(currentBook.grade) }}{{ currentBook.volume }}</p>
          </div>
        </div>
        <div class="row muted">
          <span>已学习 {{ learned }} / {{ totalWords || currentBook.units.length * 8 }} 词</span>
          <span>{{ progress }}%</span>
        </div>
        <div class="progress"><span :style="{ width: progress + '%' }" /></div>

        <button
          v-for="(unit, index) in currentBook.units"
          :key="unit.id"
          class="unit"
          @click="openUnit(unit)"
        >
          <div>
            <strong>Unit {{ index + 1 }} · {{ unit.title }}</strong>
            <span class="muted">{{ unit.wordCount }} 词</span>
          </div>
          <span :class="unit.locked ? 'lock' : 'go'">
            {{ unit.locked ? '待解锁' : index === 0 ? '继续闯关 >' : '去闯关 >' }}
          </span>
        </button>
      </div>

      <aside class="card map">
        <h3>冒险地图</h3>
        <div class="path">
          <div
            v-for="(unit, index) in currentBook.units.slice(0, 4)"
            :key="unit.id"
            class="node"
            :class="{ active: !unit.locked && index === 0, locked: unit.locked }"
          >
            <span>{{ unit.locked ? '🔒' : index === 0 ? '🦊' : '📍' }}</span>
            <strong>{{ unit.title }}</strong>
            <small>{{ unit.locked ? '待解锁' : index === 0 ? '当前学习' : '可挑战' }}</small>
          </div>
        </div>
      </aside>
    </div>

    <div class="next">
      <h3>🛤 下一段旅程</h3>
      <div class="next-grid">
        <article v-for="book in nextBooks" :key="book.id" class="card next-card">
          <div class="cover small">📗</div>
          <strong>{{ book.name }}</strong>
          <span class="muted">{{ book.publisher }} · {{ book.volume }}</span>
          <button class="btn line" type="button" @click="grade = book.grade">查看 ></button>
        </article>
        <article v-if="!nextBooks.length" class="card next-card">
          <strong>更多教材即将到来</strong>
          <span class="muted">先把当前地图走完吧</span>
        </article>
      </div>
      <p class="muted foot">
        <router-link to="/parent">学习权益请家长协助查看 ></router-link>
      </p>
    </div>
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
  font-size: 30px;
}

.search {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 240px;
  height: 44px;
  padding: 0 14px;
  border-radius: 999px;
  background: #fff;
  border: 1.5px solid var(--line);
}

.search input {
  border: 0;
  outline: none;
  width: 100%;
  background: transparent;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-bottom: 18px;
}

.field.compact {
  width: auto;
  min-width: 120px;
  margin-top: 0;
  height: 40px;
}

.grow {
  margin-left: auto;
}

.board {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
  gap: 16px;
  align-items: start;
}

.book-head {
  display: flex;
  gap: 14px;
  align-items: center;
  margin-bottom: 14px;
}

.cover {
  width: 64px;
  height: 80px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: linear-gradient(160deg, #dff4ea, #fff4df);
  font-size: 28px;
}

.cover.small {
  width: 48px;
  height: 60px;
  font-size: 22px;
}

.unit {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 12px;
  padding: 14px 0 0;
  border: 0;
  border-top: 1px solid #eef2f7;
  background: transparent;
  text-align: left;
}

.unit strong,
.unit .muted {
  display: block;
}

.go {
  color: var(--brand-dark);
  font-weight: 750;
}

.lock {
  color: #9aa7b5;
  font-weight: 700;
}

.map {
  min-height: 360px;
  background:
    linear-gradient(180deg, #f7fcf9 0%, #eef7f2 100%);
}

.path {
  display: grid;
  gap: 14px;
  margin-top: 16px;
}

.node {
  display: grid;
  grid-template-columns: 36px 1fr;
  gap: 4px 12px;
  padding: 12px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid var(--line);
}

.node span {
  grid-row: span 2;
  font-size: 22px;
  display: grid;
  place-items: center;
}

.node.active {
  border-color: var(--brand);
  background: var(--brand-soft);
}

.node.locked {
  opacity: 0.65;
}

.node small {
  color: var(--muted);
}

.next {
  margin-top: 22px;
}

.next-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-top: 12px;
}

.next-card {
  display: grid;
  gap: 8px;
  margin: 0;
}

.foot {
  margin-top: 14px;
}

.foot a {
  color: var(--brand-dark);
  font-weight: 700;
}

@media (max-width: 960px) {
  .board,
  .next-grid,
  .head {
    grid-template-columns: 1fr;
    display: grid;
  }
}
</style>
