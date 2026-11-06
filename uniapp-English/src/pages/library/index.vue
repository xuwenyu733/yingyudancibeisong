<template>
  <view class="page">
    <view class="head">
      <view class="title">选一本单词书，开启新地图 ☀</view>
      <text class="muted">找到和课堂同步的内容，让每次学习更有方向</text>
    </view>

    <view class="search">
      <text>🔍</text>
      <input v-model="keyword" placeholder="搜索教材或单词" />
    </view>

    <view class="filters">
      <view class="pill" :class="{ active: stage === 'primary' }" @click="switchStage('primary')">小学</view>
      <view class="pill" :class="{ active: stage === 'junior' }" @click="switchStage('junior')">初中</view>
      <picker mode="selector" :range="gradeLabels" :value="gradePickerIndex" @change="onGrade">
        <view class="pill">{{ gradeLabels[gradePickerIndex] || "年级" }}</view>
      </picker>
      <picker mode="selector" :range="volumes" :value="volumePickerIndex" @change="onVolume">
        <view class="pill">{{ volumes[volumePickerIndex] || "册别" }}</view>
      </picker>
    </view>

    <view v-if="errorText" class="card">{{ errorText }}</view>
    <view v-else-if="!currentBook" class="card">当前筛选下暂无教材。</view>
    <template v-else>
      <view class="card current">
        <view class="book-head">
          <view class="cover">📘</view>
          <view>
            <view class="heading ellipsis">{{ currentBook.name }}</view>
            <text class="muted ellipsis book-sub">
              {{ currentBook.publisher }} · {{ gradeLabel(currentBook.grade) }}{{ currentBook.volume }}
            </text>
          </view>
        </view>
        <view class="row-between muted">
          <text>已学习 {{ learned }} / {{ totalWords || currentBook.units.length * 8 }} 词</text>
          <text>{{ progress }}%</text>
        </view>
        <view class="progress">
          <view class="progress-fill" :style="{ width: progress + '%' }" />
        </view>

        <view
          v-for="(unit, index) in currentBook.units"
          :key="unit.id"
          class="unit"
          @click="openUnit(unit)"
        >
          <view>
            <view class="unit-title">Unit {{ index + 1 }} · {{ unit.title }}</view>
            <text class="muted">{{ unit.wordCount }} 词</text>
          </view>
          <text :class="unit.locked ? 'lock' : 'go'">
            {{ unit.locked ? "待解锁" : index === 0 ? "继续闯关 >" : "去闯关 >" }}
          </text>
        </view>
      </view>

      <view class="card map">
        <view class="heading sm">冒险地图</view>
        <view
          v-for="(unit, index) in currentBook.units.slice(0, 4)"
          :key="unit.id"
          class="node"
          :class="{ active: !unit.locked && index === 0, locked: unit.locked }"
        >
          <text class="node-icon">{{ unit.locked ? "🔒" : index === 0 ? "🦊" : "📍" }}</text>
          <view>
            <text class="unit-title">{{ unit.title }}</text>
            <text class="muted">{{ unit.locked ? "待解锁" : index === 0 ? "当前学习" : "可挑战" }}</text>
          </view>
        </view>
      </view>

      <view class="next">
        <view class="heading sm">🛤 下一段旅程</view>
        <view class="next-grid">
          <view v-for="book in nextBooks" :key="book.id" class="card next-card" @click="jumpGrade(book.grade)">
            <view class="cover small">📗</view>
            <text class="unit-title">{{ book.name }}</text>
            <text class="muted">{{ book.publisher }} · {{ book.volume }}</text>
            <text class="go">查看 ></text>
          </view>
          <view v-if="!nextBooks.length" class="card next-card">
            <text class="unit-title">更多教材即将到来</text>
            <text class="muted">先把当前地图走完吧</text>
          </view>
        </view>
      </view>

      <text class="foot" @click="goParent">学习权益请家长协助查看 ></text>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { fetchChildren, fetchTextbooks, fetchToday } from "../../api";
import type { Textbook, TodayTask, UnitView } from "../../types/api";
import { ensureLogin } from "../../utils/auth";
import { errorMessage, gradeLabel } from "../../utils/format";

const books = ref<Textbook[]>([]);
const task = ref<TodayTask | null>(null);
const errorText = ref("");
const stage = ref<"primary" | "junior">(
  (uni.getStorageSync("wq_stage") as "primary" | "junior") || "primary",
);
const grade = ref(3);
const volume = ref("全部");
const keyword = ref("");

