<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { fetchOrders } from '../api'
import type { OrderRow } from '../types'

const rows = ref<OrderRow[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const q = ref('')
const status = ref('')
const loading = ref(false)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await fetchOrders({
      q: q.value.trim() || undefined,
      status: status.value || undefined,
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

onMounted(load)
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h1>订单与会员</h1>
        <p>搜索家长 / 套餐 / 单号，按状态筛选</p>
      </div>
    </div>
    <p v-if="error" class="err">{{ error }}</p>
    <div class="panel">
      <div class="toolbar">
        <input v-model="q" placeholder="搜索家长 / 套餐 / 单号" @keyup.enter="search" />
        <select v-model="status" @change="search">
          <option value="">全部状态</option>
          <option value="paid">已支付</option>
          <option value="pending">待支付</option>
          <option value="created">已创建</option>
          <option value="failed">失败</option>
          <option value="closed">已关闭</option>
        </select>
        <button class="btn ghost sm" type="button" @click="search">搜索</button>
        <span class="hint">共 {{ total }}{{ loading ? ' · 加载中' : '' }}</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>家长</th>
              <th>套餐</th>
              <th>金额(分)</th>
              <th>状态</th>
              <th>渠道</th>
              <th>支付时间</th>
              <th>创建时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="o in rows" :key="o.id">
              <td>{{ o.parentNickname }}</td>
              <td>{{ o.planId }}</td>
              <td>{{ o.amount }}</td>
              <td>
                <span
                  class="badge"
                  :class="
                    o.status === 'paid' ? 'on' : o.status === 'pending' || o.status === 'created' ? 'warn' : 'off'
                  "
                >
                  {{ o.status }}
                </span>
              </td>
              <td>{{ o.channel }}</td>
              <td>{{ o.paidAt || '—' }}</td>
              <td>{{ o.createdAt }}</td>
            </tr>
            <tr v-if="!rows.length">
              <td colspan="7" class="hint">暂无订单</td>
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
