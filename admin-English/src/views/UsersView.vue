<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { creditWallet, fetchChildren, fetchParents } from '../api'
import { useSessionStore } from '../stores/session'
import type { ChildRow, ParentRow } from '../types'

const session = useSessionStore()
const parents = ref<ParentRow[]>([])
const children = ref<ChildRow[]>([])
const parentTotal = ref(0)
const childTotal = ref(0)
const parentPage = ref(1)
const childPage = ref(1)
const parentQ = ref('')
const childQ = ref('')
const pageSize = 20
const loading = ref(false)
const error = ref('')
const message = ref('')
const creditForm = ref({ childId: '', amount: 10, reason: '后台手动加积分' })

async function loadParents() {
  const res = await fetchParents({
    q: parentQ.value.trim() || undefined,
    page: parentPage.value,
    pageSize,
  })
  parents.value = res.items
  parentTotal.value = res.total
}

async function loadChildren() {
  const res = await fetchChildren({
    q: childQ.value.trim() || undefined,
    page: childPage.value,
    pageSize,
  })
  children.value = res.items
  childTotal.value = res.total
}

async function reload() {
  loading.value = true
  error.value = ''
  try {
    await Promise.all([loadParents(), loadChildren()])
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(reload)

async function searchParents() {
  parentPage.value = 1
  try {
    await loadParents()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  }
}

async function searchChildren() {
  childPage.value = 1
  try {
    await loadChildren()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  }
}

async function changeParentPage(delta: number) {
  parentPage.value = Math.max(1, parentPage.value + delta)
  await loadParents()
}

async function changeChildPage(delta: number) {
  childPage.value = Math.max(1, childPage.value + delta)
  await loadChildren()
}

function pickChild(c: ChildRow) {
  creditForm.value.childId = c.id
}

async function doCredit() {
  message.value = ''
  error.value = ''
  try {
    await creditWallet(creditForm.value.childId.trim(), {
      amount: Number(creditForm.value.amount),
      reason: creditForm.value.reason,
    })
    message.value = '积分已发放'
    await loadChildren()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '发放失败'
  }
}
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h1>家长 / 孩子</h1>
        <p>支持搜索分页{{ session.isSuper ? '；超管可调积分' : '' }}</p>
      </div>
    </div>
    <p v-if="error" class="err">{{ error }}</p>
    <p v-if="message" class="ok">{{ message }}</p>
    <p v-if="loading" class="hint">加载中…</p>

    <div v-if="session.isSuper" class="panel" style="margin-bottom: 14px">
      <div class="toolbar"><strong>手动加积分</strong></div>
      <div class="form-grid">
        <label>
          孩子 ID
          <input v-model="creditForm.childId" list="child-ids" />
          <datalist id="child-ids">
            <option v-for="c in children" :key="c.id" :value="c.id">
              {{ c.nickname }}
            </option>
          </datalist>
        </label>
        <label>数量<input v-model.number="creditForm.amount" type="number" min="1" /></label>
        <label class="full">原因<input v-model="creditForm.reason" /></label>
      </div>
      <button class="btn" type="button" @click="doCredit">发放</button>
    </div>

    <div class="panel" style="margin-bottom: 14px">
      <div class="toolbar">
        <strong>家长</strong>
        <input
          v-model="parentQ"
          placeholder="搜索昵称 / openid / ID"
          @keyup.enter="searchParents"
        />
        <button class="btn ghost sm" type="button" @click="searchParents">搜索</button>
        <span class="hint">共 {{ parentTotal }}</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>昵称</th>
              <th>openid</th>
              <th>孩子数</th>
              <th>订单数</th>
              <th>会员到期</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in parents" :key="p.id">
              <td>{{ p.nickname }}</td>
              <td>{{ p.openid }}</td>
              <td>{{ p.childrenCount }}</td>
              <td>{{ p.ordersCount }}</td>
              <td>{{ p.memberUntil || '—' }}</td>
            </tr>
            <tr v-if="!parents.length">
              <td colspan="5" class="hint">暂无数据</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="pager">
        <button class="btn ghost sm" type="button" :disabled="parentPage <= 1" @click="changeParentPage(-1)">
          上一页
        </button>
        <span>第 {{ parentPage }} 页</span>
        <button
          class="btn ghost sm"
          type="button"
          :disabled="parentPage * pageSize >= parentTotal"
          @click="changeParentPage(1)"
        >
          下一页
        </button>
      </div>
    </div>

    <div class="panel">
      <div class="toolbar">
        <strong>孩子</strong>
        <input
          v-model="childQ"
          placeholder="搜索昵称 / 家长 / ID"
          @keyup.enter="searchChildren"
        />
        <button class="btn ghost sm" type="button" @click="searchChildren">搜索</button>
        <span class="hint">共 {{ childTotal }}</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>昵称</th>
              <th>年级</th>
              <th>家长</th>
              <th>积分</th>
              <th>学习次数</th>
              <th>ID</th>
              <th v-if="session.isSuper"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in children" :key="c.id">
              <td>{{ c.nickname }}</td>
              <td>{{ c.grade }}</td>
              <td>{{ c.parentNickname }}</td>
              <td>{{ c.balance }}</td>
              <td>{{ c.attempts }}</td>
              <td>{{ c.id }}</td>
              <td v-if="session.isSuper">
                <button class="btn ghost sm" type="button" @click="pickChild(c)">选中加分</button>
              </td>
            </tr>
            <tr v-if="!children.length">
              <td :colspan="session.isSuper ? 7 : 6" class="hint">暂无数据</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="pager">
        <button class="btn ghost sm" type="button" :disabled="childPage <= 1" @click="changeChildPage(-1)">
          上一页
        </button>
        <span>第 {{ childPage }} 页</span>
        <button
          class="btn ghost sm"
          type="button"
          :disabled="childPage * pageSize >= childTotal"
          @click="changeChildPage(1)"
        >
          下一页
        </button>
      </div>
    </div>
  </div>
</template>
