<template>
  <view class="page">
    <BrandBar :child-text="childText" />

    <view class="hero-row">
      <view class="hero-copy">
        <view class="title-wrap">
          <text class="title">家长中心</text>
          <text class="spark a">✦</text>
          <text class="spark b">✧</text>
        </view>
        <text class="muted slogan">每一点进步，都值得被看见</text>
      </view>
      <view class="home-pill" @click="goHome">‹ 返回孩子的学习页</view>
    </view>

    <view class="card child-card">
      <view class="child-grid">
        <view class="book-picker">
          <picker
            v-if="volumeLabels.length"
            mode="selector"
            :range="volumeLabels"
            :value="volumeIndex"
            @change="onTextbook"
          >
            <view class="select-field">
              <text class="select-text">{{ volumeLabels[volumeIndex] || "未选择教材" }}</text>
              <text class="chevron">▾</text>
            </view>
          </picker>
          <view v-else class="select-field muted-field">暂无可用教材</view>
        </view>

        <view class="switch-picker">
          <view class="action-chip" @click="openChildSheet">⇄ 切换孩子</view>
        </view>

        <text class="muted hint">学习教材随时可调整</text>
        <view class="action-chip add-chip" @click="goCreate">+ 添加孩子</view>
      </view>
    </view>

    <view v-if="childSheetOpen" class="sheet-mask" @click="closeChildSheet">
      <view class="child-sheet" @click.stop>
        <view class="sheet-head">
          <text class="sheet-title">选择孩子</text>
          <text class="sheet-close" @click="closeChildSheet">关闭</text>
        </view>
        <view
          v-for="child in children"
          :key="child.id"
          class="child-option"
          @click="pickChild(child.id)"
        >
          <view class="child-option-main">
            <text class="child-option-name">{{ child.nickname }}</text>
            <text class="muted">{{ gradeLabel(child.grade) }}</text>
          </view>
          <text v-if="child.id === currentId" class="child-current">当前</text>
          <text v-else class="child-pick">选择</text>
        </view>
        <view v-if="!children.length" class="sheet-empty muted">还没有孩子档案</view>
      </view>
    </view>

    <view class="section-head">
      <text class="section-title">本周学习概览</text>
    </view>

    <view class="card overview">
      <view class="stat">
        <view class="icon-slot">📖</view>
        <text class="stat-label">学习词次</text>
        <view class="num-row">
          <text class="num green">{{ report?.studiedCount || 0 }}</text>
        </view>
      </view>
      <view class="divider" />
      <view class="stat">
        <view class="icon-slot">✅</view>
        <text class="stat-label">答题正确率</text>
        <view class="num-row">
          <text class="num green">{{ report?.accuracy || 0 }}</text>
          <text class="num-unit green">%</text>
        </view>
      </view>
      <view class="divider" />
      <view class="stat">
        <view class="icon-slot">📅</view>
        <text class="stat-label">打卡天数</text>
        <view class="num-row">
          <text class="num orange">{{ report?.activeDays || 0 }}</text>
          <text class="num-unit orange">天</text>
        </view>
      </view>
    </view>

    <view class="card trail">
      <view class="row-between">
        <text class="section-title">这一周的学习足迹</text>
        <text class="link" @click="goReport">查看完整周报 ></text>
      </view>
      <view class="trail-body">
        <view class="chart">
          <view v-for="(item, index) in dailyRows" :key="item.date" class="chart-col">
            <text class="bar-num">{{ item.count }}</text>
            <view class="chart-bar" :style="{ height: barHeight(item.count) }" />
            <text class="day">周{{ weekdays[index] || "" }}</text>
          </view>
        </view>
        <view class="total-box">
          <text class="total-label">合计</text>
          <text class="total-num">{{ report?.studiedCount || 0 }}</text>
        </view>
      </view>
    </view>

    <view class="card remind">
      <text class="section-title">学习提醒</text>
      <view class="switch-row">
        <text class="switch-label">每日提醒</text>
        <switch color="#2eb086" :checked="reminder?.enabled" @change="onToggle" />
      </view>
      <view class="time-row">
        <text class="switch-label">提醒时间</text>
        <picker mode="selector" :range="timeOptions" :value="timeIndex" @change="onTime">
          <view class="select-field time-select">
            <text class="select-text">{{ reminderTime }}</text>
            <text class="chevron">▾</text>
          </view>
        </picker>
      </view>
      <text class="muted tip-line">提醒发给家长，一起陪伴孩子学习</text>
      <view class="auth-row">
        <view class="auth-left" @click="subscribe">
          <text class="wx">💬</text>
          <text class="muted">微信通知{{ reminder?.accepted ? "已授权" : "待授权" }}</text>
          <text class="info">ⓘ</text>
        </view>
        <view
          class="setup-chip"
          :class="{ disabled: testing }"
          @click="testSend"
        >
          {{ testing ? "发送中..." : "设置提醒" }}
        </view>
      </view>
    </view>

    <view class="tip">
      <image
        class="tip-art"
        src="/static/illustrations/parent-tip.png?v=20261110w2"
        mode="aspectFill"
      />
      <view class="tip-copy">
        <text class="tip-title">陪伴小建议</text>
        <text class="muted">先肯定坚持，再一起复习还没记牢的单词。</text>
      </view>
    </view>

    <view class="card member">
      <text class="kicker">会员</text>
      <view class="member-title">{{ memberText }}</view>
      <text class="muted">{{ memberHint }}</text>
      <button class="btn action" @click="goMember">
        {{ status?.active ? "续费会员" : "开通会员" }}
      </button>
    </view>

    <button class="btn btn-line logout" @click="logout">退出登录</button>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import {
  acceptReminder,
  fetchChildren,
  fetchMembership,
  fetchReminder,
  fetchTextbooks,
  fetchWeekly,
  mockSendReminder,
  selectChild,
  setReminderEnabled,
  updateChildTextbook,
} from "../../api";
import { useSessionStore } from "../../stores/session";
import type {
  Child,
  MembershipStatus,
  ReminderStatus,
  Textbook,
  WeeklyReport,
} from "../../types/api";
import BrandBar from "../../components/BrandBar.vue";
import { ensureLogin } from "../../utils/auth";
import { errorMessage, gradeLabel } from "../../utils/format";

