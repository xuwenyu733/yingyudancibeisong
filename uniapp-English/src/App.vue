<script setup lang="ts">
import { onLaunch } from "@dcloudio/uni-app";
import { useSessionStore } from "./stores/session";
import { usePlayerStore } from "./stores/player";
import { hydrateSafeArea } from "./utils/safe-area";

onLaunch(() => {
  const top = hydrateSafeArea();
  // H5 / App WebView 页都写入变量，避免刘海/挖孔挡住内容
  // #ifdef H5
  document.documentElement.style.setProperty("--app-status-bar", `${top}px`);
  // #endif
  // #ifdef APP-PLUS
  try {
    const doc = plus.webview.currentWebview?.() as unknown as {
      evalJS?: (code: string) => void;
    };
    doc?.evalJS?.(
      `document.documentElement.style.setProperty('--app-status-bar','${top}px');`,
    );
  } catch {
    /* ignore */
  }
  // #endif
  useSessionStore().hydrate();
  usePlayerStore().hydrate();
});
</script>

<style>
/* 单词闯关 · 奶油底 + 薄荷绿（对齐手机端效果图） */
page {
  background: #f7f4ee;
  background-image: radial-gradient(
      900rpx 420rpx at 12% -8%,
      rgba(255, 248, 232, 0.95) 0%,
      transparent 55%
    ),
    radial-gradient(
      700rpx 360rpx at 92% 0%,
      rgba(232, 247, 240, 0.9) 0%,
      transparent 50%
    ),
    linear-gradient(180deg, #fbfaf6 0%, #f7f4ee 55%, #eef6ef 100%);
  color: #1d3557;
  font-size: 28rpx;
  font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
}

button {
  margin: 0;
  padding: 0;
  line-height: 1.4;
}

button::after {
  border: none;
}

.page {
  min-height: 100vh;
  /* status-bar / safe-area 取较大者，避开摄像头与刘海 */
  padding-top: calc(
    24rpx + max(
      var(--status-bar-height, 0px),
      var(--app-status-bar, 0px),
      env(safe-area-inset-top, 0px)
    )
  );
  padding-right: 28rpx;
  padding-bottom: calc(48rpx + env(safe-area-inset-bottom, 0px));
  padding-left: 28rpx;
  box-sizing: border-box;
}

/* 无正式插画时用的狐狸样式占位，避免破图 */
.mascot-place {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 36rpx;
  background:
    radial-gradient(circle at 30% 28%, #ffe8c2 0%, transparent 42%),
    linear-gradient(160deg, #fff4df 0%, #dff4ea 55%, #e8f7f0 100%);
  overflow: hidden;
}

.mascot-place::before {
  content: "🦊";
  font-size: 72rpx;
  line-height: 1;
  z-index: 1;
}

.mascot-place.sm::before {
  font-size: 40rpx;
}

.mascot-place.md::before {
  font-size: 56rpx;
}

.mascot-place.lg::before {
  font-size: 96rpx;
}

.mascot-place.round {
  border-radius: 50%;
}

.ellipsis {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.card {
  background: #ffffff;
  border-radius: 32rpx;
  padding: 28rpx;
  margin-bottom: 20rpx;
  border: 2rpx solid #e6eee9;
  box-shadow: 0 12rpx 28rpx rgba(29, 53, 87, 0.05);
}

.kicker {
  color: #2eb086;
  font-size: 24rpx;
  font-weight: 700;
}

.muted {
  color: #6b7c8f;
  font-size: 24rpx;
  line-height: 1.65;
}

.btn {
  background: #2eb086;
  color: #ffffff;
  border-radius: 999rpx;
  height: 92rpx;
  line-height: 92rpx;
  font-size: 30rpx;
  font-weight: 700;
  box-shadow: 0 10rpx 20rpx rgba(46, 176, 134, 0.28);
}

.btn[disabled] {
  background: #b7dccb;
  box-shadow: none;
  color: #ffffff;
}

.btn-line {
  margin-top: 16rpx;
  background: #ffffff;
  color: #249672;
  border: 3rpx solid #c9e8da;
  box-shadow: none;
}

.field {
  height: 88rpx;
  background: #fbfcfa;
  border-radius: 24rpx;
  padding: 0 24rpx;
  font-size: 30rpx;
  margin-top: 16rpx;
  border: 2rpx solid #e6eee9;
  box-sizing: border-box;
}

.tag {
  display: inline-flex;
  align-items: center;
  height: 44rpx;
  padding: 0 16rpx;
  border-radius: 999rpx;
  background: #fff3e4;
  color: #c56a12;
  font-size: 22rpx;
  font-weight: 700;
}

.tag.green {
  background: #e8f7f0;
  color: #249672;
}

.chip {
  display: inline-flex;
  align-items: center;
  padding: 10rpx 18rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.8);
  border: 2rpx solid #e6eee9;
  color: #4a5d73;
  font-size: 22rpx;
  font-weight: 650;
}

.pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 120rpx;
  height: 64rpx;
  padding: 0 22rpx;
  border-radius: 999rpx;
  border: 2rpx solid #e6eee9;
  background: #fff;
  color: #1d3557;
  font-weight: 650;
  font-size: 26rpx;
}

.pill.active {
  background: #e8f7f0;
  border-color: #2eb086;
  color: #249672;
}

.progress {
  height: 16rpx;
  border-radius: 999rpx;
  background: #e8eef0;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #49c295, #2eb086);
}
</style>
