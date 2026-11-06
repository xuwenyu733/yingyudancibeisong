<template>
  <view class="mascot-place" :class="[size, { round }]" :style="boxStyle">
    <text class="face" :style="faceStyle">🦊</text>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    size?: "sm" | "md" | "lg";
    round?: boolean;
    width?: string;
    height?: string;
  }>(),
  {
    size: "md",
    round: false,
    width: "",
    height: "",
  },
);

const boxStyle = computed(() => ({
  width: props.width || undefined,
  height: props.height || props.width || undefined,
}));

const faceStyle = computed(() => {
  if (!props.width) return undefined;
  const num = Number.parseInt(props.width, 10);
  if (!Number.isFinite(num) || num <= 0) return undefined;
  return { fontSize: `${Math.max(18, Math.round(num * 0.45))}rpx` };
});
</script>

<style scoped>
.mascot-place {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 36rpx;
  background:
    radial-gradient(circle at 30% 28%, #ffe8c2 0%, transparent 42%),
    linear-gradient(160deg, #fff4df 0%, #dff4ea 55%, #e8f7f0 100%);
  overflow: hidden;
  flex-shrink: 0;
  box-sizing: border-box;
}

.mascot-place.round {
  border-radius: 50%;
}

.face {
  line-height: 1;
}

.sm {
  width: 72rpx;
  height: 72rpx;
}

.sm .face {
  font-size: 36rpx;
}

.md {
  width: 140rpx;
  height: 140rpx;
}

.md .face {
  font-size: 64rpx;
}

.lg {
  width: 220rpx;
  height: 220rpx;
}

.lg .face {
  font-size: 96rpx;
}
</style>
