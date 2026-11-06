<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { createChild, fetchTextbooks } from '../api'
import type { Textbook } from '../types/api'
import { AVATAR_OPTIONS, avatarDataUrl } from '../utils/avatar'
import { errorMessage, gradeLabel } from '../utils/format'

const goals = [10, 15, 20]
const nickname = ref(localStorage.getItem('wq_nickname') || '小宇')
const stage = ref<'primary' | 'junior'>(
  (localStorage.getItem('wq_stage') as 'primary' | 'junior') || 'primary',
)
const grade = ref(stage.value === 'junior' ? 7 : 3)
const textbookId = ref('')
const avatarId = ref(localStorage.getItem('wq_avatar_id') || AVATAR_OPTIONS[0].id)
const dailyGoal = ref(Number(localStorage.getItem('wq_daily_goal') || 10))
const books = ref<Textbook[]>([])
const loading = ref(false)
const errorText = ref('')
const router = useRouter()

const primaryGrades = [1, 2, 3, 4, 5, 6]
const juniorGrades = [7, 8, 9]
const gradeOptions = computed(() => (stage.value === 'junior' ? juniorGrades : primaryGrades))
const gradeBooks = computed(() => books.value.filter((item) => item.grade === grade.value))
const selectedAvatar = computed(
  () => AVATAR_OPTIONS.find((item) => item.id === avatarId.value) || AVATAR_OPTIONS[0],
)
const avatarPreview = computed(() => avatarDataUrl(selectedAvatar.value, nickname.value || '词'))
const volumeText = computed(() => {
  const book = gradeBooks.value.find((item) => item.id === textbookId.value)
  return book ? `${gradeLabel(book.grade)} · ${book.volume}` : gradeLabel(grade.value)
})

watch(stage, (value) => {
  grade.value = value === 'junior' ? 7 : 3
  localStorage.setItem('wq_stage', value)
})

watch(grade, () => {
  textbookId.value = gradeBooks.value[0]?.id || ''
})

async function submit() {
  const name = nickname.value.trim()
  if (!name) {
    errorText.value = '请填写孩子昵称'
    return
  }
  if (!textbookId.value && gradeBooks.value.length) {
    errorText.value = '请选择教材册别'
    return
  }
  loading.value = true
  errorText.value = ''
  localStorage.setItem('wq_nickname', name)
  localStorage.setItem('wq_avatar_id', avatarId.value)
  localStorage.setItem('wq_avatar', avatarDataUrl(selectedAvatar.value, name))
  localStorage.setItem('wq_daily_goal', String(dailyGoal.value))
  localStorage.setItem('wq_stage', stage.value)
  try {
    await createChild({
      nickname: name,
      grade: grade.value,
      textbookId: textbookId.value || undefined,
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
      if (!gradeOptions.value.includes(grade.value)) {
        grade.value = gradeOptions.value[0]
      }
      textbookId.value = gradeBooks.value[0]?.id || ''
    })
    .catch((error: unknown) => {
      errorText.value = errorMessage(error)
    })
})
</script>

