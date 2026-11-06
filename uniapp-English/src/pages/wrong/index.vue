<template>
  <view class="page">
    <view class="head">
      <view>
        <view class="title">复习小站 ✨</view>
        <text class="muted">把还不熟悉的单词，慢慢变成老朋友</text>
      </view>
      <view class="counters">
        <text class="chip">📗 待复习 {{ items.length }} 词</text>
        <text class="chip star">⭐ 已掌握 {{ mastered }} 词</text>
      </view>
    </view>

    <view v-if="errorText" class="card">{{ errorText }}</view>

    <view v-else-if="items.length === 0" class="card empty">
      <MascotPlace class="fox" size="lg" />
      <view class="heading">暂时没有待复习的单词</view>
      <text class="muted">
        闯关时还没记牢的单词，会自动收进这里。多见几次面，就会越来越熟悉。
      </text>
      <button class="btn action" @click="goHome">继续今日冒险 ></button>
      <button class="btn btn-line" @click="goLibrary">去单词地图看看 ></button>
    </view>

    <template v-else>
      <view class="card">
        <view class="heading">错词本 · {{ items.length }} 词</view>
        <text class="muted">专项复习不占用今日额度，答对后会移出错词本。</text>
        <button class="btn action" @click="startReview">开始复习</button>
      </view>
      <view v-for="word in items" :key="word.id" class="card word">
        <view>
          <view class="spell">{{ word.spelling }}</view>
          <text class="muted">{{ word.phonetic }} · {{ word.meaning }}</text>
        </view>
        <text class="count">错 {{ word.wrongCount }}</text>
      </view>
    </template>

    <view class="card tips">
      <view class="heading sm">让单词住进记忆里</view>
      <view class="tip-row">
        <text class="tip-icon">🎧</text>
        <view>
          <text class="tip-title">听一听</text>
          <text class="muted">用声音加深印象，记得更牢</text>
        </view>
      </view>
      <view class="tip-row">
        <text class="tip-icon">🗣</text>
        <view>
          <text class="tip-title">读一读</text>
          <text class="muted">开口读出单词，让记忆更清晰</text>
        </view>
      </view>
      <view class="tip-row">
        <text class="tip-icon">📅</text>
        <view>
          <text class="tip-title">隔天再见一面</text>
          <text class="muted">过一段时间再复习，记得更长久</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import MascotPlace from "../../components/MascotPlace.vue";
import { fetchWeekly, fetchWrongWords } from "../../api";
import type { WrongWord } from "../../types/api";
import { ensureLogin } from "../../utils/auth";
import { errorMessage } from "../../utils/format";

const items = ref<WrongWord[]>([]);
const mastered = ref(0);
const errorText = ref("");

function startReview() {
  uni.navigateTo({ url: "/pages/study/play?mode=review" });
}
function goHome() {
  uni.switchTab({ url: "/pages/home/index" });
}
function goLibrary() {
  uni.switchTab({ url: "/pages/library/index" });
}

onShow(() => {
  if (!ensureLogin()) return;
  errorText.value = "";
  Promise.all([fetchWrongWords(), fetchWeekly()])
    .then(([wrong, weekly]) => {
      items.value = wrong.items;
      mastered.value = weekly.studiedCount || 0;
    })
    .catch((error: unknown) => {
      errorText.value = errorMessage(error);
    });
});
</script>

<style scoped>
.head {
  margin-bottom: 16rpx;
}

.title {
  font-size: 42rpx;
  font-weight: 800;
}

.counters {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 14rpx;
}

.chip.star {
  background: #fff3e4;
  border-color: #f4d2a8;
}

.empty {
  text-align: center;
  background: linear-gradient(180deg, #fff 0%, #f5fbf8 100%);
}

.fox {
  margin: 8rpx auto 12rpx;
}

.heading {
  font-size: 34rpx;
  font-weight: 800;
  margin-bottom: 8rpx;
}

.heading.sm {
  font-size: 30rpx;
}

.action {
  margin-top: 24rpx;
}

.word {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16rpx;
}

.spell {
  font-size: 34rpx;
  font-weight: 800;
}

.count {
  color: #d97706;
  font-weight: 750;
}

.tip-row {
  display: flex;
  gap: 16rpx;
  align-items: flex-start;
  margin-top: 18rpx;
}

.tip-icon {
  font-size: 36rpx;
}

.tip-title {
  display: block;
  font-weight: 750;
}
</style>
