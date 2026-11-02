<template>
  <view class="page">
    <view class="hero">
      <view class="mascot-row">
        <view class="bubble">Hi~</view>
        <view class="mascot">🦊</view>
      </view>
      <text class="kicker">单词小闯关 · 边学边装扮</text>
      <view class="hero-title">今天也来闯一关吧</view>
      <view class="badge-row">
        <text class="badge streak">🔥 连续 {{ task?.streak || 0 }} 天</text>
        <text class="badge coin">⭐ {{ player.points }} 积分</text>
      </view>
    </view>

    <view v-if="errorText" class="card">
      <text>{{ errorText }}</text>
    </view>

    <view v-else-if="task?.needChild" class="card soft">
      <view class="emoji-lg">🎒</view>
      <view class="heading">先给小朋友建档</view>
      <text class="muted">建好档案，就能开始今日闯关啦。</text>
      <button class="btn action" @click="goCreate">创建档案</button>
    </view>

    <view v-else class="card soft">
      <text class="muted"
        >{{ task?.textbook?.name }} · {{ task?.child?.nickname }}</text
      >
      <view class="heading">{{ task?.unit?.title || "今日闯关" }}</view>
      <view class="queue-row">
        <text class="chip new"
          >新词还剩 {{ task?.newRemaining ?? task?.remaining ?? 0 }} 个哦～</text
        >
        <text class="chip review"
          >到期复习 {{ task?.reviewDue ?? 0 }} 个</text
        >
      </view>
      <view class="progress-row">
        <text
          >今天练了 {{ task?.studiedToday || 0 }} 次 · 新词额度
          {{ task?.newLimit || task?.dailyLimit || 0 }}</text
        >
        <text class="tag">{{ task?.member ? "会员小达人" : "免费体验" }}</text>
      </view>
      <view class="track">
        <view class="fill" :style="{ width: progress }" />
      </view>
      <button class="btn action" :disabled="!canStart" @click="start">
        {{ startLabel }}
      </button>
      <button class="btn btn-line" @click="goWrong">📒 错词本</button>
      <button class="btn btn-line" @click="goPet">🏠 学习小屋兑奖励</button>
      <button v-if="!task?.member" class="btn btn-line" @click="goMember">
        开通学期会员
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { fetchToday } from "../../api";
import type { TodayTask } from "../../types/api";
import { usePlayerStore } from "../../stores/player";
import { ensureLogin } from "../../utils/auth";
import { errorMessage } from "../../utils/format";

const player = usePlayerStore();
const task = ref<TodayTask | null>(null);
const errorText = ref("");

const progress = computed(() => {
  const newLimit = task.value?.newLimit || task.value?.dailyLimit || 1;
  const newLeft = task.value?.newRemaining ?? 0;
  const done = Math.max(0, newLimit - newLeft);
  return `${Math.min(100, Math.round((done / newLimit) * 100))}%`;
});

const canStart = computed(() => (task.value?.words.length || 0) > 0);

const startLabel = computed(() => {
  if (!task.value) return "加载中...";
  if (canStart.value) {
    const n = task.value.newRemaining ?? 0;
    const r = task.value.reviewDue ?? 0;
    if (r > 0 && n > 0) return `🚀 继续闯关（${r} 复习 + ${n} 新词）`;
    if (r > 0) return `🚀 先把 ${r} 个到期词复习掉`;
    return `🚀 继续闯关 · ${task.value.words.length} 个新词`;
  }
  return "今天的任务都清完啦";
});

async function load() {
  errorText.value = "";
  try {
    task.value = await fetchToday();
  } catch (error) {
    errorText.value = errorMessage(error);
  }
}

function start() {
  const unitId = task.value?.unit?.id;
  uni.navigateTo({
    url: unitId ? `/pages/study/play?unitId=${unitId}` : "/pages/study/play",
  });
}

function goCreate() {
  uni.navigateTo({ url: "/pages/child/create" });
}

function goMember() {
  uni.navigateTo({ url: "/pages/member/index" });
}

function goWrong() {
  uni.navigateTo({ url: "/pages/wrong/index" });
}

function goPet() {
  uni.switchTab({ url: "/pages/pet/index" });
}

onShow(() => {
  if (!ensureLogin()) return;
  player.hydrate();
  void player.refreshWallet().catch(() => undefined);
  void load();
});
</script>

<style scoped>
.hero {
  padding: 8rpx 8rpx 24rpx;
}

.mascot-row {
  display: flex;
  align-items: flex-end;
  gap: 12rpx;
  margin-bottom: 8rpx;
}

.bubble {
  background: #ffffff;
  border: 3rpx solid #ffd4c8;
  border-radius: 24rpx 24rpx 24rpx 8rpx;
  padding: 8rpx 18rpx;
  font-size: 22rpx;
  font-weight: 700;
  color: #ff6b6b;
}

.mascot {
  width: 88rpx;
  height: 88rpx;
  border-radius: 50%;
  background: linear-gradient(160deg, #ffe29a, #ffb38a);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48rpx;
  box-shadow: 0 8rpx 18rpx rgba(255, 160, 80, 0.28);
}

.hero-title {
  margin-top: 12rpx;
  font-size: 48rpx;
  font-weight: 800;
  color: #2b3550;
  letter-spacing: 1rpx;
}

.badge-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 16rpx;
}

.badge {
  font-size: 22rpx;
  font-weight: 700;
  padding: 10rpx 18rpx;
  border-radius: 999rpx;
}

.streak {
  background: #fff0e8;
  color: #ff6b6b;
}

.coin {
  background: #fff7d9;
  color: #c98500;
}

.soft {
  position: relative;
}

.emoji-lg {
  font-size: 56rpx;
  margin-bottom: 8rpx;
}

.heading {
  margin: 8rpx 0 20rpx;
  font-size: 36rpx;
  font-weight: 800;
}

.queue-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-bottom: 16rpx;
}

.chip {
  font-size: 22rpx;
  font-weight: 700;
  padding: 10rpx 16rpx;
  border-radius: 999rpx;
}

.chip.new {
  background: #fff0e8;
  color: #ff6b6b;
}

.chip.review {
  background: #e6fbf7;
  color: #1aa894;
}

.progress-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #7a8499;
  font-size: 24rpx;
}

.tag {
  background: #e6fbf7;
  color: #1aa894;
  padding: 6rpx 14rpx;
  border-radius: 999rpx;
  font-weight: 700;
  font-size: 22rpx;
}

.track {
  height: 20rpx;
  margin: 18rpx 0 28rpx;
  border-radius: 999rpx;
  background: #ffe8e0;
  overflow: hidden;
}

.fill {
  height: 100%;
  border-radius: 999rpx;
  background: linear-gradient(90deg, #ffc857, #ff6b6b);
}

.action {
  margin-top: 8rpx;
}
</style>
