<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { fetchPlans, upsertPlan } from '../api'
import { useSessionStore } from '../stores/session'
import type { PlanRow } from '../types'

const session = useSessionStore()
const rows = ref<PlanRow[]>([])
const error = ref('')
const message = ref('')
const form = ref({
  planId: '',
  name: '',
  price: 0,
  days: 30,
  highlight: false,
  desc: '',
})

async function load() {
  rows.value = await fetchPlans()
}

onMounted(async () => {
  try {
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  }
})

function edit(row: PlanRow) {
  if (!session.isSuper) return
  form.value = {
    planId: row.id,
    name: row.name,
    price: row.price,
    days: row.days,
    highlight: row.highlight,
    desc: row.desc,
  }
}

async function save() {
  if (!session.isSuper) return
  message.value = ''
  error.value = ''
  try {
    await upsertPlan({
      ...form.value,
      price: Number(form.value.price),
      days: Number(form.value.days),
    })
    message.value = '套餐覆盖已保存'
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败'
  }
}
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h1>会员套餐</h1>
        <p>
          {{
            session.isSuper
              ? '可写入 PlanOverride；未覆盖则回落种子价'
              : '只读查看当前生效价格（改价需超级管理员）'
          }}
        </p>
      </div>
    </div>
    <p v-if="error" class="err">{{ error }}</p>
    <p v-if="message" class="ok">{{ message }}</p>

    <div v-if="session.isSuper" class="panel" style="margin-bottom: 14px">
      <div class="form-grid">
        <label>套餐 ID<input v-model="form.planId" /></label>
        <label>名称<input v-model="form.name" /></label>
        <label>价格(分)<input v-model.number="form.price" type="number" /></label>
        <label>天数<input v-model.number="form.days" type="number" /></label>
        <label>
          高亮
          <select v-model="form.highlight">
            <option :value="true">是</option>
            <option :value="false">否</option>
          </select>
        </label>
        <label class="full">描述<input v-model="form.desc" /></label>
      </div>
      <button class="btn" type="button" @click="save">保存覆盖</button>
    </div>

    <div class="panel">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>名称</th>
              <th>价格(分)</th>
              <th>天数</th>
              <th>覆盖</th>
              <th v-if="session.isSuper"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id">
              <td>{{ row.id }}</td>
              <td>{{ row.name }}</td>
              <td>{{ row.price }}</td>
              <td>{{ row.days }}</td>
              <td>{{ row.overridden ? '是' : '否' }}</td>
              <td v-if="session.isSuper">
                <button class="btn ghost sm" type="button" @click="edit(row)">改</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
