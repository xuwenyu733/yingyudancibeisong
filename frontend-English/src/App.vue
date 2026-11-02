<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const bare = computed(() => route.meta.bare === true)
</script>

<template>
  <router-view v-if="bare" />
  <div v-else class="shell">
    <aside class="side">
      <div class="brand">
        <span class="mark">词</span>
        <span>小学单词闯关</span>
      </div>
      <nav class="nav">
        <router-link to="/home">今日</router-link>
        <router-link to="/library">词库</router-link>
        <router-link to="/wrong">错词</router-link>
        <router-link to="/parent">家长</router-link>
      </nav>
    </aside>
    <main class="main">
      <router-view />
    </main>
  </div>
</template>
