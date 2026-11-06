<template>
  <view class="room-page">
    <!-- App 上 web-view 默认盖住同页组件，需用 plus 把子 webview 下移露出顶栏 -->
    <view class="bar" :style="barStyle">
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
import { computed, onMounted, onUnmounted, ref } from "vue";
import { onReady, onShow } from "@dcloudio/uni-app";
import { usePlayerStore } from "../../stores/player";
import { buildRoomUrl, roomRuntimeTip } from "../../utils/room-bridge";
import { chromePadStyle, hydrateSafeArea, statusBarPx } from "../../utils/safe-area";

const BAR_CONTENT = 44;
const player = usePlayerStore();
const roomSrc = ref("");
const tip = ref("");
const tipFading = ref(false);
let tipTimer: ReturnType<typeof setTimeout> | null = null;
let layoutTimer: ReturnType<typeof setTimeout> | null = null;

const barStyle = computed(() => chromePadStyle(BAR_CONTENT));

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

/** App：把原生子 webview 顶下去，露出自定义薄荷绿顶栏 */
function layoutAppWebview() {
  // #ifdef APP-PLUS
  try {
    hydrateSafeArea();
    const pages = getCurrentPages();
    const page = pages[pages.length - 1] as {
      $getAppWebview?: () => {
        children: () => Array<{ setStyle: (style: Record<string, unknown>) => void }>;
      };
    };
    const current = page?.$getAppWebview?.();
    const child = current?.children?.()?.[0];
    if (!child) return;
    const top = Math.max(statusBarPx.value, 0) + BAR_CONTENT;
    const height = Math.max(120, plus.display.resolutionHeight - top);
    child.setStyle({
      top: `${top}px`,
      height: `${height}px`,
      scalable: false,
    });
  } catch {
    /* 基座差异忽略 */
  }
  // #endif
}

function scheduleLayout() {
  // #ifdef APP-PLUS
  if (layoutTimer) clearTimeout(layoutTimer);
  layoutTimer = setTimeout(() => {
    layoutAppWebview();
    layoutTimer = null;
  }, 320);
  // #endif
}

function refresh() {
  player.hydrate();
  hydrateSafeArea();
  roomSrc.value = buildRoomUrl();
  showTip(roomRuntimeTip(), false);
  scheduleLayout();
}

function reload() {
  roomSrc.value = "";
  setTimeout(refresh, 30);
}

function back() {
  uni.switchTab({ url: "/pages/pet/index" });
}

function onMessage(event: { detail?: { data?: unknown[] } }) {
  const payload = event.detail?.data?.[0] as
    | { event?: string; detail?: { applied?: number } }
    | undefined;
  if (payload?.event === "host-credits-applied") {
    handleCreditsApplied(payload.detail?.applied || 0);
  }
  if (payload?.event === "host-exit") back();
}

function onWindowMessage(event: MessageEvent) {
  const data = event.data as { event?: string; detail?: { applied?: number } };
  if (data?.event === "host-credits-applied") {
    handleCreditsApplied(data.detail?.applied || 0);
  }
  if (data?.event === "host-exit") back();
}

onReady(() => {
  scheduleLayout();
});

onMounted(() => {
  // #ifdef H5
  window.addEventListener("message", onWindowMessage);
  // #endif
});

onUnmounted(() => {
  clearTipTimer();
  if (layoutTimer) clearTimeout(layoutTimer);
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
  background: #eef6ef;
  overflow: hidden;
}

.bar {
  flex: none;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-right: 10px;
  padding-bottom: 8px;
  padding-left: 10px;
  box-sizing: border-box;
  background: rgba(232, 247, 240, 0.98);
  border-bottom: 1px solid #c9e8da;
  backdrop-filter: blur(8px);
}

.title {
  font-weight: 800;
  font-size: 15px;
  color: #1d3557;
}

.back {
  min-width: 56px;
  height: 32px;
  line-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  background: #2eb086;
  color: #ffffff;
  font-size: 12px;
  font-weight: 700;
  box-shadow: 0 4px 10px rgba(46, 176, 134, 0.28);
}

.back.ghost {
  background: #ffffff;
  color: #249672;
  border: 1px solid #c9e8da;
  box-shadow: none;
}

.stage {
  position: relative;
  flex: 1;
  min-height: 0;
  width: 100%;
  background: #f3eddd;
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
  color: #1d3557;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid #c9e8da;
  box-shadow: 0 6px 18px rgba(29, 53, 87, 0.1);
  transition: opacity 0.28s ease, transform 0.28s ease;
}

.tip.fade {
  opacity: 0;
  transform: translateY(6px);
}
</style>
