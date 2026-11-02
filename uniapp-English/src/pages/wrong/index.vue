<template>
  <view class="page">
    <view v-if="errorText" class="card">{{ errorText }}</view>
    <view v-else-if="items.length === 0" class="card empty">
      <view class="emoji">🌈</view>
      <view class="heading">还没有错词哦</view>
      <text class="muted">答错的词会出现在这里，答对后会自动移出。</text>
    </view>
    <template v-else>
      <view class="card">
        <view class="heading">📒 错词本 · {{ items.length }} 词</view>
        <text class="muted">专项复习不占用今日额度，答对后会移出错词本。</text>
        <button class="btn action" @click="startReview">再练一次</button>
      </view>
      <view v-for="word in items" :key="word.id" class="card word">
        <view>
          <view class="spell">{{ word.spelling }}</view>
          <text class="muted">{{ word.phonetic }} · {{ word.meaning }}</text>
          <view class="dots">
            <view
              v-for="n in 5"
              :key="n"
              class="dot"
              :class="{ on: n <= (word.box || 1) }"
            />
          </view>
        </view>
        <text class="count">弱 {{ word.wrongCount }}</text>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { fetchWrongWords } from "../../api";
import type { WrongWord } from "../../types/api";
import { ensureLogin } from "../../utils/auth";
import { errorMessage } from "../../utils/format";

const items = ref<WrongWord[]>([]);
const errorText = ref("");

function startReview() {
  uni.navigateTo({ url: "/pages/study/play?mode=review" });
}

onShow(() => {
  if (!ensureLogin()) return;
  errorText.value = "";
  fetchWrongWords()
    .then((result) => {
      items.value = result.items;
    })
    .catch((error: unknown) => {
      errorText.value = errorMessage(error);
    });
});
</script>

<style scoped>
.empty {
  text-align: center;
}

.emoji {
  font-size: 56rpx;
  margin-bottom: 8rpx;
}

.heading {
  font-size: 36rpx;
  font-weight: 800;
  margin-bottom: 8rpx;
}

.action {
  margin-top: 24rpx;
}

.word {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.spell {
  font-size: 36rpx;
  font-weight: 800;
}

.count {
  color: #ff6b6b;
  font-weight: 700;
  background: #fff0e8;
  padding: 8rpx 16rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
}

.dots {
  display: flex;
  gap: 8rpx;
  margin-top: 10rpx;
}

.dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background: #ffe0d4;
}

.dot.on {
  background: linear-gradient(135deg, #ffc857, #ff6b6b);
}
</style>
