<template>
  <view class="page">
    <view v-if="errorText" class="card">{{ errorText }}</view>
    <view v-for="book in books" :key="book.id" class="card">
      <text class="kicker">{{ book.publisher }}</text>
      <view class="heading">{{ book.name }}</view>
      <text class="muted">{{ gradeLabel(book.grade) }}{{ book.volume }} · 第 1 单元免费</text>
      <view
        v-for="unit in book.units"
        :key="unit.id"
        class="unit"
        @click="openUnit(unit)"
      >
        <view>
          <view class="unit-title">{{ unit.title }}</view>
          <text class="muted">{{ unit.wordCount }} 词</text>
        </view>
        <text :class="unit.locked ? 'lock' : 'go'">{{ unit.locked ? "会员" : "去闯关" }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { fetchTextbooks } from "../../api";
import type { Textbook, UnitView } from "../../types/api";
import { ensureLogin } from "../../utils/auth";
import { errorMessage, gradeLabel } from "../../utils/format";

const books = ref<Textbook[]>([]);
const errorText = ref("");

function openUnit(unit: UnitView) {
  if (unit.locked) {
    uni.navigateTo({ url: "/pages/member/index" });
    return;
  }
  uni.navigateTo({ url: `/pages/study/play?unitId=${unit.id}` });
}

onShow(() => {
  if (!ensureLogin()) return;
  errorText.value = "";
  fetchTextbooks()
    .then((result) => {
      books.value = result.items;
    })
    .catch((error: unknown) => {
      errorText.value = errorMessage(error);
    });
});
</script>

<style scoped>
.heading {
  margin: 8rpx 0 8rpx;
  font-size: 36rpx;
  font-weight: 800;
}

.unit {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 20rpx;
  padding-top: 20rpx;
  border-top: 1rpx solid #ffe8e0;
}

.unit-title {
  font-size: 30rpx;
  font-weight: 700;
}

.go {
  color: #ff6b6b;
  font-weight: 700;
  background: #fff0e8;
  padding: 8rpx 18rpx;
  border-radius: 999rpx;
  font-size: 24rpx;
}

.lock {
  color: #d97706;
  font-weight: 600;
}
</style>
