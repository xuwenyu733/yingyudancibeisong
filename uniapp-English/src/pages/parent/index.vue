<template>
  <view class="page">
    <view class="head">
      <view>
        <view class="title">家长中心</view>
        <text class="muted">每一点进步，都值得被看见</text>
      </view>
      <text class="back" @click="goHome">返回孩子的学习页</text>
    </view>

    <view class="card child">
      <view class="child-main">
        <view class="avatar" :style="{ background: avatar.color }">{{ letter }}</view>
        <view class="child-info">
          <view class="name-row">
            <text class="heading ellipsis">{{ childText }}</text>
            <text class="tag green">当前孩子</text>
          </view>
          <picker
            v-if="volumeLabels.length"
            mode="selector"
            :range="volumeLabels"
            :value="volumeIndex"
            @change="onTextbook"
          >
            <view class="field picker book-field">
              <text class="book-text">{{ volumeLabels[volumeIndex] || "未选择教材" }}</text>
              <text class="chevron">›</text>
            </view>
          </picker>
          <text class="muted">学习教材随时可调整</text>
        </view>
      </view>
      <view class="child-actions">
        <picker mode="selector" :range="childNames" @change="onSwitch">
          <view class="action-chip">切换孩子</view>
        </picker>
        <view class="action-chip" @click="goCreate">添加孩子</view>
      </view>
    </view>

    <view class="stats">
      <view class="card stat">
        <text class="icon">📖</text>
        <text class="muted">学习词次</text>
        <view class="num">{{ report?.studiedCount || 0 }}</view>
      </view>
      <view class="card stat">
        <text class="icon">✅</text>
        <text class="muted">答题正确率</text>
        <view class="num">{{ report?.accuracy || 0 }}%</view>
      </view>
      <view class="card stat">
        <text class="icon">📅</text>
        <text class="muted">打卡天数</text>
        <view class="num">{{ report?.activeDays || 0 }}天</view>
      </view>
    </view>
    <text class="muted sample">本周学习概览</text>

    <view class="card">
      <view class="row-between">
        <view class="heading sm">这一周的学习足迹</view>
        <text class="link" @click="goReport">查看完整周报</text>
      </view>
      <view class="bars">
        <view v-for="(item, index) in report?.daily || []" :key="item.date" class="bar-col">
          <text class="bar-num">{{ item.count }}</text>
          <view class="bar" :style="{ height: barHeight(item.count) }" />
          <text class="muted">周{{ weekdays[index] || "" }}</text>
        </view>
      </view>
      <view class="total">合计 {{ report?.studiedCount || 0 }}</view>
    </view>

    <view class="card">
      <view class="heading sm">学习提醒</view>
      <view class="switch-row">
        <text>每日提醒</text>
        <switch color="#2eb086" :checked="reminder?.enabled" @change="onToggle" />
      </view>
      <text class="muted">{{ reminderHint }}</text>
      <!-- #ifdef MP-WEIXIN -->
      <button class="btn action" :disabled="subscribing" @click="subscribe">
        {{ subscribing ? "请求中..." : "授权微信订阅消息" }}
      </button>
      <!-- #endif -->
      <button class="btn btn-line" :disabled="testing" @click="testSend">
        {{ testing ? "发送中..." : "设置提醒 / 测试推送" }}
      </button>
    </view>

    <view class="card tip">
      <MascotPlace size="sm" round />
      <view class="tip-copy">
        <text class="tip-title">陪伴小建议</text>
        <text class="muted">先肯定坚持，再一起复习还没记牢的单词。</text>
      </view>
    </view>

    <view class="card">
      <text class="kicker">会员</text>
      <view class="heading sm">{{ memberText }}</view>
      <text class="muted">{{ memberHint }}</text>
      <button class="btn action" @click="goMember">
        {{ status?.active ? "续费会员" : "开通会员" }}
      </button>
    </view>

    <button class="btn btn-line" @click="logout">退出登录</button>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import MascotPlace from "../../components/MascotPlace.vue";
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
import { avatarLetter, resolveAvatarOption } from "../../utils/avatar";
import { ensureLogin } from "../../utils/auth";
import { errorMessage, gradeLabel } from "../../utils/format";

const children = ref<Child[]>([]);
const currentId = ref<string | null>(null);
const report = ref<WeeklyReport | null>(null);
const status = ref<MembershipStatus | null>(null);
const reminder = ref<ReminderStatus | null>(null);
const books = ref<Textbook[]>([]);
const subscribing = ref(false);
const testing = ref(false);
const session = useSessionStore();
const weekdays = ["一", "二", "三", "四", "五", "六", "日"];
const avatar = computed(() => resolveAvatarOption());
const letter = computed(() => avatarLetter(current.value?.nickname || uni.getStorageSync("wq_nickname")));

