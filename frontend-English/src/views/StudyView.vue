<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchReview, fetchToday, fetchUnitWords, submitSession } from '../api'
import type { Word } from '../types/api'
import { playWordAudio } from '../utils/audio'
import { errorMessage } from '../utils/format'

type QuizMode = 'read' | 'listen' | 'spell' | 'write'

const route = useRoute()
const router = useRouter()
const words = ref<Word[]>([])
const index = ref(0)
const options = ref<string[]>([])
const picked = ref('')
const typed = ref('')
const lastCorrect = ref(false)
const mode = ref<QuizMode>('read')
const sessionMode = ref<'normal' | 'review'>('normal')
const answers = ref<{ wordId: string; correct: boolean }[]>([])
const loading = ref(true)
const errorText = ref('')
let timer = 0

const current = computed(() => words.value[index.value])
const answerValue = computed(() => {
  if (mode.value === 'spell' || mode.value === 'write') {
    return current.value?.spelling ?? ''
  }
  return current.value?.meaning ?? ''
})
const modeLabel = computed(() => {
  const labels: Record<QuizMode, string> = {
    read: '看单词，选中文',
    listen: '听发音，选中文',
    spell: '看中文，选拼写',
    write: '听写拼写',
  }
  const base = labels[mode.value]
  return sessionMode.value === 'review' ? `错词复习 · ${base}` : base
})

onMounted(() => {
  const unitId = typeof route.query.unitId === 'string' ? route.query.unitId : ''
  const review = route.query.mode === 'review'
  sessionMode.value = review ? 'review' : 'normal'
  void load(unitId, review)
})

onUnmounted(() => {
  window.clearTimeout(timer)
})

async function load(unitId: string, review = false) {
  loading.value = true
  try {
    if (review) {
      const result = await fetchReview()
      words.value = result.words
    } else {
      const today = await fetchToday()
      if (unitId) {
        const result = await fetchUnitWords(unitId)
        words.value = result.words.slice(0, today.remaining)
      } else {
        words.value = today.words
      }
    }
    prepare()
  } catch (error) {
    errorText.value = errorMessage(error)
  } finally {
    loading.value = false
  }
}

function prepare() {
  const word = current.value
  if (!word) return
  const modes: QuizMode[] = ['read', 'listen', 'spell', 'write']
  mode.value = modes[index.value % 4]
  typed.value = ''
  lastCorrect.value = false
  options.value =
    mode.value === 'spell'
      ? buildSpellOptions(word)
      : mode.value === 'write'
        ? []
        : buildMeaningOptions(word)
  picked.value = ''
  if (mode.value === 'listen' || mode.value === 'spell' || mode.value === 'write') {
    window.setTimeout(() => playWordAudio(word), 200)
  }
}

function buildMeaningOptions(word: Word) {
  const pool = words.value.map((item) => item.meaning).filter((item) => item !== word.meaning)
  const extras = [...new Set([...pool, '苹果', '学校', '小猫', '铅笔'])].slice(0, 3)
  return shuffle([word.meaning, ...extras])
}

function buildSpellOptions(word: Word) {
  const pool = words.value
    .map((item) => item.spelling)
    .filter((item) => item.toLowerCase() !== word.spelling.toLowerCase())
  const distractors = [
    ...pool,
    ...mutateSpelling(word.spelling),
    'apple',
    'school',
    'book',
    'happy',
  ]
  const extras = [...new Set(distractors)]
    .filter((item) => item.toLowerCase() !== word.spelling.toLowerCase())
    .slice(0, 3)
  return shuffle([word.spelling, ...extras])
}

function mutateSpelling(spelling: string) {
  const lower = spelling.toLowerCase()
  const variants = new Set<string>()
  if (lower.length > 2) {
    variants.add(lower.slice(0, -1) + lower[lower.length - 2])
    variants.add(lower[0] + lower.slice(2))
    variants.add(lower + 's')
    if (lower.endsWith('e')) variants.add(lower.slice(0, -1))
    else variants.add(lower + 'e')
  }
  return [...variants]
}

function normalizeSpelling(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '')
}

function choose(option: string) {
  const word = current.value
  if (!word || picked.value) return
  const correct = option === answerValue.value
  lastCorrect.value = correct
  picked.value = option
  answers.value.push({ wordId: word.id, correct })
  advanceSoon()
}

function submitWrite() {
  const word = current.value
  if (!word || picked.value) return
  const input = typed.value.trim()
  if (!input) {
    errorText.value = '请先输入拼写'
    return
  }
  errorText.value = ''
  const correct = normalizeSpelling(input) === normalizeSpelling(word.spelling)
  lastCorrect.value = correct
  picked.value = input
  answers.value.push({ wordId: word.id, correct })
  advanceSoon()
}

