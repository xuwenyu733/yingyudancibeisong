<template>
  <view class="page">
    <view class="card top">
      <text class="muted">当前积分</text>
      <view class="points">{{ player.points }}</view>
    </view>

    <view class="tabs">
      <view
        v-for="tab in tabs"
        :key="tab.id"
        class="tab"
        :class="{ on: category === tab.id }"
        @click="category = tab.id"
      >
        {{ tab.label }}
      </view>
    </view>

    <view v-if="loading" class="card">商城加载中...</view>
    <view v-for="item in list" :key="item.id" class="card item">
      <view class="row">
        <view>
          <view class="name">{{ item.name }}</view>
          <text class="muted">{{ item.desc }}</text>
        </view>
        <view class="price">{{ item.price || "免费" }}</view>
      </view>
      <button
        class="btn"
        :disabled="buying || (item.owned && item.price > 0)"
        @click="buy(item)"
      >
        {{ buttonText(item) }}
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { CATEGORY_LABEL, type ShopCategory } from "../../data/catalog";
import type { ShopGoods } from "../../types/api";
import { usePlayerStore } from "../../stores/player";
import { ensureLogin } from "../../utils/auth";
import { errorMessage } from "../../utils/format";

const player = usePlayerStore();
const category = ref<ShopCategory>("furniture");
const loading = ref(false);
const buying = ref(false);
const tabs = (Object.keys(CATEGORY_LABEL) as ShopCategory[]).map((id) => ({
  id,
  label: CATEGORY_LABEL[id],
}));

const list = computed(() =>
  player.shopItems.filter((item) => item.category === category.value),
);

function buttonText(item: ShopGoods) {
  if (item.owned && item.price > 0) return "已拥有";
  if (item.category === "outfit" && item.price === 0) return "装备原色";
  return `兑换 · ${item.price}`;
}

async function buy(item: ShopGoods) {
  buying.value = true;
  try {
    const result = await player.redeem(item);
    uni.showToast({ title: result.message, icon: "none" });
  } finally {
    buying.value = false;
  }
}

onShow(() => {
  if (!ensureLogin()) return;
  player.hydrate();
  loading.value = true;
  player
    .refreshShop()
    .catch((error: unknown) => {
      uni.showToast({ title: errorMessage(error), icon: "none" });
    })
    .finally(() => {
      loading.value = false;
    });
});
</script>

<style scoped>
.top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.points {
  font-size: 40rpx;
  font-weight: 800;
  color: #ff6b6b;
}

.tabs {
  display: flex;
  gap: 12rpx;
  margin-bottom: 20rpx;
}

.tab {
  flex: 1;
  text-align: center;
  padding: 16rpx 0;
  border-radius: 999rpx;
  background: #fff0e8;
  color: #c96a5c;
  border: 1px solid #ffd4c8;
  font-size: 24rpx;
}

.tab.on {
  background: linear-gradient(135deg, #ff7a6b, #ff5d8f);
  color: #ffffff;
  border-color: transparent;
}

.item .row {
  display: flex;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 20rpx;
}

.name {
  font-size: 32rpx;
  font-weight: 700;
  margin-bottom: 6rpx;
}

.price {
  font-weight: 800;
  color: #ff6b6b;
  white-space: nowrap;
}

.muted {
  display: block;
}
</style>
