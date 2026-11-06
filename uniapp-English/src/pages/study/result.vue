<template>
  <view class="page">
    <view class="card result">
      <text class="kicker">{{ isReview ? "🎉 复习完成" : "🎉 本关完成" }}</text>
      <view class="score">{{ accuracy }}%</view>
      <view class="heading">答对 {{ correct }} / {{ total }}</view>
      <view v-if="earned > 0" class="earn">⭐ +{{ earned }} 积分</view>
      <text class="muted">{{ message }}</text>
      <text v-if="balance >= 0" class="muted balance">当前积分 {{ balance }}</text>
    </view>

    <view v-if="wrongs.length" class="card">
      <view class="heading left">本关错题 {{ wrongs.length }}</view>
      <view v-for="item in wrongs" :key="item.wordId + item.mode" class="wrong-row">
        <view class="wrong-main">
          <text class="spell">{{ item.spelling }}</text>
          <text class="muted">{{ item.meaning }}</text>
        </view>
        <text class="muted small"
          >{{ modeName(item.mode) }} · 你的答案：{{ item.userAnswer || "（空）" }}</text
        >
      </view>
      <button class="btn" @click="retestWrong">重测这些错词</button>
    </view>

    <button class="btn action" @click="goPet">去学习小屋兑换</button>
    <button class="btn btn-line" @click="again">
      {{ isReview ? "再复习一次" : "再闯一关" }}
    </button>
    <button class="btn btn-line" @click="home">
      {{ isReview ? "回错词本" : "回到首页" }}
    </button>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import { usePlayerStore } from "../../stores/player";
import {
  clearWrongDetails,
  loadWrongDetails,
  type WrongDetail,
} from "../../utils/sessionReport";

const player = usePlayerStore();
const correct = ref(0);
const total = ref(0);
const isReview = ref(false);
const earned = ref(0);
const balance = ref(0);
const wrongs = ref<WrongDetail[]>([]);
const accuracy = computed(() =>
  total.value === 0 ? 0 : Math.round((correct.value / total.value) * 100),
);
const message = computed(() => {
  if (earned.value > 0) {
    return isReview.value
      ? "复习积分已入账，进小屋还能同步给杏橘狐哦～"
      : "闯关积分已入账，可以去商城兑家具啦～";
  }
  if (isReview.value) {
    return accuracy.value >= 80
      ? "错词清得不错，掌握度也在往上爬。"
      : "还有没记住的，过一会儿再复习一次。";
  }
  return accuracy.value >= 80
    ? "这一关很稳，家长会看到进步。"
    : "弱词已记下，稍后再练一次。";
});

onLoad((query) => {
  correct.value = Number(query?.correct || 0);
  total.value = Number(query?.total || 0);
  isReview.value = query?.mode === "review";
  wrongs.value = loadWrongDetails();
  player.hydrate();

  const serverEarned = Number(query?.earned || 0);
  const serverBalance = query?.balance === "" || query?.balance == null
    ? NaN
    : Number(query.balance);
  const eventId =
    typeof query?.eventId === "string" ? decodeURIComponent(query.eventId) : "";
  const learned = Number(query?.learned || 0);
  const reviewed = Number(query?.reviewed || 0);

  if (!Number.isNaN(serverBalance)) {
    earned.value = player.applySessionReward({
      earnedPoints: serverEarned,
      balance: serverBalance,
      eventId,
      learned,
      reviewed,
    });
    balance.value = player.points;
  } else {
    // 兼容旧结果页参数
    earned.value = player.applySessionReward({
      earnedPoints: 0,
      balance: player.points,
    });
    balance.value = player.points;
  }
});

function modeName(mode: string) {
  const map: Record<string, string> = {
    read: "看词选义",
    listen: "听音选义",
    en2zh: "英译汉",
    zh2en: "汉译英",
    spell: "选拼写",
    write: "听写",
  };
  return map[mode] || mode;
}

function again() {
  clearWrongDetails();
  uni.redirectTo({
    url: isReview.value ? "/pages/study/play?mode=review" : "/pages/study/play",
  });
}

function retestWrong() {
  clearWrongDetails();
  uni.redirectTo({ url: "/pages/study/play?mode=review" });
}

function home() {
  clearWrongDetails();
  if (isReview.value) {
    uni.switchTab({ url: "/pages/wrong/index" });
    return;
  }
  uni.switchTab({ url: "/pages/home/index" });
}

function goPet() {
  clearWrongDetails();
  uni.switchTab({ url: "/pages/pet/index" });
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.result {
  text-align: center;
  padding: 48rpx 32rpx;
  background: linear-gradient(180deg, #f4fbf7 0%, #ffffff 60%);
}

.score {
  margin: 16rpx 0;
  font-size: 96rpx;
  font-weight: 800;
  color: #2eb086;
}

.earn {
  margin-bottom: 12rpx;
  font-size: 40rpx;
  font-weight: 800;
  color: #c98500;
}

.heading {
  font-size: 34rpx;
  font-weight: 800;
  margin-bottom: 12rpx;
}

.heading.left {
  text-align: left;
}

.balance {
  display: block;
  margin-top: 8rpx;
}

.wrong-row {
  padding: 20rpx 0;
  border-bottom: 1px solid #e6eee9;
}

.wrong-main {
  display: flex;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 6rpx;
}

.spell {
  font-weight: 800;
}

.small {
  font-size: 22rpx;
}

.action {
  margin-top: 8rpx;
}

.btn {
  margin-top: 16rpx;
}

.muted {
  display: block;
}
</style>
