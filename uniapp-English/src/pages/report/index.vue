<template>
  <view class="page">
    <view class="card">
      <text class="kicker">近 7 天</text>
      <view class="heading">{{ title }}</view>
      <view class="stats">
        <view>
          <view class="num">{{ report?.studiedCount || 0 }}</view>
          <text class="muted">词次</text>
        </view>
        <view>
          <view class="num">{{ report?.accuracy || 0 }}%</view>
          <text class="muted">正确率</text>
        </view>
        <view>
          <view class="num">{{ report?.streak || 0 }}</view>
          <text class="muted">连续天数</text>
        </view>
      </view>
      <view class="bars">
        <view v-for="item in report?.daily || []" :key="item.date" class="bar-col">
          <view class="bar" :style="{ height: barHeight(item.count) }" />
          <text class="day">{{ item.date.slice(5) }}</text>
        </view>
      </view>
      <button class="btn action" :disabled="!report || making" @click="makePoster">
        {{ making ? "生成中..." : "生成分享海报" }}
      </button>
    </view>

    <view class="card">
      <view class="heading">薄弱词</view>
      <text v-if="!report?.wrongTop.length" class="muted">最近没有反复出错的词。</text>
      <view v-for="word in report?.wrongTop || []" :key="word.spelling" class="weak">
        <text>{{ word.spelling }} · {{ word.meaning }}</text>
        <text class="count">错 {{ word.wrongCount }}</text>
      </view>
    </view>

    <view v-if="posterPath" class="card preview">
      <view class="heading">海报预览</view>
      <image class="poster" :src="posterPath" mode="widthFix" @click="preview" />
      <button class="btn action" @click="savePoster">保存到相册</button>
      <button class="btn btn-line" open-type="share">分享给好友</button>
    </view>

    <canvas
      canvas-id="weeklyPoster"
      class="hidden-canvas"
      :style="{ width: '600px', height: '900px' }"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onShareAppMessage, onShow } from "@dcloudio/uni-app";
import { fetchWeekly } from "../../api";
import type { WeeklyReport } from "../../types/api";
import { ensureLogin } from "../../utils/auth";
import { errorMessage } from "../../utils/format";
import { drawWeeklyPoster } from "../../utils/poster";

const report = ref<WeeklyReport | null>(null);
const posterPath = ref("");
const making = ref(false);
const title = computed(() =>
  report.value?.child ? `${report.value.child.nickname}的学习周报` : "学习周报",
);
const maxCount = computed(() =>
  Math.max(1, ...(report.value?.daily.map((item) => item.count) || [1])),
);

function barHeight(count: number) {
  return `${Math.max(8, Math.round((count / maxCount.value) * 160))}rpx`;
}

function makePoster() {
  if (!report.value) return;
  making.value = true;
  const ctx = uni.createCanvasContext("weeklyPoster");
  drawWeeklyPoster(ctx, { title: title.value, report: report.value });
  ctx.draw(false, () => {
    setTimeout(() => {
      uni.canvasToTempFilePath({
        canvasId: "weeklyPoster",
        width: 600,
        height: 900,
        destWidth: 600,
        destHeight: 900,
        success: (res) => {
          posterPath.value = res.tempFilePath;
          uni.showToast({ title: "海报已生成", icon: "success" });
        },
        fail: () => {
          uni.showToast({ title: "海报生成失败", icon: "none" });
        },
        complete: () => {
          making.value = false;
        },
      });
    }, 120);
  });
}

function preview() {
  if (!posterPath.value) return;
  uni.previewImage({ urls: [posterPath.value] });
}

function savePoster() {
  if (!posterPath.value) return;
  uni.saveImageToPhotosAlbum({
    filePath: posterPath.value,
    success: () => uni.showToast({ title: "已保存", icon: "success" }),
    fail: () => {
      uni.showModal({
        title: "需要相册权限",
        content: "请在设置里允许保存到相册后重试",
        showCancel: false,
      });
    },
  });
}

onShareAppMessage(() => ({
  title: title.value,
  path: "/pages/home/index",
  imageUrl: posterPath.value || undefined,
}));

onShow(() => {
  if (!ensureLogin()) return;
  fetchWeekly()
    .then((result) => {
      report.value = result;
    })
    .catch((error: unknown) => {
      uni.showToast({ title: errorMessage(error), icon: "none" });
    });
});
</script>

<style scoped>
.heading {
  margin: 8rpx 0 16rpx;
  font-size: 36rpx;
  font-weight: 700;
}

.stats {
  display: flex;
  justify-content: space-between;
}

.num {
  font-size: 40rpx;
  font-weight: 700;
}

.bars {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  height: 220rpx;
  margin-top: 28rpx;
}

.bar-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 72rpx;
}

.bar {
  width: 28rpx;
  border-radius: 999rpx;
  background: linear-gradient(180deg, #ffc857, #ff6b6b);
}

.day {
  margin-top: 8rpx;
  color: #7a8499;
  font-size: 20rpx;
}

.weak {
  display: flex;
  justify-content: space-between;
  padding: 16rpx 0;
  border-top: 1rpx solid #ffe8e0;
}

.count {
  color: #d97706;
}

.action {
  margin-top: 28rpx;
}

.preview .poster {
  width: 100%;
  border-radius: 20rpx;
  background: #eef2f7;
}

.hidden-canvas {
  position: fixed;
  left: -9999px;
  top: -9999px;
  width: 600px;
  height: 900px;
}
</style>
