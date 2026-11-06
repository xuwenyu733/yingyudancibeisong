<template>
  <view class="page">
    <view class="intro">
      <view class="heading">先认识一下，未来的单词探险家</view>
      <text class="muted">家长可协助填写，学习计划以后也能调整</text>
    </view>

    <view class="card form">
      <view class="form-title">📋 创建学习档案</view>

      <text class="label">选择一个专属形象</text>
      <view class="avatars">
        <view
          v-for="item in AVATAR_OPTIONS"
          :key="item.id"
          class="avatar"
          :class="{ active: avatarId === item.id }"
          :style="{ background: item.bg, borderColor: item.color }"
          @click="avatarId = item.id"
        >
          <view class="letter" :style="{ background: item.color }">
            {{ avatarLetter(nickname) }}
          </view>
          <text v-if="avatarId === item.id" class="tick">✓</text>
        </view>
      </view>

      <text class="label">你的昵称</text>
      <input v-model="nickname" class="field" maxlength="12" placeholder="孩子昵称，例如小宇" />
      <text class="hint">伙伴会这样称呼你</text>

      <text class="label">正在读哪个学段？</text>
      <view class="pills">
        <view class="pill" :class="{ active: stage === 'primary' }" @click="setStage('primary')">小学</view>
        <view class="pill" :class="{ active: stage === 'junior' }" @click="setStage('junior')">初中</view>
      </view>

      <text class="label">年级</text>
      <view class="pills wrap">
        <view
          v-for="(label, index) in gradeLabels"
          :key="label"
          class="pill"
          :class="{ active: gradeIndex === index }"
          @click="gradeIndex = index"
        >
          {{ label }}
        </view>
      </view>

      <text class="label">学习教材</text>
      <picker mode="selector" :range="volumeLabels" :value="volumeIndex" @change="onVolume">
        <view class="field picker">{{ volumeLabels[volumeIndex] || "当前年级暂无教材" }}</view>
      </picker>

      <text class="label">每天的新词目标</text>
      <view class="pills">
        <view
          v-for="goal in goals"
          :key="goal"
          class="pill"
          :class="{ active: dailyGoal === goal }"
          @click="dailyGoal = goal"
        >
          {{ goal }}词
        </view>
      </view>
      <text class="hint">先从轻松的小目标开始，随时可调整</text>

      <button class="btn submit" :disabled="loading" @click="submit">
        {{ loading ? "保存中..." : "创建档案，开始冒险 >" }}
      </button>
    </view>

    <view class="card pass">
      <MascotPlace size="lg" class="mascot" />
      <view class="pass-card">
        <view class="pass-title">🏔 我的冒险通行证</view>
        <view class="pass-user">
          <view class="mini" :style="{ background: selectedAvatar.color }">
            {{ avatarLetter(nickname) }}
          </view>
          <view>
            <text class="name">{{ nickname || "小探险家" }}</text>
            <text class="muted">{{ passMeta }}</text>
          </view>
        </view>
        <view class="pass-meta">
          <text>每天{{ dailyGoal }}词</text>
          <text>{{ selectedAvatar.label }}</text>
        </view>
      </view>
      <text class="motto">每个孩子，都有自己的成长节奏</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { onShow } from "@dcloudio/uni-app";
import MascotPlace from "../../components/MascotPlace.vue";
import { createChild, fetchTextbooks } from "../../api";
import type { Textbook } from "../../types/api";
import { AVATAR_OPTIONS, avatarLetter } from "../../utils/avatar";
import { errorMessage, gradeLabel } from "../../utils/format";

const goals = [10, 15, 20];
const stage = ref<"primary" | "junior">(
  (uni.getStorageSync("wq_stage") as "primary" | "junior") || "primary",
);
const primaryGrades = ["一年级", "二年级", "三年级", "四年级", "五年级", "六年级"];
const juniorGrades = ["七年级", "八年级", "九年级"];
const gradeLabels = computed(() => (stage.value === "junior" ? juniorGrades : primaryGrades));
const gradeIndex = ref(stage.value === "junior" ? 0 : 2);
const volumeIndex = ref(0);
const nickname = ref(uni.getStorageSync("wq_nickname") || "小宇");
const avatarId = ref(uni.getStorageSync("wq_avatar_id") || AVATAR_OPTIONS[0].id);
const dailyGoal = ref(Number(uni.getStorageSync("wq_daily_goal") || 10));
const loading = ref(false);
const books = ref<Textbook[]>([]);

