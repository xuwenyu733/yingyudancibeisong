<template>
  <view class="room-page">
    <view class="bar" :style="barStyle">
      <view class="page-back" role="button" aria-label="返回" @click="back" />
      <text class="title">学习小屋</text>
      <view class="bar-actions">
        <!-- #ifdef APP-PLUS -->
        <button class="back ghost" @click="toggleOrientation">横竖切换</button>
        <!-- #endif -->
        <button class="back ghost" @click="reload">刷新</button>
      </view>
    </view>

    <view class="stage">
      <!-- #ifdef H5 -->
      <iframe
        v-if="roomSrc"
        class="frame"
        :src="roomSrc"
        title="杏橘狐学习小屋"
        allow="autoplay; fullscreen"
        allowfullscreen
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
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { onHide, onReady, onShow } from "@dcloudio/uni-app";
import { usePlayerStore } from "../../stores/player";
import { buildAuthenticatedRoomUrl, createNativeRoomOrientation } from "../../utils/room-bridge";
import { chromePadStyle, hydrateSafeArea, statusBarPx } from "../../utils/safe-area";

const BAR_CONTENT = 44;
const barStyle = computed(() => chromePadStyle(BAR_CONTENT));

const player = usePlayerStore();
const roomOrientation = createNativeRoomOrientation();
const roomSrc = ref("");
const tip = ref("");
const tipFading = ref(false);
let roomGeneration = 0;
let pageActive = false;
let layoutTimer: ReturnType<typeof setTimeout> | null = null;
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

/** App：把原生子 webview 顶下去，露出自定义薄荷绿顶栏 */
function layoutAppWebview() {
  // #ifdef APP-PLUS
  try {
    if (!pageActive || !roomSrc.value) return;
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
    const screenHeight = Number(plus.display.resolutionHeight) || uni.getSystemInfoSync().windowHeight;
    const height = Math.max(120, screenHeight - top);
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
  clearLayoutTimer();
  if (!pageActive) return;
  layoutTimer = setTimeout(() => {
    layoutAppWebview();
    layoutTimer = null;
  }, 320);
  // #endif
}

function clearLayoutTimer() {
  if (layoutTimer) clearTimeout(layoutTimer);
  layoutTimer = null;
}

async function refresh() {
  if (!pageActive) return;
  const serial = ++roomGeneration;
  player.hydrate(); hydrateSafeArea(); roomSrc.value = "";
  showTip("正在连接你的小屋…", true);
  try {
    const url = await buildAuthenticatedRoomUrl();
    if (serial !== roomGeneration) return;
    roomSrc.value = url;
    dismissTip();
    await nextTick();
    if (serial === roomGeneration) scheduleLayout();
  } catch (error) {
    if (serial === roomGeneration) showTip(error instanceof Error ? error.message : "小屋连接未完成，请点击刷新重试", true);
  }
}

function reload() {
  void refresh();
}

// #ifdef APP-PLUS
function toggleOrientation() {
  const { windowWidth, windowHeight } = uni.getSystemInfoSync();
  const direction = windowWidth > windowHeight ? "portrait" : "landscape";
  if (!roomOrientation.set(direction)) showTip("暂时无法切换屏幕方向");
  else scheduleLayout();
}
// #endif

function back() {
  pageActive = false;
  clearLayoutTimer();
  ++roomGeneration;
  roomOrientation.leave();
  // 固定回到家园 Tab（学习小屋入口页），不依赖页面栈来源
  uni.switchTab({ url: "/pages/pet/index" });
}

function onMessage(event: { detail?: { data?: unknown[] } }) {
  const payload = event.detail?.data?.[0] as
    | { event?: string; detail?: { applied?: number } }
    | undefined;
  if ((payload?.event === "room-access-exit" || payload?.event === "host-exit")) { back(); return; }
  if (payload?.event === "host-credits-applied") {
    handleCreditsApplied(payload.detail?.applied || 0);
  }
}

function onWindowMessage(event: MessageEvent) {
  const frame = document.querySelector(".room-page iframe") as HTMLIFrameElement | null;
  if (!frame || event.source !== frame.contentWindow || !roomSrc.value || event.origin !== new URL(roomSrc.value).origin) return;
  const data = event.data as { event?: string; detail?: { applied?: number } };
  if ((data?.event === "room-access-exit" || data?.event === "host-exit")) { back(); return; }
  if (data?.event === "host-credits-applied") {
    handleCreditsApplied(data.detail?.applied || 0);
  }
}

onReady(scheduleLayout);

onMounted(() => {
  uni.onWindowResize(scheduleLayout);
  // #ifdef H5
  window.addEventListener("message", onWindowMessage);
  // #endif
});

onUnmounted(() => {
  pageActive = false;
  uni.offWindowResize(scheduleLayout);
  clearLayoutTimer();
  ++roomGeneration;
  clearTipTimer();
  roomOrientation.leave();
  // #ifdef H5
  window.removeEventListener("message", onWindowMessage);
  // #endif
});

onShow(() => {
  pageActive = true;
  void refresh();
});
onHide(() => {
  pageActive = false;
  clearLayoutTimer();
  ++roomGeneration;
  roomSrc.value = "";
  clearTipTimer();
  roomOrientation.leave();
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
  position: relative;
  z-index: 20;
  box-sizing: border-box;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-right: 12px;
  padding-left: 8px;
  background: rgba(247, 244, 238, 0.98);
  border-bottom: 1px solid #e5dcc7;
  backdrop-filter: blur(8px);
}

.title {
  flex: 1;
  min-width: 0;
  text-align: center;
  font-weight: 800;
  font-size: 15px;
  color: #465341;
}

.bar-actions { display: flex; align-items: center; gap: 6px; }

.back {
  min-width: 56px;
  height: 32px;
  line-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  margin: 0;
  border: 0;
  background: #587553;
  color: #ffffff;
  font-size: 12px;
}

.back.ghost {
  background: #fffdfa;
  color: #53674e;
  border: 1px solid #dddcc9;
}
.back::after { border: 0; }

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
@media (orientation: landscape) and (max-height: 500px) {
  .bar { padding-right: max(10px, env(safe-area-inset-right)); padding-left: max(10px, env(safe-area-inset-left)); gap: 6px; }
  .back { height: 28px; line-height: 28px; font-size: 11px; }
  .title { font-size: 13px; }
  .tip { left: max(10px, env(safe-area-inset-left)); right: calc(86px + env(safe-area-inset-right)); padding: 5px 9px; font-size: 11px; pointer-events: none; }
}
</style>
