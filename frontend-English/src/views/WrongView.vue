<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { fetchWrongWords } from '../api'
import type { WrongWord } from '../types/api'
import { errorMessage } from '../utils/format'

const items = ref<WrongWord[]>([])
const errorText = ref('')
const router = useRouter()

onMounted(() => {
  fetchWrongWords()
    .then((result) => {
      items.value = result.items
    })
    .catch((error: unknown) => {
      errorText.value = errorMessage(error)
    })
})
</script>

<template>
  <section class="page">
    <div v-if="errorText" class="card">{{ errorText }}</div>
    <div v-else-if="items.length === 0" class="card">
      <h1>还没有错词</h1>
      <p class="muted">闯关答错的词会出现在这里，答对后自动移出。</p>
    </div>
    <template v-else>
      <div class="card">
        <h1>错词本 · {{ items.length }} 词</h1>
        <p class="muted">专项复习不占用今日额度，答对后会移出错词本。</p>
        <button class="btn" @click="router.push({ path: '/study', query: { mode: 'review' } })">
          开始复习
        </button>
      </div>
      <article v-for="word in items" :key="word.id" class="card row">
        <div>
          <strong>{{ word.spelling }}</strong>
          <div class="muted">{{ word.phonetic }} · {{ word.meaning }}</div>
        </div>
        <span class="lock">错 {{ word.wrongCount }}</span>
      </article>
    </template>
  </section>
</template>

<style scoped>
.lock {
  color: #d97706;
  font-weight: 700;
}
</style>
