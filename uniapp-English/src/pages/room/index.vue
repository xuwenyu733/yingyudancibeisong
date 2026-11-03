<template>
  <view class="room-page">
    <view class="bar">
      <button class="back" @click="back">返回</button>
      <text class="title">学习小屋</text>
      <button class="back ghost" @click="reload">刷新</button>
    </view>

    <view class="stage">
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

      <view v-if="tip" class="tip" :class="{ fade: tipFading }" @click="dismissTip">
        {{ tip }}
      </view>
    </view>
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
const tipFading = ref(false);
let tipTimer: ReturnType<typeof setTimeout> | null = null;

function clearTipTimer() {
  if (tipTimer) {
    clearTimeout(tipTimer);
    tipTimer = null;
  }
}

function showTip(message: string, sticky = false) {
  clearTipTimer();
  tipFading.value = false;
  tip.value = message;
  if (sticky) return;
  tipTimer = setTimeout(() => {
    tipFading.value = true;
    tipTimer = setTimeout(() => {
      tip.value = "";
      tipFading.value = false;
      tipTimer = null;
    }, 320);
  }, 3200);
}

function dismissTip() {
  clearTipTimer();
  tip.value = "";
  tipFading.value = false;
}

function handleCreditsApplied(applied = 0) {
  player.clearPending();
  showTip(`已同步学习奖励（${applied} 条），可在房内商店兑换。`);
}

function refresh() {
  player.hydrate();
  roomSrc.value = buildRoomUrl();
  const message = roomRuntimeTip();
  // 常规联调提示很快消失，避免挡住 3D 画面
  showTip(message, false);
}

function reload() {
  roomSrc.value = "";
  setTimeout(refresh, 30);
}

function back() {
  // 固定回到家园 Tab（学习小屋入口页），不依赖页面栈来源
  uni.switchTab({ url: "/pages/pet/index" });
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
  clearTipTimer();
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
  height: 100dvh;
  display: flex;
  flex-direction: column;
  background: #f3eddd;
  overflow: hidden;
}

.bar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: calc(8px + env(safe-area-inset-top)) 10px 8px;
  background: rgba(255, 245, 240, 0.96);
  border-bottom: 1px solid #ffd4c8;
  backdrop-filter: blur(8px);
}

.title {
  font-weight: 800;
  font-size: 15px;
  color: #2b3550;
}

.back {
  min-width: 56px;
  height: 32px;
  line-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  background: linear-gradient(135deg, #ff7a6b, #ff5d8f);
  color: #ffffff;
  font-size: 12px;
}

.back.ghost {
  background: #ffffff;
  color: #ff6b6b;
  border: 1px solid #ffc9be;
}

.stage {
  position: relative;
  flex: 1;
  min-height: 0;
  width: 100%;
}

.frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
  background: #f3eddd;
}

.tip {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: calc(10px + env(safe-area-inset-bottom));
  z-index: 5;
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 12px;
  line-height: 1.45;
  color: #5b4636;
  background: rgba(255, 249, 235, 0.94);
  border: 1px solid rgba(214, 184, 140, 0.55);
  box-shadow: 0 6px 18px rgba(70, 50, 20, 0.12);
  transition: opacity 0.28s ease, transform 0.28s ease;
}

.tip.fade {
  opacity: 0;
  transform: translateY(6px);
}
</style>
