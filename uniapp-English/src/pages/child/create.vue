<template>
  <view class="page">
    <view class="card">
      <text class="kicker">家长填写</text>
      <view class="heading">给孩子建一个学习档案</view>
      <text class="muted">选好年级和上下册后，今日任务会按所选词库出题。</text>
      <input v-model="nickname" class="field" maxlength="12" placeholder="孩子昵称，例如小满" />
      <picker mode="selector" :range="grades" :value="gradeIndex" @change="onGrade">
        <view class="field picker">年级：{{ grades[gradeIndex] }}</view>
      </picker>
      <picker
        mode="selector"
        :range="volumeLabels"
        :value="volumeIndex"
        @change="onVolume"
      >
        <view class="field picker">册别：{{ volumeLabels[volumeIndex] || "加载中" }}</view>
      </picker>
      <button class="btn submit" :disabled="loading" @click="submit">
        {{ loading ? "保存中..." : "开始学习" }}
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { createChild, fetchTextbooks } from "../../api";
import type { Textbook } from "../../types/api";
import { errorMessage } from "../../utils/format";

const grades = ["一年级", "二年级", "三年级", "四年级", "五年级", "六年级"];
const gradeIndex = ref(2);
const volumeIndex = ref(0);
const nickname = ref("");
const loading = ref(false);
const books = ref<Textbook[]>([]);

const gradeBooks = computed(() =>
  books.value.filter((item) => item.grade === gradeIndex.value + 1),
);
const volumeLabels = computed(() =>
  gradeBooks.value.map((item) => `${item.volume} · ${item.name}`),
);

function onGrade(event: { detail: { value: string | number } }) {
  gradeIndex.value = Number(event.detail.value);
  volumeIndex.value = 0;
}

function onVolume(event: { detail: { value: string | number } }) {
  volumeIndex.value = Number(event.detail.value);
}

async function submit() {
  const name = nickname.value.trim();
  if (!name) {
    uni.showToast({ title: "请填写孩子昵称", icon: "none" });
    return;
  }
  const book = gradeBooks.value[volumeIndex.value];
  if (!book) {
    uni.showToast({ title: "请选择教材册别", icon: "none" });
    return;
  }
  loading.value = true;
  try {
    await createChild({
      nickname: name,
      grade: gradeIndex.value + 1,
      textbookId: book.id,
    });
    uni.switchTab({ url: "/pages/home/index" });
  } catch (error) {
    uni.showToast({ title: errorMessage(error), icon: "none" });
  } finally {
    loading.value = false;
  }
}

onShow(() => {
  fetchTextbooks()
    .then((result) => {
      books.value = result.items;
      volumeIndex.value = 0;
    })
    .catch((error: unknown) => {
      uni.showToast({ title: errorMessage(error), icon: "none" });
    });
});
</script>

<style scoped>
.heading {
  display: block;
  margin: 12rpx 0;
  font-size: 40rpx;
  font-weight: 700;
}

.picker {
  line-height: 88rpx;
}

.submit {
  margin-top: 36rpx;
}
</style>