const children = ref<Child[]>([]);
const currentId = ref<string | null>(null);
const report = ref<WeeklyReport | null>(null);
const status = ref<MembershipStatus | null>(null);
const reminder = ref<ReminderStatus | null>(null);
const books = ref<Textbook[]>([]);
const testing = ref(false);
const childSheetOpen = ref(false);
const session = useSessionStore();
const weekdays = ["一", "二", "三", "四", "五", "六", "日"];
const timeOptions = ["19:00", "19:30", "20:00", "20:30", "21:00"];
const reminderTime = ref((uni.getStorageSync("wq_reminder_time") as string) || "20:00");

const current = computed(() => children.value.find((item) => item.id === currentId.value));
const gradeBooks = computed(() =>
  current.value ? books.value.filter((item) => item.grade === current.value!.grade) : [],
);
const volumeLabels = computed(() =>
  gradeBooks.value.map((item) => `${item.publisher} · ${item.volume || item.name}`),
);
const volumeIndex = computed(() => {
  if (!current.value?.textbookId) return 0;
  const index = gradeBooks.value.findIndex((item) => item.id === current.value!.textbookId);
  return index >= 0 ? index : 0;
});
const childText = computed(() =>
  current.value ? `${current.value.nickname} · ${gradeLabel(current.value.grade)}` : "还没有孩子档案",
);
const memberText = computed(() =>
  status.value?.active ? status.value.planName || "会员生效中" : "尚未开通",
);
const memberHint = computed(() =>
  status.value?.active && status.value.endAt
    ? `有效期至 ${status.value.endAt.slice(0, 10)}`
    : "开通后解锁全部单元，每日 30 词",
);
const timeIndex = computed(() =>
  Math.max(0, timeOptions.findIndex((item) => item === reminderTime.value)),
);
const dailyRows = computed(() => {
  if (report.value?.daily?.length) return report.value.daily;
  return weekdays.map((_, index) => ({ date: `empty-${index}`, count: 0 }));
});
const maxCount = computed(() =>
  Math.max(1, ...dailyRows.value.map((item) => item.count)),
);

