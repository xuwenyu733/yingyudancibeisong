<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '../stores/session'

const session = useSessionStore()
const router = useRouter()

const roleLabel = computed(() =>
  session.isSuper ? '超级管理员' : '运营',
)

const menus = computed(() => {
  const base = [
    { to: '/dashboard', label: '数据看板', ico: '▣' },
    { to: '/catalog', label: '词库管理', ico: '▤' },
    { to: '/users', label: '家长 / 孩子', ico: '◎' },
    { to: '/orders', label: '订单与会员', ico: '◇' },
    { to: '/tasks', label: '每日任务', ico: '✓' },
    { to: '/shop', label: '积分商城', ico: '✦' },
    { to: '/plans', label: '会员套餐', ico: '¥' },
  ]
  if (session.isSuper) {
    base.push(
      { to: '/audits', label: '操作审计', ico: '☰' },
      { to: '/admins', label: '系统设置', ico: '⚙' },
    )
  }
  return base
})

function logout() {
  session.logout()
  router.push('/login')
}
</script>

<template>
  <div class="shell">
    <aside class="side">
      <div class="brand">
        <span class="mark">词</span>
        <div class="brand-copy">
          <strong>小学单词闯关</strong>
          <span>管理后台</span>
        </div>
      </div>
      <nav class="nav">
        <router-link v-for="item in menus" :key="item.to" :to="item.to">
          <span class="nav-ico">{{ item.ico }}</span>
          <span>{{ item.label }}</span>
        </router-link>
      </nav>
      <div class="side-foot">
        ADMIN / SUPER_ADMIN 统一入口<br />
        按角色显示菜单与写权限
      </div>
    </aside>

    <div class="workspace">
      <header class="topbar">
        <span class="topbar-user">
          {{ roleLabel }} · <b>{{ session.user?.username }}</b>
        </span>
        <button class="link-btn" type="button" @click="logout">退出</button>
        <button
          v-if="session.isSuper"
          class="chip-btn"
          type="button"
          @click="router.push('/admins')"
        >
          管理员账号
        </button>
      </header>

      <div v-if="session.notice" class="toast" role="status">
        {{ session.notice }}
        <button class="link-btn" type="button" @click="session.clearNotice()">
          关闭
        </button>
      </div>

      <main class="main">
        <router-view />
      </main>
    </div>
  </div>
</template>