function advanceSoon() {
  timer = window.setTimeout(() => {
    if (index.value + 1 >= words.value.length) {
      void finish()
      return
    }
    index.value += 1
    prepare()
  }, 900)
}

async function finish() {
  try {
    const result = await submitSession(answers.value, sessionMode.value)
    await router.replace({
      path: '/result',
      query: {
        correct: String(result.correct),
        total: String(result.total),
        mode: sessionMode.value,
      },
    })
  } catch (error) {
    errorText.value = errorMessage(error)
  }
}

function choiceClass(option: string) {
  if (!picked.value || !current.value) return ''
  if (option === answerValue.value) return 'right'
  if (option === picked.value) return 'wrong'
  return ''
}

function replay() {
  if (current.value) playWordAudio(current.value)
}

function goBack() {
  void router.push(sessionMode.value === 'review' ? '/wrong' : '/home')
}

function shuffle(list: string[]) {
  const next = [...list]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const left = next[i]
    next[i] = next[j]
    next[j] = left
  }
  return next
}
</script>

<template>
  <section class="page">
    <div v-if="loading" class="card">正在出题...</div>
    <div v-else-if="errorText && !current" class="card">{{ errorText }}</div>
    <div v-else-if="!current" class="card">
      <h1>这一关暂时没有单词</h1>
      <p class="muted">
        {{
          sessionMode === 'review'
            ? '错词本是空的，先去闯关积累错词吧。'
            : '可能是今日额度用完，或这一单元还未解锁。'
        }}
      </p>
      <button class="btn" @click="goBack">返回</button>
    </div>
    <div v-else>
      <div class="row muted">
        <span>{{ index + 1 }}/{{ words.length }}</span>
        <span>{{ modeLabel }}</span>
      </div>
      <div class="card quiz">
        <template v-if="(mode === 'spell' || mode === 'write') && !picked">
          <div class="meaning">{{ current.meaning }}</div>
          <div class="muted">{{ current.phonetic }}</div>
          <button class="play small" type="button" @click="replay">▶ 听发音</button>
          <div class="muted tip">
            {{ mode === 'write' ? '听发音，输入英文拼写' : '选出正确拼写' }}
          </div>
        </template>
        <template v-else-if="mode === 'read' || picked">
          <div class="spell">{{ current.spelling }}</div>
          <div class="muted">{{ current.phonetic }}</div>
          <div v-if="mode === 'spell' || mode === 'write'" class="meaning-line">
            {{ current.meaning }}
          </div>
          <div v-if="mode === 'write' && picked && !lastCorrect" class="your-answer">
            你写的：{{ picked }}
          </div>
        </template>
        <template v-else>
          <button class="play" type="button" @click="replay">▶ 再听一遍</button>
          <div class="muted tip">听发音，选出正确中文</div>
        </template>
        <p v-if="picked" class="muted">{{ current.example }}</p>
      </div>

      <form v-if="mode === 'write' && !picked" class="write-box" @submit.prevent="submitWrite">
        <input
          v-model="typed"
          class="write-input"
          type="text"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder="输入英文单词"
          :disabled="!!picked"
        />
        <button class="btn" type="submit" :disabled="!typed.trim()">提交</button>
      </form>

      <div v-else class="choices">
        <button
          v-for="option in options"
          :key="option"
          class="choice"
          :class="choiceClass(option)"
          :disabled="!!picked"
          @click="choose(option)"
        >
          {{ option }}
        </button>
      </div>
      <p v-if="errorText && current" class="error">{{ errorText }}</p>
    </div>
  </section>
</template>

<style scoped>
.quiz {
  text-align: center;
  padding: 48px 24px;
}

.spell {
  font-size: 56px;
  font-weight: 750;
}

.meaning {
  font-size: 44px;
  font-weight: 750;
}

.meaning-line {
  margin-top: 10px;
  font-size: 22px;
  color: #172033;
}

.your-answer {
  margin-top: 10px;
  color: #b91c1c;
  font-size: 16px;
}

.play {
  border: 0;
  border-radius: 999px;
  background: #eaf1ff;
  color: #3d7eff;
  height: 56px;
  padding: 0 24px;
  font-weight: 700;
}

.play.small {
  margin-top: 16px;
  height: 44px;
  padding: 0 18px;
  font-size: 14px;
}

.tip {
  margin-top: 14px;
}

.write-box {
  display: grid;
  gap: 12px;
}

.write-input {
  height: 56px;
  border: 0;
  border-radius: 14px;
  background: #fff;
  text-align: center;
  font-size: 22px;
  padding: 0 16px;
}

.choices {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.choice {
  height: 64px;
  border: 0;
  border-radius: 14px;
  background: #fff;
}

.right {
  background: #e8f8ee;
  color: #15803d;
}

.wrong {
  background: #fdecec;
  color: #b91c1c;
}

.error {
  margin-top: 12px;
  color: #b91c1c;
}
</style>