const current = computed(() => children.value.find((item) => item.id === currentId.value));
const childNames = computed(() => children.value.map((item) => item.nickname));
const gradeBooks = computed(() =>
  current.value ? books.value.filter((item) => item.grade === current.value!.grade) : [],
);
const volumeLabels = computed(() =>
  gradeBooks.value.map((item) => `${item.publisher} · ${item.name} · ${item.volume}`),
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
const reminderHint = computed(() => {
  if (!reminder.value) return "";
  const modeText = reminder.value.mode === "wechat" ? "真实微信推送" : "开发模拟推送";
  const acceptText = reminder.value.accepted ? "已授权" : "待授权";
  return `提醒发给家长，一起陪伴孩子学习。${modeText} · 微信通知${acceptText}`;
});
const maxCount = computed(() =>
  Math.max(1, ...(report.value?.daily.map((item) => item.count) || [1])),
);

function barHeight(count: number) {
  return `${Math.max(12, Math.round((count / maxCount.value) * 140))}rpx`;
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

async function onSwitch(event: { detail: { value: string | number } }) {
  if (children.value.length === 0) {
    uni.showToast({ title: "还没有孩子档案", icon: "none" });
    return;
  }
  if (children.value.length === 1) {
    uni.showToast({ title: "目前只有一个孩子", icon: "none" });
    return;
  }
  const child = children.value[Number(event.detail.value)];
  if (!child) return;
  await selectChild(child.id);
  await load();
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

async function subscribe() {
  const templateId = import.meta.env.VITE_WECHAT_SUBSCRIBE_TEMPLATE_ID as string | undefined;
  if (!templateId) {
    uni.showModal({
      title: "还没配模板 ID",
      content: "请配置订阅消息模板，或先点测试推送走模拟。",
      showCancel: false,
    });
    return;
  }
  subscribing.value = true;
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
  } finally {
    subscribing.value = false;
  }
}

async function testSend() {
  testing.value = true;
  try {
    const result = await mockSendReminder();
    uni.showModal({
      title: result.status === "mock" || result.status === "sent" ? "提醒已触发" : "未发送",
      content: result.reason,
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
.head {
  display: flex;
  justify-content: space-between;
  gap: 16rpx;
  align-items: flex-start;
  margin-bottom: 16rpx;
}

.title {
  font-size: 42rpx;
  font-weight: 800;
}

.back {
  color: #249672;
  font-weight: 750;
  font-size: 24rpx;
}

.child-main {
  display: flex;
  gap: 18rpx;
  align-items: flex-start;
}

.child-info {
  flex: 1;
  min-width: 0;
}

.avatar {
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  color: #fff;
  font-size: 36rpx;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.name-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  min-width: 0;
}

.heading {
  font-size: 34rpx;
  font-weight: 800;
  max-width: 360rpx;
}

.heading.sm {
  font-size: 30rpx;
  font-weight: 800;
  max-width: none;
}

.picker {
  margin-top: 12rpx;
  height: 80rpx;
  display: flex;
  align-items: center;
}

.book-field {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  padding-right: 16rpx;
}

.book-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 26rpx;
  color: #1d3557;
}

.chevron {
  color: #6b7c8f;
  font-size: 32rpx;
  flex-shrink: 0;
}

.child-actions {
  display: flex;
  gap: 12rpx;
  margin-top: 18rpx;
}

.action-chip {
  height: 68rpx;
  line-height: 68rpx;
  padding: 0 28rpx;
  border-radius: 999rpx;
  border: 2rpx solid #c9e8da;
  background: #fff;
  color: #249672;
  font-size: 26rpx;
  font-weight: 700;
}

.stats {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12rpx;
}

.stat {
  margin-bottom: 0;
}

.icon {
  font-size: 32rpx;
}

.num {
  font-size: 40rpx;
  font-weight: 800;
  color: #1d3557;
}

.sample {
  display: block;
  margin: 12rpx 0 14rpx;
}

.row-between {
  display: flex;
  justify-content: space-between;
  gap: 12rpx;
  align-items: center;
}

.link {
  color: #249672;
  font-weight: 750;
  font-size: 24rpx;
}

.bars {
  display: flex;
  align-items: flex-end;
  gap: 8rpx;
  height: 200rpx;
  margin-top: 18rpx;
}

.bar-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6rpx;
}

.bar-num {
  font-size: 20rpx;
  font-weight: 700;
}

.bar {
  width: 16rpx;
  border-radius: 999rpx;
  background: #2eb086;
}

.total {
  display: inline-flex;
  margin-top: 16rpx;
  padding: 10rpx 16rpx;
  border-radius: 16rpx;
  background: #e8f7f0;
  color: #249672;
  font-weight: 750;
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 16rpx 0;
  font-weight: 700;
}

.action {
  margin-top: 20rpx;
}

.tip {
  display: flex;
  gap: 16rpx;
  align-items: center;
  background: linear-gradient(90deg, #fff 0%, #f5fbf8 100%);
}

.tip-copy {
  flex: 1;
  min-width: 0;
}

.tip-title {
  display: block;
  font-weight: 800;
}
</style>
