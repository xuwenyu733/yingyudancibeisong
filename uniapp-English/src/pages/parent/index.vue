<template>
  <view class="page">
    <view class="card">
      <text class="kicker">当前孩子</text>
      <view class="heading">{{ childText }}</view>
      <picker
        v-if="children.length > 1"
        mode="selector"
        :range="childNames"
        @change="onSwitch"
      >
        <view class="switch">切换孩子</view>
      </picker>
      <picker
        v-if="volumeLabels.length"
        mode="selector"
        :range="volumeLabels"
        :value="volumeIndex"
        @change="onTextbook"
      >
        <view class="field picker">教材：{{ volumeLabels[volumeIndex] || "未选择" }}</view>
      </picker>
      <button class="btn btn-line add" @click="goCreate">再添加一个孩子</button>
    </view>

    <view class="card">
      <text class="kicker">本周</text>
      <view class="stats">
        <view>
          <view class="num">{{ report?.studiedCount || 0 }}</view>
          <text class="muted">学习词次</text>
        </view>
        <view>
          <view class="num">{{ report?.accuracy || 0 }}%</view>
          <text class="muted">正确率</text>
        </view>
        <view>
          <view class="num">{{ report?.activeDays || 0 }}</view>
          <text class="muted">打卡天数</text>
        </view>
      </view>
      <button class="btn action" @click="goReport">查看周报</button>
    </view>

    <view class="card">
      <text class="kicker">打卡提醒</text>
      <view class="heading">{{ reminderTitle }}</view>
      <text class="muted">{{ reminderHint }}</text>
      <view class="switch-row">
        <text>每日提醒</text>
        <switch :checked="reminder?.enabled" @change="onToggle" />
      </view>
      <!-- #ifdef MP-WEIXIN -->
      <button class="btn action" :disabled="subscribing" @click="subscribe">
        {{ subscribing ? "请求中..." : "授权微信订阅消息" }}
      </button>
      <!-- #endif -->
      <button class="btn btn-line" :disabled="testing" @click="testSend">
        {{ testing ? "发送中..." : "测试推送" }}
      </button>
    </view>

    <view class="card">
      <text class="kicker">会员</text>
      <view class="heading">{{ memberText }}</view>
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

const current = computed(() => children.value.find((item) => item.id === currentId.value));
const childNames = computed(() => children.value.map((item) => item.nickname));
const gradeBooks = computed(() =>
  current.value
    ? books.value.filter((item) => item.grade === current.value!.grade)
    : [],
);
const volumeLabels = computed(() =>
  gradeBooks.value.map((item) => `${item.volume} · ${item.name}`),
);
const volumeIndex = computed(() => {
  if (!current.value?.textbookId) return 0;
  const index = gradeBooks.value.findIndex(
    (item) => item.id === current.value!.textbookId,
  );
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
const reminderTitle = computed(() => {
  if (!reminder.value) return "加载中";
  if (reminder.value.studiedToday) return "今天已打卡";
  return "今天还没打卡";
});
const reminderHint = computed(() => {
  if (!reminder.value) return "";
  const modeText = reminder.value.mode === "wechat" ? "真实微信推送" : "开发模拟推送";
  const acceptText = reminder.value.accepted ? "已授权" : "未授权";
  return `${modeText} · ${acceptText}。未学时会提醒家长。`;
});

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
      content: "在 uniapp-English/.env.development 里设置 VITE_WECHAT_SUBSCRIBE_TEMPLATE_ID，或先点测试推送走模拟。",
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

function logout() {
  session.logout();
}

onShow(() => {
  if (!ensureLogin()) return;
  void load();
});
</script>

<style scoped>
.heading {
  margin: 8rpx 0;
  font-size: 36rpx;
  font-weight: 800;
}

.switch {
  color: #ff6b6b;
  font-weight: 700;
}

.add,
.action {
  margin-top: 24rpx;
}

.stats {
  display: flex;
  justify-content: space-between;
  margin-top: 20rpx;
}

.num {
  font-size: 40rpx;
  font-weight: 800;
  color: #ff6b6b;
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 20rpx;
}

.picker {
  margin-top: 16rpx;
  line-height: 88rpx;
}
</style>
