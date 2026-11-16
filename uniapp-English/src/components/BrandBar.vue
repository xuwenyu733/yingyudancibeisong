<template>
  <view class="brand-card card">
    <view class="brand-left">
      <view>
        <text class="brand-title">单词闯关</text>
        <text class="brand-sub">小学 · 初中</text>
      </view>
    </view>
    <view class="brand-right">
      <image
        class="avatar-photo"
        src="/static/illustrations/xiaoyu-avatar.png?v=20261110w2"
        mode="aspectFill"
      />
      <view class="brand-child">
        <text class="child-name ellipsis">{{ label }}</text>
        <text class="child-tag">当前孩子</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { fetchChildren } from "../api";
import { gradeLabel } from "../utils/format";

const props = defineProps<{
  childText?: string;
}>();

const loaded = ref("");

const label = computed(
  () =>
    props.childText ||
    loaded.value ||
    (uni.getStorageSync("wq_nickname") as string) ||
    "还没有孩子档案",
);

async function refresh() {
  if (props.childText) return;
  try {
    const result = await fetchChildren();
    const current =
      result.items.find((item) => item.id === result.currentChildId) || result.items[0];
    if (current) {
      loaded.value = `${current.nickname} · ${gradeLabel(current.grade)}`;
      return;
    }
    loaded.value = "还没有孩子档案";
  } catch {
    /* keep storage fallback */
  }
}

watch(
  () => props.childText,
  () => {
    if (!props.childText) void refresh();
  },
);

onMounted(() => {
  void refresh();
});

onShow(() => {
  void refresh();
});
</script>

<style scoped>
.brand-card.card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  padding: 10rpx 16rpx;
  margin-bottom: 14rpx;
  min-height: 0;
  box-shadow: 0 6rpx 16rpx rgba(29, 53, 87, 0.04);
}

.brand-left,
.brand-right {
  display: flex;
  align-items: center;
  gap: 10rpx;
  min-width: 0;
}

.brand-title {
  display: block;
  font-size: 24rpx;
  font-weight: 800;
  color: #1d3557;
  line-height: 1.2;
}

.brand-sub {
  display: block;
  margin-top: 0;
  font-size: 18rpx;
  color: #8a94a6;
  line-height: 1.2;
}

.avatar-photo {
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
  background: #ffffff;
  flex-shrink: 0;
}

.brand-child {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2rpx;
}

.child-name {
  display: block;
  max-width: 220rpx;
  font-size: 22rpx;
  font-weight: 750;
  color: #1d3557;
  line-height: 1.2;
}

.child-tag {
  display: inline-flex;
  align-items: center;
  height: 28rpx;
  padding: 0 10rpx;
  border-radius: 999rpx;
  background: #e8f7f0;
  color: #249672;
  font-size: 16rpx;
  font-weight: 700;
  line-height: 1;
}
</style>
