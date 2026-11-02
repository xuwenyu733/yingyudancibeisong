<template>
  <view class="page">
    <view class="card top">
      <text class="muted">背包 · 积分 {{ player.points }}</text>
    </view>

    <view v-if="loading" class="card">加载中...</view>
    <view v-else-if="!player.ownedItems.length" class="card">
      <text class="muted">背包是空的，去商城兑换家具或外观吧。</text>
      <button class="btn" @click="goShop">去商城</button>
    </view>

    <view v-for="item in player.ownedItems" :key="item.id" class="card">
      <view class="name">{{ item.name }}</view>
      <text class="muted"
        >{{ CATEGORY_LABEL[item.category as keyof typeof CATEGORY_LABEL] || item.category }}
        · {{ item.desc }}</text
      >
      <view class="actions">
        <button
          v-if="item.category === 'outfit'"
          class="btn"
          :disabled="item.equipped"
          @click="wear(item.id)"
        >
          {{ item.equipped ? "穿戴中" : "穿戴" }}
        </button>
        <button v-else class="btn btn-line" @click="apply(item.id)">
          {{ item.equipped ? "已标记应用" : "应用到房间" }}
        </button>
      </view>
    </view>

    <button class="btn" @click="goRoom">进入房间查看效果</button>
  </view>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { CATEGORY_LABEL } from "../../data/catalog";
import { usePlayerStore } from "../../stores/player";
import { ensureLogin } from "../../utils/auth";
import { errorMessage } from "../../utils/format";

const player = usePlayerStore();
const loading = ref(false);

async function wear(id: string) {
  const result = await player.equipOutfit(id);
  uni.showToast({ title: result.message, icon: "none" });
}

async function apply(id: string) {
  const result = await player.applyOwnedDecor(id);
  uni.showToast({ title: result.message, icon: "none" });
}

function goRoom() {
  uni.navigateTo({ url: "/pages/room/index" });
}

function goShop() {
  uni.navigateTo({ url: "/pages/shop/index" });
}

onShow(() => {
  if (!ensureLogin()) return;
  player.hydrate();
  loading.value = true;
  player
    .refreshInventory()
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
  margin-bottom: 8rpx;
}

.name {
  font-size: 32rpx;
  font-weight: 700;
  margin-bottom: 8rpx;
}

.muted {
  display: block;
}

.actions {
  margin-top: 20rpx;
}

.btn {
  margin-top: 24rpx;
}
</style>
