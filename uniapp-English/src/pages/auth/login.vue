<template>
  <view class="page login">
    <view class="top">
      <view class="brand-row">
        <MascotPlace size="sm" round />
        <view>
          <text class="brand-title">单词闯关</text>
          <text class="brand-sub">小学 · 初中</text>
        </view>
      </view>
      <text class="parent-link" @click="goParent">家长入口</text>
    </view>

    <view class="headline">让每一个单词成为一次小冒险</view>
    <text class="muted lead">从小学同步到初中进阶，陪你一点点成长</text>
    <view class="features">
      <text class="chip">📚 同步教材</text>
      <text class="chip">🏔 闯关记单词</text>
      <text class="chip">🦊 伙伴陪伴</text>
    </view>

    <view class="hero">
      <MascotPlace size="lg" width="280rpx" height="280rpx" />
      <text class="float a">Aa</text>
      <text class="float b">Bb</text>
      <text class="float c">Cc</text>
    </view>

    <view class="card box">
      <view class="box-head">
        <MascotPlace size="sm" round />
        <view>
          <view class="box-title">准备好出发了吗？</view>
          <text class="muted">选择你的学段，开启学习之旅</text>
        </view>
      </view>

      <view class="stages">
        <view
          class="stage"
          :class="{ active: stage === 'primary' }"
          @click="chooseStage('primary')"
        >
          <text v-if="stage === 'primary'" class="check">✓</text>
          <text class="stage-icon">🌱</text>
          <text class="stage-name">小学</text>
          <text class="muted">1—6年级</text>
        </view>
        <view
          class="stage"
          :class="{ active: stage === 'junior' }"
          @click="chooseStage('junior')"
        >
          <text v-if="stage === 'junior'" class="check">✓</text>
          <text class="stage-icon">🧭</text>
          <text class="stage-name">初中</text>
          <text class="muted">7—9年级</text>
        </view>
      </view>

      <button class="btn" :disabled="loading" @click="login">
        {{ loading ? "登录中..." : "微信登录，开启学习" }}
      </button>
      <text class="muted tip">首次使用，可以请家长陪你一起完成</text>
      <view class="foot">
        <text>使用帮助</text>
        <text class="sep">|</text>
        <text>隐私保护</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from "vue";
import MascotPlace from "../../components/MascotPlace.vue";
import { fetchChildren, wechatLogin } from "../../api";
import { useSessionStore } from "../../stores/session";
import { errorMessage } from "../../utils/format";

const loading = ref(false);
const session = useSessionStore();
const stage = ref<"primary" | "junior">(
  (uni.getStorageSync("wq_stage") as "primary" | "junior") || "primary",
);

function chooseStage(next: "primary" | "junior") {
  stage.value = next;
  uni.setStorageSync("wq_stage", next);
}

function goParent() {
  uni.showToast({ title: "登录后可进入家长中心", icon: "none" });
}

async function loginWithCode(code: string) {
  uni.setStorageSync("wq_stage", stage.value);
  const result = await wechatLogin(code);
  session.setToken(result.token);
  const children = await fetchChildren();
  if (children.items.length === 0) {
    uni.redirectTo({ url: "/pages/child/create" });
    return;
  }
  uni.switchTab({ url: "/pages/home/index" });
}

async function login() {
  loading.value = true;
  try {
    // #ifdef MP-WEIXIN
    const loginResult = await new Promise<UniApp.LoginRes>((resolve, reject) => {
      uni.login({
        provider: "weixin",
        success: resolve,
        fail: reject,
      });
    });
    if (!loginResult.code) throw new Error("获取微信登录码失败");
    await loginWithCode(loginResult.code);
    // #endif
    // #ifndef MP-WEIXIN
    await loginWithCode("demo-parent");
    // #endif
  } catch (error) {
    uni.showToast({ title: errorMessage(error), icon: "none" });
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login {
  padding-top: calc(48rpx + env(safe-area-inset-top));
  padding-bottom: 40rpx;
}

.top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 28rpx;
}

.brand-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.brand-title {
  display: block;
  font-size: 32rpx;
  font-weight: 800;
}

.brand-sub {
  display: block;
  color: #6b7c8f;
  font-size: 22rpx;
}

.parent-link {
  color: #249672;
  font-weight: 700;
  font-size: 26rpx;
}

.headline {
  font-size: 48rpx;
  font-weight: 850;
  line-height: 1.35;
  color: #1d3557;
}

.lead {
  display: block;
  margin-top: 12rpx;
}

.features {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 20rpx;
}

.hero {
  position: relative;
  margin: 28rpx 0;
  height: 320rpx;
  border-radius: 36rpx;
  background: linear-gradient(180deg, #fff8ea 0%, #e7f6ee 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.float {
  position: absolute;
  width: 72rpx;
  height: 72rpx;
  border-radius: 20rpx;
  background: #fff;
  box-shadow: 0 8rpx 18rpx rgba(29, 53, 87, 0.08);
  text-align: center;
  line-height: 72rpx;
  font-weight: 800;
  color: #249672;
}

.float.a {
  left: 28rpx;
  top: 36%;
  transform: rotate(-8deg);
}

.float.b {
  right: 36rpx;
  top: 18%;
  transform: rotate(10deg);
  color: #f59a3a;
}

.float.c {
  right: 72rpx;
  bottom: 18%;
}

.box {
  margin-bottom: 0;
}

.box-head {
  display: flex;
  gap: 16rpx;
  align-items: center;
  margin-bottom: 24rpx;
}

.box-title {
  font-size: 34rpx;
  font-weight: 800;
}

.stages {
  display: flex;
  gap: 16rpx;
}

.stage {
  position: relative;
  flex: 1;
  padding: 24rpx 20rpx;
  border-radius: 24rpx;
  border: 3rpx solid #e6eee9;
  background: #fcfdfc;
}

.stage.active {
  border-color: #2eb086;
  background: #e8f7f0;
}

.stage-icon {
  display: block;
  font-size: 40rpx;
  margin-bottom: 8rpx;
}

.stage-name {
  display: block;
  font-size: 32rpx;
  font-weight: 800;
}

.check {
  position: absolute;
  top: 12rpx;
  right: 12rpx;
  width: 36rpx;
  height: 36rpx;
  border-radius: 50%;
  background: #2eb086;
  color: #fff;
  font-size: 20rpx;
  text-align: center;
  line-height: 36rpx;
}

.btn {
  margin-top: 28rpx;
}

.tip {
  display: block;
  text-align: center;
  margin-top: 18rpx;
}

.foot {
  display: flex;
  justify-content: center;
  gap: 12rpx;
  margin-top: 12rpx;
  color: #249672;
  font-size: 22rpx;
  font-weight: 650;
}

.sep {
  color: #c9e8da;
}
</style>
