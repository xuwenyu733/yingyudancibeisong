<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { fetchDashboard, fetchOrders } from '../api'
import { useSessionStore } from '../stores/session'
import type { DashboardStats, OrderRow } from '../types'

const session = useSessionStore()
const stats = ref<DashboardStats | null>(null)
const orders = ref<OrderRow[]>([])
const error = ref('')

const maxDayTotal = computed(() => {
  if (!stats.value?.last7Days?.length) return 1
  return Math.max(1, ...stats.value.last7Days.map((d) => d.total))
})

const maxStatusCount = computed(() => {
  if (!stats.value?.orderByStatus?.length) return 1
  return Math.max(1, ...stats.value.orderByStatus.map((d) => d.count))
})

function statusClass(status: string) {
  if (status === 'paid') return 'on'
  if (status === 'pending' || status === 'created') return 'warn'
  if (status === 'failed' || status === 'closed') return 'off'
  return 'info'
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    paid: '已支付',
    pending: '待支付',
    created: '已创建',
    failed: '失败',
    closed: '已关闭',
  }
  return map[status] || status
}

function shortTime(iso: string) {
  return iso.replace('T', ' ').slice(0, 16)
}

function shortDay(day: string) {
  return day.slice(5)
}

onMounted(async () => {
  try {
    const [dash, orderPage] = await Promise.all([
      fetchDashboard(),
      fetchOrders({ page: 1, pageSize: 8 }),
    ])
    stats.value = dash
    orders.value = orderPage.items
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  }
})
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h1>数据看板</h1>
        <p>家长、孩子、词库与订单概览</p>
      </div>
    </div>

    <p v-if="error" class="err">{{ error }}</p>

    <template v-else-if="stats">
      <div class="stats">
        <div class="stat">
          <span>注册家长</span>
          <b>{{ stats.parents }}</b>
          <em>账号总量</em>
        </div>
        <div class="stat">
          <span>孩子档案</span>
          <b>{{ stats.children }}</b>
          <em>学习主体</em>
        </div>
        <div class="stat">
          <span>词库单词</span>
          <b>{{ stats.words.toLocaleString() }}</b>
          <em>可运营 CRUD</em>
        </div>
        <div class="stat">
          <span>会员订单</span>
          <b>{{ stats.paidOrders }}</b>
          <em>已支付 / 共 {{ stats.orders }}</em>
        </div>
      </div>

      <div class="charts">
        <div class="panel">
          <h2 class="panel-title">近 7 日订单</h2>
          <div class="bars">
            <div v-for="d in stats.last7Days" :key="d.day" class="bar-col">
              <div class="bar-track">
                <div
                  class="bar-fill paid"
                  :style="{ height: `${(d.paid / maxDayTotal) * 100}%` }"
                  :title="`已支付 ${d.paid}`"
                />
                <div
                  class="bar-fill total"
                  :style="{ height: `${(d.total / maxDayTotal) * 100}%` }"
                  :title="`下单 ${d.total}`"
                />
              </div>
              <span>{{ shortDay(d.day) }}</span>
              <em>{{ d.total }}</em>
            </div>
          </div>
          <p class="hint">蓝条=下单量，绿条=已支付</p>
        </div>

        <div class="panel">
          <h2 class="panel-title">订单状态分布</h2>
          <div v-if="stats.orderByStatus.length" class="status-bars">
            <div v-for="row in stats.orderByStatus" :key="row.status" class="status-row">
              <span>{{ statusLabel(row.status) }}</span>
              <div class="status-track">
                <div
                  class="status-fill"
                  :style="{ width: `${(row.count / maxStatusCount) * 100}%` }"
                />
              </div>
              <b>{{ row.count }}</b>
            </div>
          </div>
          <p v-else class="hint">暂无订单</p>
        </div>
      </div>

      <div class="charts" style="margin-top: 14px">
        <div class="panel">
          <h2 class="panel-title">近期订单动态</h2>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>事件</th>
                  <th>对象</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="o in orders" :key="o.id">
                  <td>{{ shortTime(o.createdAt) }}</td>
                  <td>会员下单 · {{ o.planId }}</td>
                  <td>
                    {{ o.parentNickname }} · ¥{{ (o.amount / 100).toFixed(2) }}
                  </td>
                  <td>
                    <span class="badge" :class="statusClass(o.status)">
                      {{ statusLabel(o.status) }}
                    </span>
                  </td>
                </tr>
                <tr v-if="!orders.length">
                  <td colspan="4" class="hint">暂无订单记录</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="panel">
          <h2 class="panel-title">
            最近操作
            <router-link
              v-if="session.isSuper"
              to="/audits"
              class="panel-link"
            >
              查看全部
            </router-link>
          </h2>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>账号</th>
                  <th>动作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="a in stats.recentAudits" :key="a.id">
                  <td>{{ shortTime(a.createdAt) }}</td>
                  <td>{{ a.username }}</td>
                  <td>{{ a.action }}</td>
                </tr>
                <tr v-if="!stats.recentAudits.length">
                  <td colspan="3" class="hint">暂无写操作记录</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </template>

    <p v-else class="hint">加载中…</p>
  </div>
</template>
