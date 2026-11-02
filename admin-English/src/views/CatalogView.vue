<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import {
  deleteTextbook,
  deleteUnit,
  deleteWord,
  fetchTextbooks,
  fetchUnits,
  fetchWords,
  upsertTextbook,
  upsertUnit,
  upsertWord,
} from '../api'
import type { Textbook, Unit, Word } from '../types'

const textbooks = ref<Textbook[]>([])
const units = ref<Unit[]>([])
const words = ref<Word[]>([])
const wordTotal = ref(0)
const wordPage = ref(1)
const wordPageSize = 30
const wordQ = ref('')
const textbookId = ref('')
const unitId = ref('')
const loading = ref(false)
const error = ref('')
const message = ref('')

const tbForm = ref({
  id: '',
  name: '',
  publisher: '',
  grade: 3,
  volume: '上册',
})
const unitForm = ref({
  id: '',
  textbookId: '',
  title: '',
  order: 1,
  free: true,
})
const wordForm = ref({
  id: '',
  unitId: '',
  spelling: '',
  phonetic: '',
  meaning: '',
  example: '',
})

async function loadTextbooks() {
  textbooks.value = await fetchTextbooks()
  if (!textbookId.value && textbooks.value[0]) {
    textbookId.value = textbooks.value[0].id
  }
}

async function loadUnits() {
  if (!textbookId.value) {
    units.value = []
    return
  }
  units.value = await fetchUnits(textbookId.value)
  if (!units.value.find((u) => u.id === unitId.value)) {
    unitId.value = units.value[0]?.id || ''
  }
}

async function loadWords() {
  if (!unitId.value) {
    words.value = []
    wordTotal.value = 0
    return
  }
  const res = await fetchWords({
    unitId: unitId.value,
    q: wordQ.value.trim() || undefined,
    page: wordPage.value,
    pageSize: wordPageSize,
  })
  words.value = res.items
  wordTotal.value = res.total
}

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    await loadTextbooks()
    await loadUnits()
    await loadWords()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

watch(textbookId, async () => {
  unitForm.value.textbookId = textbookId.value
  wordPage.value = 1
  try {
    await loadUnits()
    await loadWords()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  }
})

watch(unitId, async () => {
  wordForm.value.unitId = unitId.value
  wordPage.value = 1
  try {
    await loadWords()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  }
})

onMounted(refresh)

function editTextbook(t: Textbook) {
  textbookId.value = t.id
  tbForm.value = {
    id: t.id,
    name: t.name,
    publisher: t.publisher,
    grade: t.grade,
    volume: t.volume,
  }
}

function editUnit(u: Unit) {
  unitId.value = u.id
  unitForm.value = {
    id: u.id,
    textbookId: u.textbookId,
    title: u.title,
    order: u.order,
    free: u.free,
  }
}

function editWord(w: Word) {
  wordForm.value = { ...w }
}

function resetWordForm() {
  wordForm.value = {
    id: '',
    unitId: unitId.value,
    spelling: '',
    phonetic: '',
    meaning: '',
    example: '',
  }
}

async function saveTextbook() {
  message.value = ''
  error.value = ''
  try {
    await upsertTextbook({ ...tbForm.value, grade: Number(tbForm.value.grade) })
    message.value = '教材已保存'
    await refresh()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败'
  }
}

async function removeTextbook(id: string) {
  const tb = textbooks.value.find((item) => item.id === id)
  const unitsCount = tb?._count?.units ?? 0
  if (
    !confirm(
      unitsCount > 0
        ? `教材「${id}」下还有 ${unitsCount} 个单元，需先删空单元。仍要尝试删除吗？`
        : `确认删除空教材「${id}」？`,
    )
  ) {
    return
  }
  error.value = ''
  try {
    await deleteTextbook(id)
    message.value = '教材已删除'
    if (textbookId.value === id) textbookId.value = ''
    await refresh()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '删除失败'
  }
}

async function saveUnit() {
  message.value = ''
  error.value = ''
  try {
    const payload = {
      ...unitForm.value,
      textbookId: unitForm.value.textbookId || textbookId.value,
      order: Number(unitForm.value.order),
    }
    await upsertUnit(payload)
    message.value = '单元已保存'
    await loadUnits()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败'
  }
}

async function removeUnit(id: string) {
  const unit = units.value.find((item) => item.id === id)
  const wordsCount = unit?._count?.words ?? 0
  if (
    !confirm(
      wordsCount > 0
        ? `单元「${id}」下还有 ${wordsCount} 个单词，需先删空单词。仍要尝试删除吗？`
        : `确认删除空单元「${id}」？`,
    )
  ) {
    return
  }
  error.value = ''
  try {
    await deleteUnit(id)
    message.value = '单元已删除'
    if (unitId.value === id) unitId.value = ''
    await loadUnits()
    await loadWords()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '删除失败'
  }
}

async function saveWord() {
  message.value = ''
  error.value = ''
  try {
    await upsertWord({
      ...wordForm.value,
      unitId: wordForm.value.unitId || unitId.value,
      id: wordForm.value.id || undefined,
    })
    message.value = '单词已保存'
    resetWordForm()
    await loadWords()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败'
  }
}

async function removeWord(id: string) {
  if (
    !confirm(`确认删除单词「${id}」？若已有学习记录将被后端拒绝，避免误删。`)
  ) {
    return
  }
  error.value = ''
  try {
    await deleteWord(id)
    message.value = '单词已删除'
    await loadWords()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '删除失败'
  }
}

async function searchWords() {
  wordPage.value = 1
  error.value = ''
  try {
    await loadWords()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  }
}