const gradeOptions = computed(() =>
  stage.value === "junior" ? [7, 8, 9] : [1, 2, 3, 4, 5, 6],
);
const gradeLabels = computed(() => gradeOptions.value.map((item) => gradeLabel(item)));
const gradePickerIndex = computed(() =>
  Math.max(0, gradeOptions.value.findIndex((item) => item === grade.value)),
);
const filteredByStage = computed(() =>
  books.value.filter((item) =>
    stage.value === "junior" ? item.grade >= 7 : item.grade <= 6,
  ),
);
const volumes = computed(() => {
  const set = new Set(filteredByStage.value.map((item) => item.volume).filter(Boolean));
  return ["全部", ...set];
});
const volumePickerIndex = computed(() =>
  Math.max(0, volumes.value.findIndex((item) => item === volume.value)),
);
const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase();
  return filteredByStage.value.filter((item) => {
    if (grade.value && item.grade !== grade.value) return false;
    if (volume.value !== "全部" && item.volume !== volume.value) return false;
    if (!q) return true;
    return (
      item.name.toLowerCase().includes(q) ||
      item.publisher.toLowerCase().includes(q) ||
      item.units.some((unit) => unit.title.toLowerCase().includes(q))
    );
  });
});
const currentBook = computed(() => {
  const id = task.value?.textbook?.id;
  return filtered.value.find((item) => item.id === id) || filtered.value[0] || null;
});
const learned = computed(() => task.value?.studiedToday || 0);
const totalWords = computed(
  () => currentBook.value?.units.reduce((sum, unit) => sum + unit.wordCount, 0) || 0,
);
const progress = computed(() => {
  if (!totalWords.value) return 0;
  return Math.min(100, Math.round((learned.value / totalWords.value) * 100));
});
const nextBooks = computed(() =>
  filtered.value.filter((item) => item.id !== currentBook.value?.id).slice(0, 3),
);

function switchStage(next: "primary" | "junior") {
  stage.value = next;
  uni.setStorageSync("wq_stage", next);
  grade.value = next === "junior" ? 7 : 3;
  volume.value = "全部";
}
function onGrade(event: { detail: { value: string | number } }) {
  grade.value = gradeOptions.value[Number(event.detail.value)] || grade.value;
}
function onVolume(event: { detail: { value: string | number } }) {
  volume.value = volumes.value[Number(event.detail.value)] || "全部";
}
function jumpGrade(next: number) {
  grade.value = next;
  stage.value = next >= 7 ? "junior" : "primary";
}
function openUnit(unit: UnitView) {
  if (unit.locked) {
    uni.navigateTo({ url: "/pages/member/index" });
    return;
  }
  uni.navigateTo({ url: `/pages/study/play?unitId=${unit.id}` });
}
function goParent() {
  uni.switchTab({ url: "/pages/parent/index" });
}

onShow(() => {
  if (!ensureLogin()) return;
  errorText.value = "";
  Promise.all([fetchTextbooks(), fetchToday(), fetchChildren()])
    .then(([textbookResult, today, children]) => {
      books.value = textbookResult.items;
      task.value = today;
      const current =
        children.items.find((item) => item.id === children.currentChildId) || children.items[0];
      if (current) {
        grade.value = current.grade;
        stage.value = current.grade >= 7 ? "junior" : "primary";
      }
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
  font-size: 38rpx;
  font-weight: 800;
  line-height: 1.35;
}

.search {
  display: flex;
  align-items: center;
  gap: 12rpx;
  height: 80rpx;
  padding: 0 24rpx;
  border-radius: 999rpx;
  background: #fff;
  border: 2rpx solid #e6eee9;
  margin-bottom: 16rpx;
}

.search input {
  flex: 1;
  font-size: 26rpx;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-bottom: 18rpx;
}

.book-head {
  display: flex;
  gap: 16rpx;
  align-items: center;
  margin-bottom: 16rpx;
}

.book-head > view:last-child {
  flex: 1;
  min-width: 0;
}

.book-sub {
  display: block;
}

.cover {
  width: 88rpx;
  height: 108rpx;
  border-radius: 18rpx;
  background: linear-gradient(160deg, #dff4ea, #fff4df);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40rpx;
}

.cover.small {
  width: 64rpx;
  height: 80rpx;
  font-size: 28rpx;
}

.heading {
  font-size: 34rpx;
  font-weight: 800;
}

.heading.sm {
  font-size: 30rpx;
  font-weight: 800;
  margin-bottom: 12rpx;
}

.row-between {
  display: flex;
  justify-content: space-between;
  gap: 12rpx;
}

.progress {
  margin: 12rpx 0 8rpx;
}

.unit {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 18rpx;
  padding-top: 18rpx;
  border-top: 1rpx solid #eef2f7;
}

.unit-title {
  display: block;
  font-size: 28rpx;
  font-weight: 750;
}

.go {
  color: #249672;
  font-weight: 750;
}

.lock {
  color: #9aa7b5;
  font-weight: 700;
}

.map {
  background: linear-gradient(180deg, #f7fcf9 0%, #eef7f2 100%);
}

.node {
  display: flex;
  gap: 16rpx;
  align-items: center;
  padding: 16rpx;
  border-radius: 20rpx;
  background: rgba(255, 255, 255, 0.85);
  border: 2rpx solid #e6eee9;
  margin-top: 12rpx;
}

.node.active {
  border-color: #2eb086;
  background: #e8f7f0;
}

.node.locked {
  opacity: 0.65;
}

.node-icon {
  font-size: 34rpx;
}

.next {
  margin-top: 8rpx;
}

.next-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12rpx;
}

.next-card {
  margin: 0;
}

.foot {
  display: block;
  margin-top: 16rpx;
  color: #249672;
  font-weight: 750;
  font-size: 24rpx;
}
</style>
