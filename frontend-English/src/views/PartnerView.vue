<script setup lang="ts">
const roomUrl = 'http://127.0.0.1:8768/'

function openRoom() {
  window.open(roomUrl, '_blank', 'noopener')
}
</script>

<template>
  <section class="page">
    <div class="head">
      <div>
        <h1>我的伙伴</h1>
        <p class="muted">学习赚积分，装扮伙伴小屋。本机预览地址：{{ roomUrl }}</p>
      </div>
    </div>
    <div class="card hero">
      <div>
        <div class="tag green">学习小屋</div>
        <h2>杏橘狐在等你回家</h2>
        <p class="muted">
          闯关攒下的积分，可以在小屋里兑换家具、扩建楼层。请先启动房间预览服务，再点下方按钮进入。
        </p>
        <div class="actions">
          <button class="btn" type="button" @click="openRoom">打开伙伴小屋</button>
          <a class="btn line" :href="roomUrl" target="_blank" rel="noopener">新窗口打开</a>
        </div>
      </div>
      <img src="/illustrations/fox.png" alt="" />
    </div>
  </section>
</template>

<style scoped>
.head {
  margin-bottom: 18px;
}

.hero {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
  gap: 24px;
  align-items: center;
  min-height: 320px;
  background:
    linear-gradient(135deg, #fff 0%, #f3fbf7 55%, #fff8ea 100%);
}

.hero img {
  width: min(100%, 280px);
  justify-self: end;
  border-radius: 24px;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 20px;
}

@media (max-width: 860px) {
  .hero {
    grid-template-columns: 1fr;
  }

  .hero img {
    justify-self: start;
  }
}
</style>