async function changeWordPage(delta: number) {
  wordPage.value = Math.max(1, wordPage.value + delta)
  await loadWords()
}
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h1>词库管理</h1>
        <p>点表格行可填入表单编辑；删除受关联数据保护</p>
      </div>
    </div>
    <p v-if="error" class="err">{{ error }}</p>
    <p v-if="message" class="ok">{{ message }}</p>
    <p v-if="loading" class="hint">加载中…</p>

    <div class="panel" style="margin-bottom: 14px">
      <div class="toolbar">
        <strong>教材</strong>
        <select v-model="textbookId">
          <option disabled value="">选择教材</option>
          <option v-for="t in textbooks" :key="t.id" :value="t.id">
            {{ t.name }}（{{ t._count?.units ?? 0 }} 单元）
          </option>
        </select>
      </div>
      <div class="form-grid">
        <label>ID<input v-model="tbForm.id" /></label>
        <label>名称<input v-model="tbForm.name" /></label>
        <label>出版社<input v-model="tbForm.publisher" /></label>
        <label>年级<input v-model.number="tbForm.grade" type="number" /></label>
        <label>册别<input v-model="tbForm.volume" /></label>
      </div>
      <button class="btn" type="button" @click="saveTextbook">保存教材</button>
      <div class="table-wrap" style="margin-top: 12px">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>名称</th>
              <th>年级</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="t in textbooks"
              :key="t.id"
              style="cursor: pointer"
              @click="editTextbook(t)"
            >
              <td>{{ t.id }}</td>
              <td>{{ t.name }}</td>
              <td>{{ t.grade }}{{ t.volume }}</td>
              <td>
                <button
                  class="btn danger sm"
                  type="button"
                  @click.stop="removeTextbook(t.id)"
                >
                  删
                </button>
              </td>
            </tr>
            <tr v-if="!textbooks.length">
              <td colspan="4" class="hint">暂无教材</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="panel" style="margin-bottom: 14px">
      <div class="toolbar">
        <strong>单元</strong>
        <select v-model="unitId">
          <option disabled value="">选择单元</option>
          <option v-for="u in units" :key="u.id" :value="u.id">
            {{ u.title }}（{{ u._count?.words ?? 0 }} 词）
          </option>
        </select>
      </div>
      <div class="form-grid">
        <label>ID<input v-model="unitForm.id" /></label>
        <label>标题<input v-model="unitForm.title" /></label>
        <label>顺序<input v-model.number="unitForm.order" type="number" /></label>
        <label>
          免费
          <select v-model="unitForm.free">
            <option :value="true">是</option>
            <option :value="false">否</option>
          </select>
        </label>
      </div>
      <button class="btn" type="button" @click="saveUnit">保存单元</button>
      <div class="table-wrap" style="margin-top: 12px">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>标题</th>
              <th>顺序</th>
              <th>免费</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="u in units"
              :key="u.id"
              style="cursor: pointer"
              @click="editUnit(u)"
            >
              <td>{{ u.id }}</td>
              <td>{{ u.title }}</td>
              <td>{{ u.order }}</td>
              <td>{{ u.free ? '是' : '否' }}</td>
              <td>
                <button
                  class="btn danger sm"
                  type="button"
                  @click.stop="removeUnit(u.id)"
                >
                  删
                </button>
              </td>
            </tr>
            <tr v-if="!units.length">
              <td colspan="5" class="hint">当前教材暂无单元</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="panel">
      <div class="toolbar">
        <strong>单词</strong>
        <input
          v-model="wordQ"
          placeholder="搜索拼写 / 释义 / 音标"
          @keyup.enter="searchWords"
        />
        <button class="btn ghost sm" type="button" @click="searchWords">搜索</button>
        <span class="hint">共 {{ wordTotal }}</span>
      </div>
      <div class="form-grid">
        <label>ID（可空）<input v-model="wordForm.id" placeholder="留空自动生成" /></label>
        <label>拼写<input v-model="wordForm.spelling" /></label>
        <label>音标<input v-model="wordForm.phonetic" /></label>
        <label>释义<input v-model="wordForm.meaning" /></label>
        <label class="full">例句<input v-model="wordForm.example" /></label>
      </div>
      <div class="toolbar">
        <button class="btn" type="button" @click="saveWord">保存单词</button>
        <button class="btn ghost" type="button" @click="resetWordForm">清空表单</button>
      </div>
      <div class="table-wrap" style="margin-top: 12px">
        <table>
          <thead>
            <tr>
              <th>拼写</th>
              <th>音标</th>
              <th>释义</th>
              <th>例句</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="w in words"
              :key="w.id"
              style="cursor: pointer"
              @click="editWord(w)"
            >
              <td>{{ w.spelling }}</td>
              <td>{{ w.phonetic }}</td>
              <td>{{ w.meaning }}</td>
              <td>{{ w.example }}</td>
              <td style="white-space: nowrap">
                <button class="btn ghost sm" type="button" @click.stop="editWord(w)">
                  改
                </button>
                <button
                  class="btn danger sm"
                  type="button"
                  @click.stop="removeWord(w.id)"
                >
                  删
                </button>
              </td>
            </tr>
            <tr v-if="!words.length">
              <td colspan="5" class="hint">
                {{ unitId ? '当前单元暂无单词' : '请先选择单元' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="pager">
        <button
          class="btn ghost sm"
          type="button"
          :disabled="wordPage <= 1"
          @click="changeWordPage(-1)"
        >
          上一页
        </button>
        <span>第 {{ wordPage }} 页</span>
        <button
          class="btn ghost sm"
          type="button"
          :disabled="wordPage * wordPageSize >= wordTotal"
          @click="changeWordPage(1)"
        >
          下一页
        </button>
      </div>
    </div>
  </div>
</template>
