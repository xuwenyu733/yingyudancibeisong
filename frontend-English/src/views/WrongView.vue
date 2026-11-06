<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { fetchWeekly, fetchWrongWords } from '../api'
import type { WrongWord } from '../types/api'
import { errorMessage } from '../utils/format'

const items = ref<WrongWord[]>([])
const mastered = ref(0)
const errorText = ref('')
const router = useRouter()
const empty = computed(() => items.value.length === 0)

onMounted(() => {
  Promise.all([fetchWrongWords(), fetchWeekly()])
    .then(([wrong, weekly]) => {
      items.value = wrong.items
      mastered.value = weekly.studiedCount || 0
    })
    .catch((error: unknown) => {
      errorText.value = errorMessage(error)
    })
})
</script>

<template>
  <section class="page page-wide">
    <header class="head">
      <div>
        <h1>复习小站 ✨</h1>
        <p class="muted">把还不熟悉的单词，慢慢变成老朋友</p>
      </div>
      <div class="meta">
        <span class="chip">📗 待复习 {{ items.length }} 词</span>
        <span class="chip star">⭐ 已掌握 {{ mastered }} 词</span>
      </div>
    </header>

    <div v-if="errorText" class="card">{{ errorText }}</div>

    <div v-else-if="empty" class="card empty">
      <img src="/illustrations/fox.png" alt="" />
      <h2>暂时没有待复习的单词</h2>
      <p class="muted">
        闯关时还没记牢的单词，会自动收进这里。多见几次面，就会越来越熟悉。
      </p>
      <div class="actions">
        <button class="btn" @click="router.push('/home')">继续今日冒险 ></button>
        <button class="btn line" @click="router.push('/library')">去单词地图看看 ></button>
      </div>
    </div>

    <template v-else>
      <div class="card">
        <h2>错词本 · {{ items.length }} 词</h2>
        <p class="muted">专项复习不占用今日额度，答对后会移出错词本。</p>
        <button class="btn" @click="router.push({ path: '/study', query: { mode: 'review' } })">
          开始复习
        </button>
      </div>
      <article v-for="word in items" :key="word.id" class="card row word">
        <div>
          <strong>{{ word.spelling }}</strong>
          <div class="muted">{{ word.phonetic }} · {{ word.meaning }}</div>
        </div>
        <span class="lock">错 {{ word.wrongCount }}</span>
      </article>
    </template>

    <div class="card tips">
      <h3>让单词住进记忆里</h3>
      <div class="tip-grid">
        <div>
          <div class="icon">🎧</div>
          <strong>听一听</strong>
          <p class="muted">用声音加深印象，记得更牢</p>
        </div>
        <div>
          <div class="icon">🗣</div>
          <strong>读一读</strong>
          <p class="muted">开口读出单词，让记忆更清晰</p>
        </div>
        <div>
          <div class="icon">📅</div>
          <strong>隔天再见一面</strong>
          <p class="muted">过一段时间再复习，记得更长久</p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 18px;
}

.head h1 {
  margin: 0;
  font-size: 32px;
}

.meta {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.chip.star {
  background: var(--orange-soft);
  border-color: #f4d2a8;
}

.empty {
  text-align: center;
  padding: 42px 28px;
  background: linear-gradient(180deg, #fff 0%, #f5fbf8 100%);
}

.empty img {
  width: min(220px, 55%);
  border-radius: 24px;
  margin-bottom: 8px;
}

.empty h2 {
  margin-top: 8px;
}

.actions {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 20px;
}

.word {
  margin-bottom: 12px;
}

.lock {
  color: #d97706;
  font-weight: 750;
}

.tips h3 {
  margin-top: 0;
}

.tip-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-top: 12px;
}

.icon {
  font-size: 28px;
  margin-bottom: 8px;
}

@media (max-width: 860px) {
  .head,
  .tip-grid {
    display: grid;
    grid-template-columns: 1fr;
  }
}
</style>