const selectedAvatar = computed(
  () => AVATAR_OPTIONS.find((item) => item.id === avatarId.value) || AVATAR_OPTIONS[0],
);
const gradeValue = computed(() =>
  stage.value === "junior" ? gradeIndex.value + 7 : gradeIndex.value + 1,
);
const gradeBooks = computed(() => books.value.filter((item) => item.grade === gradeValue.value));
const volumeLabels = computed(() =>
  gradeBooks.value.map((item) => `${item.publisher} · ${item.name} · ${item.volume}`),
);
const passMeta = computed(() => {
  const book = gradeBooks.value[volumeIndex.value];
  return book ? `${gradeLabel(book.grade)} · ${book.volume}` : gradeLabels.value[gradeIndex.value];
});

watch(stage, () => {
  gradeIndex.value = stage.value === "junior" ? 0 : 2;
  volumeIndex.value = 0;
});

watch(gradeIndex, () => {
  volumeIndex.value = 0;
});

function setStage(next: "primary" | "junior") {
  stage.value = next;
  uni.setStorageSync("wq_stage", next);
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
  if (gradeBooks.value.length && !book) {
    uni.showToast({ title: "请选择教材册别", icon: "none" });
    return;
  }
  loading.value = true;
  try {
    uni.setStorageSync("wq_nickname", name);
    uni.setStorageSync("wq_avatar_id", avatarId.value);
    uni.setStorageSync("wq_daily_goal", dailyGoal.value);
    uni.setStorageSync("wq_stage", stage.value);
    await createChild({
      nickname: name,
      grade: gradeValue.value,
      textbookId: book?.id,
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
.intro {
  margin-bottom: 16rpx;
}

.heading {
  font-size: 40rpx;
  font-weight: 800;
  line-height: 1.35;
}

.form-title {
  font-size: 32rpx;
  font-weight: 800;
  margin-bottom: 8rpx;
}

.label {
  display: block;
  margin-top: 28rpx;
  font-weight: 750;
  font-size: 28rpx;
}

.hint {
  display: block;
  margin-top: 10rpx;
  color: #6b7c8f;
  font-size: 22rpx;
}

.avatars {
  display: flex;
  gap: 16rpx;
  margin-top: 16rpx;
}

.avatar {
  position: relative;
  width: 108rpx;
  height: 108rpx;
  border-radius: 50%;
  border: 4rpx solid transparent;
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar.active {
  box-shadow: 0 0 0 6rpx rgba(46, 176, 134, 0.16);
}

.letter,
.mini {
  width: 84rpx;
  height: 84rpx;
  border-radius: 50%;
  color: #fff;
  font-size: 34rpx;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mini {
  width: 64rpx;
  height: 64rpx;
  font-size: 28rpx;
  flex-shrink: 0;
}

.tick {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 32rpx;
  height: 32rpx;
  border-radius: 50%;
  background: #2eb086;
  color: #fff;
  font-size: 18rpx;
  text-align: center;
  line-height: 32rpx;
}

.pills {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 16rpx;
}

.picker {
  display: flex;
  align-items: center;
  color: #1d3557;
}

.submit {
  margin-top: 32rpx;
}

.pass {
  text-align: center;
  background: linear-gradient(180deg, #fff9ef 0%, #f4fbf7 100%);
}

.mascot {
  margin: 0 auto;
}

.pass-card {
  margin-top: 8rpx;
  padding: 24rpx;
  border-radius: 24rpx;
  background: #fff8e8;
  border: 2rpx solid #f0e2c8;
  text-align: left;
}

.pass-title {
  font-weight: 800;
  margin-bottom: 16rpx;
}

.pass-user {
  display: flex;
  gap: 16rpx;
  align-items: center;
}

.name {
  display: block;
  font-weight: 800;
}

.pass-meta {
  display: flex;
  justify-content: space-between;
  margin-top: 18rpx;
  color: #6b7c8f;
  font-size: 22rpx;
}

.motto {
  display: inline-block;
  margin-top: 20rpx;
  padding: 12rpx 22rpx;
  border-radius: 999rpx;
  background: rgba(46, 176, 134, 0.12);
  color: #249672;
  font-weight: 700;
  font-size: 22rpx;
}
</style>
