<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { fetchWeekly } from '../api'
import type { WeeklyReport } from '../types/api'
import { errorMessage } from '../utils/format'
import { createWeeklyPosterDataUrl } from '../utils/poster'

const report = ref<WeeklyReport | null>(null)
const errorText = ref('')
const posterUrl = ref('')
const making = ref(false)
const title = computed(() =>
  report.value?.child ? `${report.value.child.nickname}的学习周报` : '学习周报',
)
const maxCount = computed(() => Math.max(1, ...(report.value?.daily.map((item) => item.count) || [1])))

function barHeight(count: number) {
  return `${Math.max(8, Math.round((count / maxCount.value) * 120))}px`
}

function makePoster() {
  if (!report.value) return
  making.value = true
  errorText.value = ''
  try {
    posterUrl.value = createWeeklyPosterDataUrl({
      title: title.value,
      report: report.value,
    })
  } catch (error) {
    errorText.value = errorMessage(error)
  } finally {
    making.value = false
  }
}

function downloadPoster() {
  if (!posterUrl.value) return
  const link = document.createElement('a')
  link.href = posterUrl.value
  link.download = `${title.value}.png`
  link.click()
}

onMounted(() => {
  fetchWeekly()
    .then((result) => {
      report.value = result
    })
    .catch((error: unknown) => {
      errorText.value = errorMessage(error)
    })
})
</script>

<template>
  <section class="page">
    <p v-if="errorText" class="card">{{ errorText }}</p>
    <div class="card">
      <div class="kicker">近 7 天</div>
      <h1>{{ title }}</h1>
      <div class="stats">
        <div><div class="num">{{ report?.studiedCount || 0 }}</div><div class="muted">词次</div></div>
        <div><div class="num">{{ report?.accuracy || 0 }}%</div><div class="muted">正确率</div></div>
        <div><div class="num">{{ report?.streak || 0 }}</div><div class="muted">连续天数</div></div>
      </div>
      <div class="bars">
        <div v-for="item in report?.daily || []" :key="item.date" class="bar-col">
          <div class="bar" :style="{ height: barHeight(item.count) }" />
          <span>{{ item.date.slice(5) }}</span>
        </div>
      </div>
      <button class="btn" :disabled="!report || making" @click="makePoster">
        {{ making ? '生成中...' : '生成分享海报' }}
      </button>
    </div>
    <div class="card">
      <h2>薄弱词</h2>
      <p v-if="!report?.wrongTop.length" class="muted">最近没有反复出错的词。</p>
      <div v-for="word in report?.wrongTop || []" :key="word.spelling" class="row weak">
        <span>{{ word.spelling }} · {{ word.meaning }}</span>
        <span class="lock">错 {{ word.wrongCount }}</span>
      </div>
    </div>
    <div v-if="posterUrl" class="card">
      <h2>海报预览</h2>
      <img class="poster" :src="posterUrl" :alt="title" />
      <button class="btn" @click="downloadPoster">下载 PNG</button>
    </div>
  </section>
</template>

<style scoped>
.bars {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  height: 160px;
  margin-top: 20px;
  margin-bottom: 18px;
}

.bar-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: #6b7689;
  font-size: 12px;
}

.bar {
  width: 16px;
  border-radius: 999px;
  background: #3d7eff;
}

.weak {
  padding: 10px 0;
  border-top: 1px solid #eef2f7;
}

.lock {
  color: #d97706;
  font-weight: 700;
}

.poster {
  display: block;
  width: min(100%, 360px);
  margin: 12px 0 16px;
  border-radius: 16px;
  background: #eef2f7;
}
</style>