<template>
  <section class="page page-wide create">
    <div class="intro">
      <h1>先认识一下，未来的单词探险家</h1>
      <p class="muted">选好形象、年级和教材，今日任务会按所选词库出题。</p>
    </div>

    <div class="layout">
      <div class="card form">
        <div class="form-title">
          <span class="badge">📋</span>
          <h2>创建学习档案</h2>
        </div>

        <label class="label">选择一个专属形象</label>
        <div class="avatars">
          <button
            v-for="item in AVATAR_OPTIONS"
            :key="item.id"
            type="button"
            class="avatar"
            :class="{ active: avatarId === item.id }"
            :title="item.label"
            :style="{ background: item.bg, borderColor: item.color }"
            @click="avatarId = item.id"
          >
            <span class="letter" :style="{ background: item.color }">
              {{ (nickname.trim()[0] || '词').toUpperCase() }}
            </span>
            <span v-if="avatarId === item.id" class="tick">✓</span>
          </button>
        </div>
        <p class="hint">用颜色区分形象，昵称首字会显示在头像上</p>

        <label class="label">你的昵称</label>
        <input v-model="nickname" class="field" maxlength="12" placeholder="孩子昵称，例如小宇" />
        <p class="hint">伙伴会这样称呼你</p>

        <label class="label">正在读哪个学段？</label>
        <div class="pills">
          <button type="button" class="pill" :class="{ active: stage === 'primary' }" @click="stage = 'primary'">
            小学
          </button>
          <button type="button" class="pill" :class="{ active: stage === 'junior' }" @click="stage = 'junior'">
            初中
          </button>
        </div>

        <label class="label">年级</label>
        <div class="pills wrap">
          <button
            v-for="item in gradeOptions"
            :key="item"
            type="button"
            class="pill"
            :class="{ active: grade === item }"
            @click="grade = item"
          >
            {{ gradeLabel(item) }}
          </button>
        </div>

        <label class="label">学习教材</label>
        <select v-model="textbookId" class="field">
          <option v-if="!gradeBooks.length" value="">当前年级暂无教材，可先建档</option>
          <option v-for="book in gradeBooks" :key="book.id" :value="book.id">
            {{ book.publisher }} · {{ book.name }} · {{ book.volume }}
          </option>
        </select>

        <label class="label">每天的新词目标</label>
        <div class="pills">
          <button
            v-for="goal in goals"
            :key="goal"
            type="button"
            class="pill"
            :class="{ active: dailyGoal === goal }"
            @click="dailyGoal = goal"
          >
            {{ goal }}词
          </button>
        </div>
        <p class="hint">先从轻松的小目标开始，随时可调整</p>

        <button class="btn block" :disabled="loading" @click="submit">
          {{ loading ? '保存中...' : '创建档案，开始冒险 >' }}
        </button>
        <p v-if="errorText" class="error">{{ errorText }}</p>
      </div>

      <aside class="card pass">
        <img class="mascot" src="/illustrations/fox.png" alt="" />
        <div class="pass-card">
          <div class="pass-title">🏔 我的冒险通行证</div>
          <div class="pass-user">
            <img :src="avatarPreview" alt="" />
            <div>
              <strong>{{ nickname || '小探险家' }}</strong>
              <span>{{ volumeText }}</span>
            </div>
          </div>
          <div class="pass-meta">
            <span>每天{{ dailyGoal }}词</span>
            <span>{{ selectedAvatar.label }}</span>
          </div>
        </div>
        <p class="motto">每个孩子，都有自己的成长节奏</p>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.create {
  max-width: 1100px;
}

.intro h1 {
  margin-top: 0;
  font-size: 32px;
}

.layout {
  display: grid;
  grid-template-columns: 1.15fr 0.85fr;
  gap: 20px;
  align-items: start;
}

.form-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.form-title h2 {
  margin: 0;
}

.badge {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: var(--brand-soft);
}

.label {
  display: block;
  margin-top: 18px;
  font-weight: 750;
}

.hint {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 13px;
}

.avatars {
  display: flex;
  gap: 12px;
  margin-top: 12px;
}

.avatar {
  position: relative;
  width: 68px;
  height: 68px;
  border-radius: 50%;
  border: 2px solid transparent;
  padding: 0;
  display: grid;
  place-items: center;
}

.avatar.active {
  box-shadow: 0 0 0 4px rgba(46, 176, 134, 0.15);
}

.letter {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 22px;
  font-weight: 800;
}

.tick {
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--brand);
  color: #fff;
  font-size: 11px;
  display: grid;
  place-items: center;
}

.pills {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 12px;
}

.pass {
  text-align: center;
  background:
    linear-gradient(180deg, #fff9ef 0%, #f4fbf7 55%, #e8f6ef 100%);
  min-height: 560px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
}

.mascot {
  width: min(220px, 70%);
  border-radius: 24px;
}

.pass-card {
  width: min(280px, 100%);
  padding: 18px;
  border-radius: 18px;
  background: #fff8e8;
  border: 1px solid #f0e2c8;
  text-align: left;
  box-shadow: var(--shadow);
}

.pass-title {
  font-weight: 800;
  margin-bottom: 12px;
}

.pass-user {
  display: flex;
  gap: 10px;
  align-items: center;
}

.pass-user img {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  object-fit: cover;
}

.pass-user strong {
  display: block;
}

.pass-user span,
.pass-meta span {
  color: var(--muted);
  font-size: 13px;
}

.pass-meta {
  display: flex;
  justify-content: space-between;
  margin-top: 14px;
}

.motto {
  margin: 0;
  padding: 10px 16px;
  border-radius: 999px;
  background: rgba(46, 176, 134, 0.12);
  color: var(--brand-dark);
  font-weight: 700;
  font-size: 13px;
}

.error {
  color: var(--danger);
}

@media (max-width: 960px) {
  .layout {
    grid-template-columns: 1fr;
  }
}
</style>