function barHeight(count: number) {
  if (!count) return "8rpx";
  return `${Math.max(8, Math.round((count / maxCount.value) * 140))}rpx`;
}

async function load() {
  try {
    const [childResult, weekly, membership, reminderStatus, textbookResult] =
      await Promise.all([
        fetchChildren(),
        fetchWeekly(),
        fetchMembership(),
        fetchReminder(),
        fetchTextbooks(),
      ]);
    children.value = childResult.items;
    currentId.value = childResult.currentChildId;
    report.value = weekly;
    status.value = membership;
    reminder.value = reminderStatus;
    books.value = textbookResult.items;
  } catch (error) {
    uni.showToast({ title: errorMessage(error), icon: "none" });
  }
}

function openChildSheet() {
  if (children.value.length === 0) {
    uni.showToast({ title: "还没有孩子档案", icon: "none" });
    return;
  }
  if (children.value.length === 1) {
    uni.showToast({ title: "目前只有一个孩子", icon: "none" });
    return;
  }
  childSheetOpen.value = true;
}

function closeChildSheet() {
  childSheetOpen.value = false;
}

async function pickChild(id: string) {
  if (id === currentId.value) {
    closeChildSheet();
    return;
  }
  try {
    await selectChild(id);
    await load();
    closeChildSheet();
    uni.showToast({ title: "已切换孩子", icon: "none" });
  } catch (error) {
    uni.showToast({ title: errorMessage(error), icon: "none" });
  }
}

async function onTextbook(event: { detail: { value: string | number } }) {
  const child = current.value;
  const book = gradeBooks.value[Number(event.detail.value)];
  if (!child || !book) return;
  try {
    await updateChildTextbook(child.id, book.id);
    await load();
    uni.showToast({ title: "教材已更新", icon: "success" });
  } catch (error) {
    uni.showToast({ title: errorMessage(error), icon: "none" });
  }
}

async function onToggle(event: { detail: { value: boolean } }) {
  try {
    reminder.value = await setReminderEnabled(event.detail.value);
  } catch (error) {
    uni.showToast({ title: errorMessage(error), icon: "none" });
    await load();
  }
}

function onTime(event: { detail: { value: string | number } }) {
  reminderTime.value = timeOptions[Number(event.detail.value)] || "20:00";
  uni.setStorageSync("wq_reminder_time", reminderTime.value);
}

async function subscribe() {
  const templateId = import.meta.env.VITE_WECHAT_SUBSCRIBE_TEMPLATE_ID as string | undefined;
  if (!templateId) {
    uni.showModal({
      title: "还没配模板 ID",
      content: "请配置订阅消息模板，或先点设置提醒走模拟。",
      showCancel: false,
    });
    return;
  }
  try {
    const result = await new Promise<Record<string, string>>((resolve, reject) => {
      uni.requestSubscribeMessage({
        tmplIds: [templateId],
        success: (res) => resolve(res as unknown as Record<string, string>),
        fail: reject,
      });
    });
    if (result[templateId] !== "accept") {
      uni.showToast({ title: "未授权订阅", icon: "none" });
      return;
    }
    reminder.value = await acceptReminder();
    uni.showToast({ title: "授权成功", icon: "success" });
  } catch (error) {
    uni.showToast({ title: errorMessage(error), icon: "none" });
  }
}

async function testSend() {
  if (testing.value) return;
  testing.value = true;
  try {
    // #ifdef MP-WEIXIN
    if (!reminder.value?.accepted) {
      await subscribe();
    }
    // #endif
    const result = await mockSendReminder();
    uni.showModal({
      title: result.status === "mock" || result.status === "sent" ? "提醒已触发" : "未发送",
      content: `${result.reason}\n提醒时间：${reminderTime.value}`,
      showCancel: false,
    });
    reminder.value = await fetchReminder();
  } catch (error) {
    uni.showToast({ title: errorMessage(error), icon: "none" });
  } finally {
    testing.value = false;
  }
}

