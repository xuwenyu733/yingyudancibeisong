<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { fetchChildren } from './api'
import { useSessionStore } from './stores/session'
import { resolveAvatar } from './utils/avatar'
import { gradeLabel } from './utils/format'

const route = useRoute()
const session = useSessionStore()
const bare = computed(() => route.meta.bare === true)
const childName = ref('未建档')
const childGrade = ref('')
const avatar = ref(resolveAvatar())

const links = [
  { to: '/home', label: '今日冒险', icon: 'home' },
  { to: '/library', label: '单词地图', icon: 'book' },
  { to: '/wrong', label: '复习小站', icon: 'review' },
  { to: '/partner', label: '我的伙伴', icon: 'pet' },
  { to: '/parent', label: '家长中心', icon: 'parent' },
] as const

async function loadChild() {
  if (!session.token) return
  try {
    const result = await fetchChildren()
    const current = result.items.find((item) => item.id === result.currentChildId) || result.items[0]
    if (current) {
      childName.value = current.nickname
      childGrade.value = gradeLabel(current.grade)
      avatar.value = resolveAvatar(current.nickname)
    } else {
      childName.value = '未建档'
      childGrade.value = '先创建学习档案'
      avatar.value = resolveAvatar()
    }
  } catch {
    childName.value = '未建档'
    childGrade.value = ''
    avatar.value = resolveAvatar()
  }
}

onMounted(() => {
  void loadChild()
})

watch(
  () => [route.fullPath, session.token],
  () => {
    void loadChild()
  },
)
</script>

<template>
  <router-view v-if="bare" />
  <div v-else class="shell">
    <aside class="side">
      <div class="brand">
        <img class="brand-mark" src="/illustrations/fox.png" alt="" />
        <div class="brand-text">
          <span class="brand-title">单词闯关</span>
          <span class="brand-sub">小学 · 初中</span>
        </div>
      </div>
      <nav class="nav">
        <router-link v-for="link in links" :key="link.to" :to="link.to">
          <span class="nav-icon" :data-icon="link.icon" aria-hidden="true" />
          <span>{{ link.label }}</span>
        </router-link>
      </nav>
      <div class="side-foot">
        <img class="side-avatar" :src="avatar" alt="" />
        <div>
          <strong>{{ childName }}</strong>
          <span>{{ childGrade }}</span>
        </div>
      </div>
    </aside>
    <main class="main">
      <router-view />
    </main>
  </div>
</template>
