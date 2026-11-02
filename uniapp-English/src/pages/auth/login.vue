<template>
  <view class="page login">
    <view class="decor top-left" />
    <view class="decor bottom-right" />
    <view class="brand-wrap">
      <view class="brand">词</view>
      <view class="spark">✨</view>
    </view>
    <text class="name">单词小闯关</text>
    <text class="muted intro">每天一点点，积分离不开小房间装扮哦</text>
    <button class="btn" :disabled="loading" @click="login">
      {{ loading ? "登录中..." : buttonText }}
    </button>
    <text class="muted tip">{{ tipText }}</text>
  </view>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { fetchChildren, wechatLogin } from "../../api";
import { useSessionStore } from "../../stores/session";
import { errorMessage } from "../../utils/format";

const loading = ref(false);
const session = useSessionStore();

// #ifdef MP-WEIXIN
const buttonText = "微信登录";
const tipText = "已配置后端微信 AppID 时走真实登录；否则自动使用开发账号。";
// #endif
// #ifndef MP-WEIXIN
const buttonText = "开始学习之旅";
const tipText = "H5/电脑调试使用固定开发账号。微信里会优先尝试微信登录。";
// #endif

async function loginWithCode(code: string) {
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
    if (!loginResult.code) {
      throw new Error("获取微信登录码失败");
    }
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
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 160rpx;
  overflow: hidden;
}

.decor {
  position: absolute;
  border-radius: 50%;
  opacity: 0.55;
  pointer-events: none;
}

.top-left {
  width: 220rpx;
  height: 220rpx;
  left: -60rpx;
  top: 40rpx;
  background: #ffd66b;
}

.bottom-right {
  width: 280rpx;
  height: 280rpx;
  right: -80rpx;
  bottom: 120rpx;
  background: #9aefe4;
}

.brand-wrap {
  position: relative;
}

.brand {
  width: 160rpx;
  height: 160rpx;
  border-radius: 48rpx;
  background: linear-gradient(145deg, #ff8a75, #ff5d8f);
  color: #ffffff;
  font-size: 80rpx;
  font-weight: 800;
  text-align: center;
  line-height: 160rpx;
  box-shadow: 0 16rpx 32rpx rgba(255, 93, 143, 0.35);
}

.spark {
  position: absolute;
  right: -18rpx;
  top: -10rpx;
  font-size: 40rpx;
}

.name {
  margin-top: 40rpx;
  font-size: 48rpx;
  font-weight: 800;
  color: #2b3550;
}

.intro {
  margin: 16rpx 0 72rpx;
  text-align: center;
  max-width: 520rpx;
}

.btn {
  width: 100%;
}

.tip {
  margin-top: 28rpx;
  text-align: center;
}
</style>
