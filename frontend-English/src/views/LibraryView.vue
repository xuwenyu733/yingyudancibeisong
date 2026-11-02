<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { fetchTextbooks } from '../api'
import type { Textbook, UnitView } from '../types/api'
import { errorMessage, gradeLabel } from '../utils/format'

const books = ref<Textbook[]>([])
const errorText = ref('')
const router = useRouter()

onMounted(() => {
  fetchTextbooks()
    .then((result) => {
      books.value = result.items
    })
    .catch((error: unknown) => {
      errorText.value = errorMessage(error)
    })
})

function openUnit(unit: UnitView) {
  if (unit.locked) {
    void router.push('/member')
    return
  }
  void router.push({ path: '/study', query: { unitId: unit.id } })
}
</script>

<template>
  <section class="page">
    <div v-if="errorText" class="card">{{ errorText }}</div>
    <article v-for="book in books" :key="book.id" class="card">
      <div class="kicker">{{ book.publisher }}</div>
      <h1>{{ book.name }}</h1>
      <p class="muted">{{ gradeLabel(book.grade) }}{{ book.volume }} · 第 1 单元免费</p>
      <button v-for="unit in book.units" :key="unit.id" class="unit" @click="openUnit(unit)">
        <span>
          <strong>{{ unit.title }}</strong>
          <span class="muted">{{ unit.wordCount }} 词</span>
        </span>
        <span :class="unit.locked ? 'lock' : 'go'">{{ unit.locked ? '会员' : '去闯关' }}</span>
      </button>
    </article>
  </section>
</template>

<style scoped>
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
  color: #3d7eff;
  font-weight: 700;
}

.lock {
  color: #d97706;
  font-weight: 700;
}
</style>
