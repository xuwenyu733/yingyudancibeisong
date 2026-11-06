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
const unitLabel = ref('今日闯关')
let timer = 0

const current = computed(() => words.value[index.value])
const answerValue = computed(() => {
  if (mode.value === 'spell' || mode.value === 'write') {
    return current.value?.spelling ?? ''
  }
  return current.value?.meaning ?? ''
})
const progress = computed(() => {
  if (!words.value.length) return 0
  return Math.round(((index.value + (picked.value ? 1 : 0)) / words.value.length) * 100)
})
const letters = ['A', 'B', 'C', 'D']
const promptText = computed(() => {
  if (mode.value === 'listen') return '听发音，选择正确的中文意思'
  if (mode.value === 'spell') return '看中文，选择正确拼写'
  if (mode.value === 'write') return '听写拼写'
  return '选择正确的中文意思'
})

onMounted(() => {
  const unitId = typeof route.query.unitId === 'string' ? route.query.unitId : ''
  const review = route.query.mode === 'review'
  sessionMode.value = review ? 'review' : 'normal'
  window.addEventListener('keydown', onKey)
  void load(unitId, review)
})

onUnmounted(() => {
  window.clearTimeout(timer)
  window.removeEventListener('keydown', onKey)
})

async function load(unitId: string, review = false) {
  loading.value = true
  try {
    if (review) {
      const result = await fetchReview()
      words.value = result.words
      unitLabel.value = '错词复习'
    } else {
      const today = await fetchToday()
      unitLabel.value = today.unit?.title || '今日闯关'
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
  advanceSoon(correct)
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
  advanceSoon(correct)
}

function clearAdvanceTimer() {
  if (timer) {
    window.clearTimeout(timer)
    timer = 0
  }
}

function goNext() {
  clearAdvanceTimer()
  if (index.value + 1 >= words.value.length) {
    void finish()
    return
  }
  index.value += 1
  prepare()
}

function advanceSoon(correct: boolean) {
  clearAdvanceTimer()
  // 答对可稍停后自动下一题；答错必须手动继续，方便对照答案
  if (!correct) return
  timer = window.setTimeout(() => goNext(), 900)
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

function onKey(event: KeyboardEvent) {
  if (mode.value === 'write' || picked.value || !options.value.length) return
  const map: Record<string, number> = { '1': 0, '2': 1, '3': 2, '4': 3 }
  const idx = map[event.key]
  if (idx === undefined || !options.value[idx]) return
  choose(options.value[idx])
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
  <div class="study">
    <header class="bar">
      <button class="exit" type="button" @click="goBack">← 退出练习</button>
      <div class="track">
        <div class="progress"><span :style="{ width: progress + '%' }" /></div>
        <span>第 {{ Math.min(index + 1, words.length || 1) }} / {{ words.length || 0 }} 题</span>
      </div>
      <span class="tag">{{ unitLabel }}</span>
      <div class="brand">
        <div>
          <strong>单词闯关</strong>
          <span>小学 · 初中</span>
        </div>
      </div>
    </header>

    <section class="content">
      <div v-if="loading" class="card">正在出题...</div>
      <div v-else-if="errorText && !current" class="card">{{ errorText }}</div>
      <div v-else-if="!current" class="card empty">
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
      <template v-else>
        <h1 class="prompt">{{ promptText }} <span>✨</span></h1>

        <div class="card quiz">
          <span class="tag green">认识新单词</span>
          <div class="quiz-body">
            <div>
              <template v-if="mode === 'read' && !picked">
                <div class="spell">{{ current.spelling }}</div>
                <div class="muted">{{ current.phonetic }}</div>
              </template>
              <template v-else-if="mode === 'listen' && !picked">
                <div class="spell ghost">？？？</div>
                <div class="muted tip">听发音，选出正确中文</div>
              </template>
              <template v-else-if="(mode === 'spell' || mode === 'write') && !picked">
                <div class="meaning">{{ current.meaning }}</div>
                <div class="muted">{{ current.phonetic }}</div>
              </template>
              <template v-else>
                <div class="spell">{{ current.spelling }}</div>
                <div class="muted">{{ current.phonetic }}</div>
                <div class="meaning-line">{{ current.meaning }}</div>
                <div v-if="mode === 'write' && !lastCorrect" class="your-answer">
                  你写的：{{ picked }}
                </div>
              </template>
              <button class="play" type="button" @click="replay">🔊 听发音</button>
              <p v-if="picked" class="muted example">{{ current.example }}</p>
            </div>
          </div>
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
            v-for="(option, optionIndex) in options"
            :key="option"
            class="choice"
            :class="choiceClass(option)"
            :disabled="!!picked"
            @click="choose(option)"
          >
            <span class="letter">{{ letters[optionIndex] }}</span>
            <span>{{ option }}</span>
          </button>
        </div>

        <footer class="foot">
          <span v-if="!picked" class="muted">也可以按 1—4 选择</span>
          <template v-else>
            <span :class="lastCorrect ? 'ok' : 'bad'">
              {{ lastCorrect ? '答对了' : `正确答案：${answerValue}` }}
            </span>
            <button v-if="!lastCorrect" class="btn next" type="button" @click="goNext">
              看清楚了，下一题
            </button>
          </template>
        </footer>
        <p v-if="errorText && current" class="error">{{ errorText }}</p>
      </template>
    </section>
  </div>
</template>

<style scoped>
.study {
  min-height: 100vh;
  padding: 20px 28px 36px;
  background:
    radial-gradient(900px 320px at 10% 0%, #fff6df 0%, transparent 55%),
    linear-gradient(180deg, #fbfaf7 0%, #eef6ef 100%);
}

.bar {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  gap: 16px;
  align-items: center;
  margin-bottom: 28px;
}

.brand {
  justify-self: end;
  text-align: right;
}

.brand strong {
  display: block;
}

.brand span {
  color: var(--muted);
  font-size: 12px;
}

.exit {
  height: 40px;
  padding: 0 16px;
  border-radius: 999px;
  border: 1.5px solid var(--line);
  background: #fff;
  font-weight: 700;
}

.track {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--muted);
  font-size: 14px;
}

.track .progress {
  flex: 1;
  height: 8px;
}

.content {
  max-width: 920px;
  margin: 0 auto;
}

.prompt {
  text-align: center;
  font-size: 32px;
  margin-bottom: 18px;
}

.prompt span {
  color: var(--orange);
}

.quiz {
  padding: 28px;
}

.quiz-body {
  margin-top: 12px;
}

.spell {
  font-size: 64px;
  font-weight: 850;
  line-height: 1.1;
}

.spell.ghost {
  color: #9ab0a4;
}

.meaning {
  font-size: 48px;
  font-weight: 850;
}

.meaning-line {
  margin-top: 10px;
  font-size: 22px;
}

.your-answer {
  margin-top: 10px;
  color: var(--danger);
}

.play {
  margin-top: 18px;
  height: 44px;
  padding: 0 18px;
  border-radius: 999px;
  border: 1.5px solid #c9e8da;
  background: #fff;
  color: var(--brand-dark);
  font-weight: 750;
}

.example {
  margin-top: 12px;
}

.write-box {
  display: grid;
  gap: 12px;
  margin-top: 16px;
}

.write-input {
  height: 64px;
  border: 1.5px solid var(--line);
  border-radius: 18px;
  background: #fff;
  text-align: center;
  font-size: 24px;
  padding: 0 16px;
}

.choices {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-top: 16px;
}

.choice {
  min-height: 72px;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 18px;
  border-radius: 18px;
  border: 1.5px solid var(--line);
  background: #fff;
  text-align: left;
  font-size: 18px;
  font-weight: 700;
}

.letter {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: var(--brand-soft);
  color: var(--brand-dark);
  font-size: 14px;
}

.right {
  background: #e8f8ee;
  border-color: #9ad7b5;
  color: #15803d;
}

.wrong {
  background: #fdecec;
  border-color: #f0b4b4;
  color: #b91c1c;
}

.foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-top: 22px;
  flex-wrap: wrap;
}

.foot .ok {
  color: #15803d;
  font-weight: 750;
}

.foot .bad {
  color: #b91c1c;
  font-weight: 750;
}

.foot .next {
  margin-left: auto;
  height: 44px;
  padding: 0 18px;
  font-size: 15px;
}

.error {
  margin-top: 12px;
  color: var(--danger);
  text-align: center;
}

.empty {
  text-align: center;
  padding: 48px 24px;
}

@media (max-width: 860px) {
  .bar {
    grid-template-columns: auto 1fr auto;
  }

  .bar .tag {
    display: none;
  }

  .choices {
    grid-template-columns: 1fr;
  }
}
</style>
