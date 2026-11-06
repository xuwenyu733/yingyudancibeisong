<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { fetchAudits } from '../api'
import type { AuditRow } from '../types'

const rows = ref<AuditRow[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const q = ref('')
const loading = ref(false)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await fetchAudits({
      q: q.value.trim() || undefined,
      page: page.value,
      pageSize,
    })
    rows.value = res.items
    total.value = res.total
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

function search() {
  page.value = 1
  void load()
}

function changePage(delta: number) {
  page.value = Math.max(1, page.value + delta)
  void load()
}

function shortTime(iso: string) {
  return iso.replace('T', ' ').slice(0, 19)
}

onMounted(load)
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h1>操作审计</h1>
        <p>记录后台写操作（密码字段已脱敏）</p>
      </div>
    </div>
    <p v-if="error" class="err">{{ error }}</p>
    <div class="panel">
      <div class="toolbar">
        <input
          v-model="q"
          placeholder="搜索账号 / 动作 / 路径"
          @keyup.enter="search"
        />
        <button class="btn ghost sm" type="button" @click="search">搜索</button>
        <span class="hint">共 {{ total }}{{ loading ? ' · 加载中' : '' }}</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>账号</th>
              <th>角色</th>
              <th>动作</th>
              <th>方法</th>
              <th>路径</th>
              <th>IP</th>
              <th>详情</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id">
              <td>{{ shortTime(row.createdAt) }}</td>
              <td>{{ row.username }}</td>
              <td>{{ row.role }}</td>
              <td>{{ row.action }}</td>
              <td>{{ row.method }}</td>
              <td>{{ row.path }}</td>
              <td>{{ row.ip || '—' }}</td>
              <td class="mono">{{ row.detail }}</td>
            </tr>
            <tr v-if="!rows.length">
              <td colspan="8" class="hint">暂无审计记录</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="pager">
        <button class="btn ghost sm" type="button" :disabled="page <= 1" @click="changePage(-1)">
          上一页
        </button>
        <span>第 {{ page }} 页</span>
        <button
          class="btn ghost sm"
          type="button"
          :disabled="page * pageSize >= total"
          @click="changePage(1)"
        >
          下一页
        </button>
      </div>
    </div>
  </div>
</template>
