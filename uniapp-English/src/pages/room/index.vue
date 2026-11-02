<template>
  <view class="room-page">
    <view class="bar">
      <button class="back" @click="back">返回</button>
      <text class="title">学习小屋</text>
      <button class="back ghost" @click="reload">刷新</button>
    </view>

    <!-- #ifdef H5 -->
    <iframe
      v-if="roomSrc"
      class="frame"
      :src="roomSrc"
      title="杏橘狐学习小屋"
      allow="autoplay"
    />
    <!-- #endif -->

    <!-- #ifdef APP-PLUS -->
    <web-view v-if="roomSrc" class="frame" :src="roomSrc" @message="onMessage" />
    <!-- #endif -->

    <view v-if="tip" class="tip">{{ tip }}</view>
  </view>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { usePlayerStore } from "../../stores/player";
import { buildRoomUrl, roomRuntimeTip } from "../../utils/room-bridge";

const player = usePlayerStore();
const roomSrc = ref("");
const tip = ref("");

function handleCreditsApplied(applied = 0) {
  player.clearPending();
  tip.value = `已同步学习奖励（${applied} 条），可在房内商店兑换。`;
}

function refresh() {
  player.hydrate();
  roomSrc.value = buildRoomUrl();
  tip.value = roomRuntimeTip();
}

function reload() {
  roomSrc.value = "";
  setTimeout(refresh, 30);
}

function back() {
  uni.navigateBack({ fail: () => uni.switchTab({ url: "/pages/pet/index" }) });
}

function onMessage(event: { detail?: { data?: unknown[] } }) {
  const payload = event.detail?.data?.[0] as
    | { event?: string; detail?: { applied?: number } }
    | undefined;
  if (payload?.event === "host-credits-applied") {
    handleCreditsApplied(payload.detail?.applied || 0);
  }
}

function onWindowMessage(event: MessageEvent) {
  const data = event.data as { event?: string; detail?: { applied?: number } };
  if (data?.event === "host-credits-applied") {
    handleCreditsApplied(data.detail?.applied || 0);
  }
}

onMounted(() => {
  // #ifdef H5
  window.addEventListener("message", onWindowMessage);
  // #endif
});

onUnmounted(() => {
  // #ifdef H5
  window.removeEventListener("message", onWindowMessage);
  // #endif
});

onShow(() => {
  refresh();
});
</script>

<style scoped>
.room-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f6e9c9;
}

.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(12px + env(safe-area-inset-top)) 12px 10px;
  background: #fff5f0;
  border-bottom: 1px solid #ffd4c8;
}

.title {
  font-weight: 800;
  color: #2b3550;
}

.back {
  min-width: 64px;
  height: 34px;
  line-height: 34px;
  border-radius: 999px;
  background: linear-gradient(135deg, #ff7a6b, #ff5d8f);
  color: #ffffff;
  font-size: 13px;
}

.back.ghost {
  background: #ffffff;
  color: #ff6b6b;
  border: 1px solid #ffc9be;
}

.frame {
  flex: 1;
  width: 100%;
  border: 0;
  background: #eaf6ff;
}

.tip {
  padding: 10px 14px calc(10px + env(safe-area-inset-bottom));
  font-size: 12px;
  line-height: 1.5;
  color: #7a8499;
  background: #fff9eb;
}
</style>
