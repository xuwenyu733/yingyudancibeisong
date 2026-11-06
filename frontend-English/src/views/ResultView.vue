<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const correct = computed(() => Number(route.query.correct || 0))
const total = computed(() => Number(route.query.total || 0))
const isReview = computed(() => route.query.mode === 'review')
const accuracy = computed(() =>
  total.value === 0 ? 0 : Math.round((correct.value / total.value) * 100),
)
const message = computed(() => {
  if (isReview.value) {
    return accuracy.value >= 80
      ? '错词清得不错，答对的词已移出错词本。'
      : '还有没记住的，过一会儿再复习一次。'
  }
  return accuracy.value >= 80
    ? '这一关很稳，家长会看到进步。'
    : '错词已记入错词本，稍后再练一次。'
})
</script>

<template>
  <section class="result-page">
    <div class="card result">
      <div class="kicker">{{ isReview ? '复习完成' : '本关完成' }}</div>
      <div class="score">{{ accuracy }}%</div>
      <h1>答对 {{ correct }} / {{ total }}</h1>
      <p class="muted">{{ message }}</p>
      <div class="actions">
        <button
          class="btn"
          @click="router.push(isReview ? { path: '/study', query: { mode: 'review' } } : '/study')"
        >
          {{ isReview ? '再复习一次' : '再闯一关' }}
        </button>
        <button class="btn line" @click="router.push(isReview ? '/wrong' : '/home')">
          {{ isReview ? '回错词本' : '回到首页' }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.result-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  background:
    radial-gradient(900px 320px at 15% 0%, #fff6df 0%, transparent 55%),
    linear-gradient(180deg, #fbfaf7 0%, #eef6ef 100%);
}

.result {
  width: min(480px, 100%);
  text-align: center;
  padding: 48px 28px;
  margin: 0;
}

.score {
  font-size: 72px;
  font-weight: 800;
  color: var(--brand);
  line-height: 1;
  margin: 8px 0;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  margin-top: 8px;
}
</style>
