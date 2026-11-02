<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { fetchToday } from '../api'
import type { TodayTask } from '../types/api'
import { errorMessage } from '../utils/format'

const task = ref<TodayTask | null>(null)
const errorText = ref('')
const router = useRouter()

const progress = computed(() => {
  const limit = task.value?.dailyLimit || 1
  const done = task.value?.studiedToday || 0
  return `${Math.min(100, Math.round((done / limit) * 100))}%`
})

const canStart = computed(() => (task.value?.words.length || 0) > 0)
const startLabel = computed(() => {
  if (!task.value) return '加载中...'
  if (canStart.value) return `开始 ${task.value.words.length} 词`
  return '今日额度已用完'
})

onMounted(() => {
  fetchToday()
    .then((result) => {
      task.value = result
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
  <section class="page">
    <div class="kicker">电脑端 · 看单词选中文</div>
    <h1>今天也来闯一关</h1>
    <p class="muted">连续学习 {{ task?.streak || 0 }} 天</p>

    <div v-if="errorText" class="card">{{ errorText }}</div>
    <div v-else-if="task?.needChild" class="card">
      <h2>先给孩子建档</h2>
      <p class="muted">建档后才能开始今日任务。</p>
      <button class="btn" @click="router.push('/child')">创建档案</button>
    </div>
    <div v-else class="card">
      <p class="muted">{{ task?.textbook?.name }} · {{ task?.child?.nickname }}</p>
      <h2>{{ task?.unit?.title || '今日任务' }}</h2>
      <div class="row muted">
        <span>今日 {{ task?.studiedToday || 0 }}/{{ task?.dailyLimit || 0 }}</span>
        <span>{{ task?.member ? '会员' : '免费体验' }}</span>
      </div>
      <div class="track"><div class="fill" :style="{ width: progress }" /></div>
      <button class="btn" :disabled="!canStart" @click="start">{{ startLabel }}</button>
      <button v-if="task && !task.member" class="btn line" @click="router.push('/member')">
        开通学期会员
      </button>
    </div>
  </section>
</template>

<style scoped>
.track {
  height: 8px;
  margin: 14px 0 18px;
  border-radius: 999px;
  background: #e8eef8;
  overflow: hidden;
}

.fill {
  height: 100%;
  background: #3d7eff;
}

.line {
  margin-left: 10px;
}
</style>
