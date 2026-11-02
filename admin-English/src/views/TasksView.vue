<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { deleteTask, fetchTasks, upsertTask } from '../api'
import { useSessionStore } from '../stores/session'
import type { TaskDef } from '../types'

const session = useSessionStore()
const rows = ref<TaskDef[]>([])
const error = ref('')
const message = ref('')
const form = ref<TaskDef>({
  id: '',
  key: '',
  title: '',
  desc: '',
  metric: 'study_count',
  target: 1,
  reward: 10,
  sort: 0,
  active: true,
})

async function load() {
  rows.value = await fetchTasks()
}

onMounted(async () => {
  try {
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  }
})

function edit(row: TaskDef) {
  form.value = { ...row }
}

async function save() {
  if (!session.isSuper) return
  message.value = ''
  try {
    await upsertTask({
      ...form.value,
      target: Number(form.value.target),
      reward: Number(form.value.reward),
      sort: Number(form.value.sort),
    })
    message.value = '任务已保存'
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败'
  }
}

async function remove(id: string) {
  if (!session.isSuper || !confirm('确认删除？')) return
  await deleteTask(id)
  await load()
}
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h1>每日任务</h1>
        <p>{{ session.isSuper ? '完整 CRUD' : '只读（超管可编辑）' }}</p>
      </div>
    </div>
    <p v-if="error" class="err">{{ error }}</p>
    <p v-if="message" class="ok">{{ message }}</p>

    <div v-if="session.isSuper" class="panel" style="margin-bottom: 14px">
      <div class="form-grid">
        <label>ID<input v-model="form.id" /></label>
        <label>Key<input v-model="form.key" /></label>
        <label>标题<input v-model="form.title" /></label>
        <label>指标<input v-model="form.metric" /></label>
        <label>目标<input v-model.number="form.target" type="number" /></label>
        <label>奖励<input v-model.number="form.reward" type="number" /></label>
        <label>排序<input v-model.number="form.sort" type="number" /></label>
        <label>
          启用
          <select v-model="form.active">
            <option :value="true">是</option>
            <option :value="false">否</option>
          </select>
        </label>
        <label class="full">描述<input v-model="form.desc" /></label>
      </div>
      <button class="btn" type="button" @click="save">保存</button>
    </div>

    <div class="panel">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>标题</th>
              <th>指标</th>
              <th>目标</th>
              <th>奖励</th>
              <th>状态</th>
              <th v-if="session.isSuper"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id">
              <td>{{ row.title }}</td>
              <td>{{ row.metric }}</td>
              <td>{{ row.target }}</td>
              <td>{{ row.reward }}</td>
              <td>
                <span class="badge" :class="row.active ? 'on' : 'off'">
                  {{ row.active ? '启用' : '停用' }}
                </span>
              </td>
              <td v-if="session.isSuper" style="white-space: nowrap">
                <button class="btn ghost sm" type="button" @click="edit(row)">改</button>
                <button class="btn danger sm" type="button" @click="remove(row.id)">
                  删
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
