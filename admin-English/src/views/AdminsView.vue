<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { createAdmin, fetchAdmins, updateAdmin } from '../api'
import { useSessionStore } from '../stores/session'
import type { AdminUser } from '../types'

const session = useSessionStore()
const rows = ref<AdminUser[]>([])
const error = ref('')
const message = ref('')
const form = ref({
  username: '',
  password: '',
  role: 'ADMIN' as 'ADMIN' | 'SUPER_ADMIN',
})

const meId = computed(() => session.user?.id)

async function load() {
  rows.value = await fetchAdmins()
}

onMounted(async () => {
  try {
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  }
})

async function create() {
  message.value = ''
  error.value = ''
  try {
    await createAdmin({ ...form.value })
    message.value = '管理员已创建'
    form.value = { username: '', password: '', role: 'ADMIN' }
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '创建失败'
  }
}

async function toggle(row: AdminUser) {
  if (row.id === meId.value) {
    error.value = '不能禁用自己的账号'
    return
  }
  message.value = ''
  error.value = ''
  try {
    await updateAdmin(row.id, { enabled: !row.enabled })
    message.value = row.enabled ? '已禁用' : '已启用'
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '操作失败'
  }
}

async function resetPassword(row: AdminUser) {
  const password = prompt(`为 ${row.username} 设置新密码（至少 6 位）`)
  if (!password || password.length < 6) return
  message.value = ''
  error.value = ''
  try {
    await updateAdmin(row.id, { password })
    message.value = '密码已更新'
  } catch (e) {
    error.value = e instanceof Error ? e.message : '改密失败'
  }
}
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h1>管理员账号</h1>
        <p>不可禁用自己；至少保留一名启用的超级管理员</p>
      </div>
    </div>
    <p v-if="error" class="err">{{ error }}</p>
    <p v-if="message" class="ok">{{ message }}</p>

    <div class="panel" style="margin-bottom: 14px">
      <div class="form-grid">
        <label>用户名<input v-model="form.username" /></label>
        <label>密码<input v-model="form.password" type="password" /></label>
        <label>
          角色
          <select v-model="form.role">
            <option value="ADMIN">ADMIN</option>
            <option value="SUPER_ADMIN">SUPER_ADMIN</option>
          </select>
        </label>
      </div>
      <button class="btn" type="button" @click="create">创建</button>
    </div>

    <div class="panel">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>用户名</th>
              <th>角色</th>
              <th>状态</th>
              <th>创建时间</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id">
              <td>
                {{ row.username }}
                <span v-if="row.id === meId" class="badge info">我</span>
              </td>
              <td>{{ row.role }}</td>
              <td>
                <span class="badge" :class="row.enabled ? 'on' : 'off'">
                  {{ row.enabled ? '启用' : '禁用' }}
                </span>
              </td>
              <td>{{ row.createdAt }}</td>
              <td style="white-space: nowrap">
                <button
                  class="btn ghost sm"
                  type="button"
                  :disabled="row.id === meId"
                  @click="toggle(row)"
                >
                  {{ row.enabled ? '禁用' : '启用' }}
                </button>
                <button class="btn ghost sm" type="button" @click="resetPassword(row)">
                  改密
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
