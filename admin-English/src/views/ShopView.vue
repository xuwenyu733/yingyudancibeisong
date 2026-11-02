<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { deleteShop, fetchShop, upsertShop } from '../api'
import { useSessionStore } from '../stores/session'
import type { ShopItem } from '../types'

const session = useSessionStore()
const rows = ref<ShopItem[]>([])
const error = ref('')
const message = ref('')
const form = ref<ShopItem>({
  id: '',
  name: '',
  category: 'food',
  price: 10,
  desc: '',
  roomAction: 'feed',
  active: true,
})

async function load() {
  rows.value = await fetchShop()
}

onMounted(async () => {
  try {
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  }
})

function edit(row: ShopItem) {
  form.value = { ...row }
}

async function save() {
  if (!session.isSuper) return
  message.value = ''
  try {
    await upsertShop({ ...form.value, price: Number(form.value.price) })
    message.value = '商品已保存'
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败'
  }
}

async function remove(id: string) {
  if (!session.isSuper || !confirm('确认删除？')) return
  await deleteShop(id)
  await load()
}
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h1>商城</h1>
        <p>{{ session.isSuper ? '完整 CRUD' : '只读（超管可编辑）' }}</p>
      </div>
    </div>
    <p v-if="error" class="err">{{ error }}</p>
    <p v-if="message" class="ok">{{ message }}</p>

    <div v-if="session.isSuper" class="panel" style="margin-bottom: 14px">
      <div class="form-grid">
        <label>ID<input v-model="form.id" /></label>
        <label>名称<input v-model="form.name" /></label>
        <label>分类<input v-model="form.category" /></label>
        <label>价格<input v-model.number="form.price" type="number" /></label>
        <label>房间动作<input v-model="form.roomAction" /></label>
        <label>
          上架
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
              <th>名称</th>
              <th>分类</th>
              <th>价格</th>
              <th>动作</th>
              <th>状态</th>
              <th v-if="session.isSuper"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id">
              <td>{{ row.name }}</td>
              <td>{{ row.category }}</td>
              <td>{{ row.price }}</td>
              <td>{{ row.roomAction }}</td>
              <td>
                <span class="badge" :class="row.active ? 'on' : 'off'">
                  {{ row.active ? '上架' : '下架' }}
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
