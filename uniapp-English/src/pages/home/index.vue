<template>
  <view class="page">
    <view class="top">
      <view>
        <view class="hello">{{ greeting }}</view>
        <text class="muted">{{ heroTitle }}</text>
      </view>
      <view class="meta">
        <text class="chip">📅 连续 {{ task?.streak || 0 }} 天</text>
        <text class="chip">⭐ {{ player.points }} 积分</text>
        <text class="parent" @click="goParent">家长入口</text>
      </view>
    </view>

    <view v-if="errorText" class="card">{{ errorText }}</view>

    <view v-else-if="task?.needChild" class="card">
      <view class="heading">先给孩子建档</view>
      <text class="muted">建档后才能开始今日任务。</text>
      <button class="btn action" @click="goCreate">创建档案</button>
    </view>

    <template v-else>
      <!-- 例图03 小学 / 例图05 初中：按年级切换，不要混成一套 -->
      <view class="card hero">
        <text class="tag">{{ task?.textbook?.name || "同步词库" }} · {{ task?.unit?.title || "今日任务" }}</text>
        <view class="heading">{{ unitTitle }}</view>
        <text class="muted">
          今日目标 {{ dailyGoal }} 个单词，已经完成 {{ task?.studiedToday || 0 }} 个
        </text>
        <view class="progress">
          <view class="progress-fill" :style="{ width: progress }" />
        </view>
        <button class="btn action" :disabled="!canStart" @click="start">{{ startLabel }}</button>
        <text class="muted motto">按自己的节奏，慢慢来就好</text>
      </view>

      <view class="card route">
        <view class="route-title">{{ isJunior ? "学习路线" : "我的冒险路线" }}</view>
        <view
          v-for="(unit, index) in routeUnits"
          :key="unit.id"
          class="route-item"
          :class="{
            current: task?.unit?.id === unit.id,
            locked: unit.locked,
            done: index === 0 && (task?.studiedToday || 0) > 0,
          }"
        >
          <text class="dot">{{ unit.locked ? "🔒" : index === 0 ? "✓" : index + 1 }}</text>
          <view>
            <text class="unit-name">
              {{ isJunior ? `主题 ${index + 1} · ${unit.title}` : unit.title }}
            </text>
            <text class="muted">{{ unit.locked ? "待解锁" : unit.wordCount + " 词" }}</text>
          </view>
        </view>
        <text v-if="!routeUnits.length" class="muted">加载路线中...</text>
      </view>

      <view class="modules">
        <view class="card module" @click="start">
          <text class="icon">📖</text>
          <text class="mod-title">新词学习</text>
          <text class="muted">{{ task?.studiedToday || 0 }}/{{ task?.dailyLimit || dailyGoal }} 词</text>
        </view>
        <view class="card module" @click="goWrong">
          <text class="icon">🔁</text>
          <text class="mod-title">{{ isJunior ? "到期复习" : "温故知新" }}</text>
          <text class="muted">{{ wrongCount }}/{{ Math.max(wrongCount, 8) }} 词</text>
        </view>
        <view v-if="isJunior" class="card module" @click="goReport">
          <text class="icon">📊</text>
          <text class="mod-title">本周掌握</text>
          <text class="muted">{{ weekly?.studiedCount || 0 }} 词</text>
        </view>
        <view v-else class="card module" @click="goPet">
          <text class="icon">🏠</text>
          <text class="mod-title">伙伴小屋</text>
          <text class="muted">学习赚积分，装扮小屋</text>
        </view>
      </view>

      <view v-if="isJunior" class="card">
        <view class="heading sm">我的学习节奏</view>
        <view class="bars">
          <view v-for="(item, index) in weekly?.daily || []" :key="item.date" class="bar-col">
            <view class="bar" :style="{ height: Math.max(12, item.count * 4) + 'rpx' }" />
            <text class="muted">{{ weekdays[index] || item.date.slice(5) }}</text>
          </view>
        </view>
        <view class="goal-box">
          <text class="mod-title">给自己的小目标</text>
          <text class="muted">每天一点，稳稳向前</text>
        </view>
      </view>

      <view v-else class="card">
        <view class="row-between">
          <view>
            <view class="heading sm">每一点努力都算数</view>
            <text class="muted">最近 {{ recentDays.length || 5 }} 天的学习记录</text>
          </view>
          <text class="parent" @click="goMember">学习权益 ></text>
        </view>
        <view class="days">
          <view
            v-for="day in recentDays"
            :key="day.label"
            class="day"
            :class="{ done: day.done, today: day.today }"
          >
            <text>{{ day.done ? "✓" : "·" }}</text>
            <text class="day-label">{{ day.label }}</text>
          </view>
        </view>
      </view>

      <button v-if="task && !task.member" class="btn btn-line" @click="goMember">开通学期会员</button>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { fetchTextbooks, fetchToday, fetchWeekly, fetchWrongWords } from "../../api";
import type { Textbook, TodayTask, WeeklyReport } from "../../types/api";
import { usePlayerStore } from "../../stores/player";
import { ensureLogin } from "../../utils/auth";
import { errorMessage } from "../../utils/format";

const player = usePlayerStore();
const task = ref<TodayTask | null>(null);
const books = ref<Textbook[]>([]);
const weekly = ref<WeeklyReport | null>(null);
const wrongCount = ref(0);
const errorText = ref("");
const weekdays = ["一", "二", "三", "四", "五", "六", "日"];

