<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { createChild, fetchTextbooks } from '../api'
import type { Textbook } from '../types/api'
import { errorMessage } from '../utils/format'

const grades = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级']
const nickname = ref('')
const grade = ref(3)
const textbookId = ref('')
const books = ref<Textbook[]>([])
const loading = ref(false)
const errorText = ref('')
const router = useRouter()

const gradeBooks = computed(() => books.value.filter((item) => item.grade === grade.value))

watch(grade, () => {
  textbookId.value = gradeBooks.value[0]?.id || ''
})

async function submit() {
  const name = nickname.value.trim()
  if (!name) {
    errorText.value = '请填写孩子昵称'
    return
  }
  if (!textbookId.value) {
    errorText.value = '请选择教材册别'
    return
  }
  loading.value = true
  errorText.value = ''
  try {
    await createChild({
      nickname: name,
      grade: grade.value,
      textbookId: textbookId.value,
    })
    await router.push('/home')
  } catch (error) {
    errorText.value = errorMessage(error)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchTextbooks()
    .then((result) => {
      books.value = result.items
      textbookId.value = gradeBooks.value[0]?.id || ''
    })
    .catch((error: unknown) => {
      errorText.value = errorMessage(error)
    })
})
</script>

<template>
  <section class="page">
    <div class="card">
      <div class="kicker">家长填写</div>
      <h1>给孩子建一个学习档案</h1>
      <p class="muted">选好年级和上下册后，今日任务会按所选词库出题。</p>
      <input v-model="nickname" class="field" maxlength="12" placeholder="孩子昵称，例如小满" />
      <select v-model.number="grade" class="field">
        <option v-for="(label, index) in grades" :key="label" :value="index + 1">{{ label }}</option>
      </select>
      <select v-model="textbookId" class="field">
        <option v-for="book in gradeBooks" :key="book.id" :value="book.id">
          {{ book.volume }} · {{ book.name }}
        </option>
      </select>
      <button class="btn block" :disabled="loading" @click="submit">
        {{ loading ? '保存中...' : '开始学习' }}
      </button>
      <p v-if="errorText" class="error">{{ errorText }}</p>
    </div>
  </section>
</template>

<style scoped>
.error {
  color: #b91c1c;
}
</style>