function goCreate() {
  uni.navigateTo({ url: "/pages/child/create" });
}
function goReport() {
  uni.navigateTo({ url: "/pages/report/index" });
}
function goMember() {
  uni.navigateTo({ url: "/pages/member/index" });
}
function goHome() {
  uni.switchTab({ url: "/pages/home/index" });
}
function logout() {
  session.logout();
}

onShow(() => {
  if (!ensureLogin()) return;
  void load();
});
</script>

<style scoped>
.hero-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 18rpx;
}

.hero-copy {
  flex: 1;
  min-width: 0;
}

.title-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.title {
  font-size: 44rpx;
  font-weight: 850;
  color: #1d3557;
  line-height: 1.2;
}

.spark {
  position: absolute;
  color: #f0b429;
  font-size: 18rpx;
  line-height: 1;
}

.spark.a {
  top: -2rpx;
  right: -22rpx;
}

.spark.b {
  top: 18rpx;
  right: -36rpx;
  font-size: 14rpx;
}

.slogan {
  display: block;
  margin-top: 8rpx;
}

.home-pill {
  flex: none;
  max-width: 280rpx;
  padding: 14rpx 22rpx;
  border-radius: 999rpx;
  background: #e8f7f0;
  color: #249672;
  font-size: 22rpx;
  font-weight: 750;
  white-space: nowrap;
}

.child-card {
  margin-bottom: 18rpx;
  padding: 18rpx 20rpx;
}

.child-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-rows: auto auto;
  column-gap: 12rpx;
  row-gap: 10rpx;
  align-items: center;
}

.book-picker {
  grid-column: 1;
  grid-row: 1;
  min-width: 0;
}

.switch-picker {
  grid-column: 2;
  grid-row: 1;
}

.hint {
  grid-column: 1;
  grid-row: 2;
  font-size: 22rpx;
  line-height: 52rpx;
  height: 52rpx;
}

.add-chip {
  grid-column: 2;
  grid-row: 2;
}

.select-field {
  height: 56rpx;
  padding: 0 16rpx;
  border-radius: 16rpx;
  border: 2rpx solid #e6eee9;
  background: #fbfcfa;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10rpx;
  box-sizing: border-box;
}

.time-select {
  min-width: 148rpx;
}

.muted-field {
  color: #8a94a6;
  font-size: 24rpx;
}

.select-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 24rpx;
  color: #1d3557;
  font-weight: 650;
}

.chevron {
  color: #8a94a6;
  font-size: 20rpx;
  flex-shrink: 0;
}

.action-chip {
  min-width: 156rpx;
  height: 52rpx;
  padding: 0 18rpx;
  border-radius: 999rpx;
  border: 2rpx solid #c9e8da;
  background: #fff;
  color: #249672;
  font-size: 22rpx;
  font-weight: 750;
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  box-sizing: border-box;
}

.sheet-mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 1000;
  background: rgba(29, 53, 87, 0.36);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.child-sheet {
  width: 100%;
  max-height: 70vh;
  background: #fff;
  border-radius: 28rpx 28rpx 0 0;
  padding: 24rpx 24rpx calc(24rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
  overflow-y: auto;
}

.sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12rpx;
}

.sheet-title {
  font-size: 30rpx;
  font-weight: 800;
  color: #1d3557;
}

.sheet-close {
  color: #6b7c8f;
  font-size: 24rpx;
  padding: 8rpx 4rpx;
}

.child-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 22rpx 8rpx;
  border-bottom: 2rpx solid #eef3f0;
}

.child-option:last-child {
  border-bottom: none;
}

.child-option-main {
  min-width: 0;
  flex: 1;
}

.child-option-name {
  display: block;
  font-size: 30rpx;
  font-weight: 750;
  color: #1d3557;
  margin-bottom: 4rpx;
}

.child-current {
  flex-shrink: 0;
  height: 40rpx;
  padding: 0 14rpx;
  border-radius: 999rpx;
  background: #e8f7f0;
  color: #249672;
  font-size: 20rpx;
  font-weight: 750;
  line-height: 40rpx;
}

.child-pick {
  flex-shrink: 0;
  color: #8a94a6;
  font-size: 24rpx;
}