const isJunior = computed(() => (task.value?.child?.grade || 0) >= 7);
const dailyGoal = computed(() =>
  Number(uni.getStorageSync("wq_daily_goal") || task.value?.dailyLimit || 10),
);
const progress = computed(() => {
  const limit = task.value?.dailyLimit || 1;
  const done = task.value?.studiedToday || 0;
  return `${Math.min(100, Math.round((done / limit) * 100))}%`;
});
const canStart = computed(() => (task.value?.words.length || 0) > 0);
const greeting = computed(() => {
  const name = task.value?.child?.nickname || "小朋友";
  return isJunior.value ? "今天，也进步一点点" : `你好，${name}！`;
});
const heroTitle = computed(() =>
  isJunior.value ? "按自己的节奏，完成今天的学习" : "每天一点点，英语大不同",
);
const unitTitle = computed(() =>
  isJunior.value
    ? task.value?.unit?.title || "Unit · School life"
    : task.value?.unit?.title || "打个招呼，认识新朋友",
);
const startLabel = computed(() => {
  if (!task.value) return "加载中...";
  if (!canStart.value) return "今日额度已用完";
  return isJunior.value ? "继续今日学习 >" : "继续闯关 >";
});
const currentBook = computed(() => {
  const id = task.value?.textbook?.id;
  return books.value.find((item) => item.id === id) || books.value[0] || null;
});
const routeUnits = computed(() => currentBook.value?.units || []);
const recentDays = computed(() => {
  const days = weekly.value?.daily.slice(-5) || [];
  return days.map((item, index) => ({
    label: `第${index + 1}天`,
    done: item.count > 0,
    today: index === days.length - 1,
  }));
});

async function load() {
  errorText.value = "";
  try {
    const [today, textbookResult, report, wrong] = await Promise.all([
      fetchToday(),
      fetchTextbooks(),
      fetchWeekly(),
      fetchWrongWords(),
    ]);
    task.value = today;
    books.value = textbookResult.items;
    weekly.value = report;
    wrongCount.value = wrong.items.length;
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
  uni.switchTab({ url: "/pages/wrong/index" });
}
function goPet() {
  uni.switchTab({ url: "/pages/pet/index" });
}
function goParent() {
  uni.switchTab({ url: "/pages/parent/index" });
}
function goReport() {
  uni.navigateTo({ url: "/pages/report/index" });
}

onShow(() => {
  if (!ensureLogin()) return;
  player.hydrate();
  void player.refreshWallet().catch(() => undefined);
  void load();
});
</script>

<style scoped>
.top {
  margin-bottom: 16rpx;
}

.hello {
  font-size: 40rpx;
  font-weight: 800;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  align-items: center;
  margin-top: 14rpx;
}

.parent {
  color: #249672;
  font-weight: 750;
  font-size: 24rpx;
}

.hero {
  position: relative;
  overflow: hidden;
  background: linear-gradient(135deg, #fff 0%, #f4fbf7 60%, #fff6e8 100%);
}

.heading {
  margin: 12rpx 0;
  font-size: 36rpx;
  font-weight: 800;
}

.heading.sm {
  font-size: 30rpx;
  margin-bottom: 6rpx;
}

.progress {
  margin: 18rpx 0 22rpx;
}

.action {
  margin-top: 4rpx;
}

.motto {
  display: block;
  margin-top: 14rpx;
}

.modules {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12rpx;
  margin-bottom: 20rpx;
}

.module {
  margin: 0;
  padding: 20rpx 16rpx;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.icon {
  font-size: 36rpx;
}

.mod-title {
  font-weight: 800;
  font-size: 26rpx;
}

.route-title {
  font-weight: 800;
  margin-bottom: 16rpx;
}

.route-item {
  display: flex;
  gap: 16rpx;
  align-items: flex-start;
  padding: 14rpx 0;
  opacity: 0.55;
}

.route-item.current,
.route-item.done {
  opacity: 1;
}

.route-item.current {
  padding: 14rpx;
  border-radius: 20rpx;
  background: #e8f7f0;
}

.dot {
  width: 44rpx;
  height: 44rpx;
  border-radius: 50%;
  background: #eef3f0;
  text-align: center;
  line-height: 44rpx;
  font-size: 20rpx;
  flex-shrink: 0;
}

.route-item.done .dot,
.route-item.current .dot {
  background: #2eb086;
  color: #fff;
}

.unit-name {
  display: block;
  font-weight: 750;
}

.bars {
  display: flex;
  align-items: flex-end;
  gap: 10rpx;
  height: 160rpx;
  margin-top: 16rpx;
}

.bar-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
}

.bar {
  width: 18rpx;
  border-radius: 999rpx;
  background: #2eb086;
}

.goal-box {
  margin-top: 18rpx;
  padding: 16rpx;
  border-radius: 20rpx;
  background: #fff3e4;
}

.row-between {
  display: flex;
  justify-content: space-between;
  gap: 12rpx;
  align-items: flex-start;
}

.days {
  display: flex;
  gap: 12rpx;
  margin-top: 18rpx;
}

.day {
  flex: 1;
  height: 100rpx;
  border-radius: 20rpx;
  background: #f3f7f5;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  color: #6b7c8f;
}

.day.done {
  background: #e8f7f0;
  color: #249672;
}

.day.today {
  background: #fff3e4;
  color: #c56a12;
}

.day-label {
  font-size: 20rpx;
}
</style>
