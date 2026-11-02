<script setup lang="ts">
import { onLaunch } from "@dcloudio/uni-app";
import { useSessionStore } from "./stores/session";
import { usePlayerStore } from "./stores/player";

onLaunch(() => {
  useSessionStore().hydrate();
  usePlayerStore().hydrate();
});
</script>

<style>
/* 中小学生向：糖果课堂色板（珊瑚粉 + 薄荷绿 + 晴空底） */
page {
  background: #eaf6ff;
  background-image: radial-gradient(
      circle at 12% 8%,
      rgba(255, 200, 87, 0.35) 0%,
      transparent 42%
    ),
    radial-gradient(
      circle at 92% 0%,
      rgba(255, 140, 140, 0.28) 0%,
      transparent 38%
    ),
    radial-gradient(
      circle at 80% 88%,
      rgba(46, 196, 182, 0.22) 0%,
      transparent 40%
    );
  color: #2b3550;
  font-size: 28rpx;
  font-family: "PingFang SC", "Hiragino Sans GB", "Rounded Mplus 1c",
    "Nunito", "Helvetica Neue", sans-serif;
}

button {
  margin: 0;
  padding: 0;
  line-height: 1.4;
}

button::after {
  border: none;
}

.page {
  min-height: 100vh;
  padding: 28rpx 32rpx 56rpx;
  box-sizing: border-box;
}

.card {
  background: #ffffff;
  border-radius: 36rpx;
  padding: 32rpx;
  margin-bottom: 24rpx;
  border: 3rpx solid #ffe0d4;
  box-shadow: 0 12rpx 28rpx rgba(255, 120, 100, 0.08);
}

.kicker {
  color: #ff6b6b;
  font-size: 24rpx;
  font-weight: 700;
  letter-spacing: 1rpx;
}

.muted {
  color: #7a8499;
  font-size: 24rpx;
  line-height: 1.65;
}

.btn {
  background: linear-gradient(135deg, #ff7a6b 0%, #ff5d8f 100%);
  color: #ffffff;
  border-radius: 999rpx;
  height: 92rpx;
  line-height: 92rpx;
  font-size: 30rpx;
  font-weight: 700;
  box-shadow: 0 10rpx 20rpx rgba(255, 93, 143, 0.28);
}

.btn[disabled] {
  background: #ffc9c0;
  box-shadow: none;
  color: #ffffff;
}

.btn-line {
  margin-top: 20rpx;
  background: #ffffff;
  color: #ff6b6b;
  border: 3rpx solid #ffc9be;
  box-shadow: none;
}

.field {
  height: 88rpx;
  background: #fff4ef;
  border-radius: 24rpx;
  padding: 0 24rpx;
  font-size: 30rpx;
  margin-top: 16rpx;
  border: 2rpx solid #ffe0d4;
}
</style>