.sheet-empty {
  padding: 32rpx 8rpx;
  text-align: center;
}

.section-head {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin: 8rpx 0 14rpx;
}

.section-title {
  font-size: 30rpx;
  font-weight: 800;
  color: #1d3557;
}

.overview {
  display: flex;
  align-items: stretch;
  gap: 0;
  padding: 22rpx 8rpx;
  margin-bottom: 16rpx;
}

.stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
  text-align: center;
  min-width: 0;
}

.divider {
  width: 2rpx;
  margin: 12rpx 0;
  background: #eef2f0;
  flex: none;
}

.icon-slot {
  width: 40rpx;
  height: 40rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30rpx;
  line-height: 1;
}

.stat-label {
  height: 32rpx;
  line-height: 32rpx;
  font-size: 22rpx;
  color: #8a94a6;
}

.num-row {
  min-height: 48rpx;
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 2rpx;
}

.num {
  font-size: 40rpx;
  font-weight: 850;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.num-unit {
  font-size: 24rpx;
  font-weight: 750;
  line-height: 1;
}

.num.green,
.num-unit.green {
  color: #2eb086;
}

.num.orange,
.num-unit.orange {
  color: #e39b2c;
}

.trail {
  margin-bottom: 16rpx;
}

.row-between {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
}

.link {
  color: #249672;
  font-weight: 750;
  font-size: 22rpx;
  white-space: nowrap;
}

.trail-body {
  display: flex;
  align-items: flex-end;
  gap: 16rpx;
  margin-top: 18rpx;
}

.chart {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: flex-end;
  gap: 6rpx;
  height: 200rpx;
}

.chart-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6rpx;
}

.bar-num {
  font-size: 20rpx;
  font-weight: 700;
  color: #1d3557;
}

.chart-bar {
  width: 18rpx;
  border-radius: 999rpx;
  background: linear-gradient(180deg, #49c295, #2eb086);
}

.day {
  font-size: 20rpx;
  color: #8a94a6;
}

.total-box {
  flex: none;
  width: 108rpx;
  padding: 16rpx 10rpx;
  border-radius: 20rpx;
  background: #e8f7f0;
  text-align: center;
}

.total-label {
  display: block;
  font-size: 20rpx;
  color: #6b7c8f;
}

.total-num {
  display: block;
  margin-top: 6rpx;
  font-size: 36rpx;
  font-weight: 850;
  color: #2eb086;
}

.remind {
  margin-bottom: 16rpx;
}

.switch-row,
.time-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 18rpx;
}

.switch-label {
  font-size: 28rpx;
  font-weight: 750;
  color: #1d3557;
}

.tip-line {
  display: block;
  margin-top: 14rpx;
}

.auth-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  margin-top: 16rpx;
}

.auth-left {
  display: flex;
  align-items: center;
  gap: 8rpx;
  min-width: 0;
  flex: 1;
}

.wx {
  font-size: 26rpx;
}

.info {
  color: #a0aab8;
  font-size: 22rpx;
}

.setup-chip {
  flex: none;
  min-width: 148rpx;
  height: 56rpx;
  padding: 0 22rpx;
  border-radius: 999rpx;
  border: 2rpx solid #c9e8da;
  background: #fff;
  color: #249672;
  font-size: 24rpx;
  font-weight: 750;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.setup-chip.disabled {
  opacity: 0.55;
  pointer-events: none;
}

.tip {
  display: flex;
  gap: 24rpx;
  align-items: center;
  background: transparent;
  margin: 8rpx 4rpx 20rpx;
  padding: 0;
}

.tip-art {
  width: 200rpx;
  height: 200rpx;
  border-radius: 28rpx;
  background: transparent;
  flex-shrink: 0;
}

.tip-copy {
  flex: 1;
  min-width: 0;
}

.tip-title {
  display: block;
  font-weight: 800;
  margin-bottom: 6rpx;
}

.member-title {
  margin: 8rpx 0 10rpx;
  font-size: 32rpx;
  font-weight: 800;
}

.action {
  margin-top: 20rpx;
}

.logout {
  margin-top: 8rpx;
  margin-bottom: 24rpx;
}
</style>
