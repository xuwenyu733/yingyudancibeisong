<template>
  <view class="page">
    <view class="hero card">
      <view class="fox">🦊</view>
      <text class="kicker">杏橘狐 · 学习小屋</text>
      <view class="heading">背单词攒星星，装扮小房间</view>
      <view class="points-row">
        <text class="num">{{ player.points }}</text>
        <text class="muted">账户积分</text>
      </view>
      <text v-if="player.pendingCount" class="pending"
        >🎁 有 {{ player.pendingCount }} 条奖励待同步进小屋</text
      >
      <button class="btn" @click="goRoom">🏠 进入学习小屋</button>
      <button class="btn btn-line" @click="goShop">🛒 积分商城</button>
      <button class="btn btn-line" @click="goBag">🎒 我的背包</button>
      <button class="btn btn-line" @click="goStudy">📚 去背单词赚积分</button>
    </view>

    <view class="card checkin-card">
      <view class="row-between">
        <view>
          <view class="heading">每日签到</view>
          <text class="muted"
            >连续 {{ missions?.checkIn.streak || 1 }} 天 · 今日
            +{{ missions?.checkIn.rewardPreview || 10 }}</text
          >
        </view>
        <button
          class="btn mini"
          :disabled="checking || missions?.checkIn.done"
          @click="doCheckIn"
        >
          {{ missions?.checkIn.done ? "已签到" : "签到" }}
        </button>
      </view>
    </view>

    <view class="card">
      <view class="heading">今日任务</view>
      <view v-if="missionLoading" class="muted">任务加载中...</view>
      <view v-for="task in missions?.tasks || []" :key="task.id" class="task">
        <view class="task-main">
          <view class="task-title">{{ task.title }}</view>
          <text class="muted"
            >{{ task.desc }} · {{ task.progress }}/{{ task.target }}</text
          >
          <view class="bar">
            <view
              class="bar-fill"
              :style="{ width: `${(task.progress / task.target) * 100}%` }"
            />
          </view>
        </view>
        <button
          class="btn mini"
          :class="{ ghost: !task.claimable }"
          :disabled="claiming || !task.claimable"
          @click="claim(task.id)"
        >
          {{
            task.claimed
              ? "已领"
              : task.claimable
                ? `领 +${task.reward}`
                : `+${task.reward}`
          }}
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import {
  claimDailyTask,
  fetchMissions,
  postCheckIn,
  type MissionStatus,
} from "../../api";
import { usePlayerStore } from "../../stores/player";
import { ensureLogin } from "../../utils/auth";
import { errorMessage } from "../../utils/format";

const player = usePlayerStore();
const missions = ref<MissionStatus | null>(null);
const missionLoading = ref(false);
const checking = ref(false);
const claiming = ref(false);

async function loadMissions() {
  missionLoading.value = true;
  try {
    missions.value = await fetchMissions();
    player.setBalance(missions.value.balance);
  } catch (error) {
    uni.showToast({ title: errorMessage(error), icon: "none" });
  } finally {
    missionLoading.value = false;
  }
}

async function doCheckIn() {
  checking.value = true;
  try {
    const result = await postCheckIn();
    player.setBalance(result.balance, result.reward);
    await loadMissions();
    uni.showToast({
      title: result.already
        ? "今天已经签过啦"
        : `签到成功 +${result.reward} · 连续${result.streak}天`,
      icon: "none",
    });
  } catch (error) {
    uni.showToast({ title: errorMessage(error), icon: "none" });
  } finally {
    checking.value = false;
  }
}

async function claim(taskId: string) {
  claiming.value = true;
  try {
    const result = await claimDailyTask(taskId);
    player.setBalance(result.balance, result.reward);
    missions.value = result.status;
    uni.showToast({
      title: result.already ? "已经领过啦" : `任务奖励 +${result.reward}`,
      icon: "none",
    });
  } catch (error) {
    uni.showToast({ title: errorMessage(error), icon: "none" });
  } finally {
    claiming.value = false;
  }
}

onShow(() => {
  if (!ensureLogin()) return;
  player.hydrate();
  void player.refreshWallet().catch(() => undefined);
  void loadMissions();
});

function goRoom() {
  uni.navigateTo({ url: "/pages/room/index" });
}
function goShop() {
  uni.navigateTo({ url: "/pages/shop/index" });
}
function goBag() {
  uni.navigateTo({ url: "/pages/bag/index" });
}
function goStudy() {
  uni.switchTab({ url: "/pages/home/index" });
}
</script>

<style scoped>
.hero {
  text-align: center;
  background: linear-gradient(165deg, #fff4e8 0%, #ffffff 55%);
}

.fox {
  width: 112rpx;
  height: 112rpx;
  margin: 0 auto 12rpx;
  border-radius: 50%;
  background: linear-gradient(160deg, #ffe29a, #ffb38a);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 64rpx;
  box-shadow: 0 10rpx 22rpx rgba(255, 160, 80, 0.3);
}

.hero .heading {
  font-size: 36rpx;
  font-weight: 800;
  margin: 8rpx 0 20rpx;
}

.points-row {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 12rpx;
  margin-bottom: 12rpx;
  flex-wrap: wrap;
}

.num {
  font-size: 64rpx;
  font-weight: 800;
  color: #ff6b6b;
}

.pending {
  display: block;
  margin-bottom: 8rpx;
  color: #1aa894;
  font-size: 24rpx;
  font-weight: 700;
}

.heading {
  font-size: 32rpx;
  font-weight: 800;
  margin-bottom: 8rpx;
}

.muted {
  display: block;
  margin-top: 6rpx;
}

.checkin-card {
  background: linear-gradient(180deg, #fff7e0 0%, #ffffff 70%);
  border-color: #ffe29a;
}

.row-between {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.task {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 20rpx 0;
  border-top: 1rpx solid #ffe8e0;
}

.task:first-of-type {
  border-top: none;
  padding-top: 8rpx;
}

.task-main {
  flex: 1;
  min-width: 0;
}

.task-title {
  font-weight: 800;
  font-size: 28rpx;
}

.bar {
  margin-top: 12rpx;
  height: 12rpx;
  border-radius: 999rpx;
  background: #ffe8e0;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #ffc857, #ff6b6b);
}

.btn {
  margin-top: 16rpx;
}

.btn.mini {
  margin-top: 0;
  width: 160rpx;
  height: 72rpx;
  line-height: 72rpx;
  font-size: 24rpx;
  flex-shrink: 0;
}

.btn.ghost {
  background: #fff0e8;
  color: #c96a5c;
  box-shadow: none;
}
</style>
