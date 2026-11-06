<template>
  <view class="page">
    <view class="card">
      <text class="kicker">家长付费</text>
      <view class="heading">{{ statusText }}</view>
      <text class="muted">{{ payHint }}</text>
    </view>

    <view v-for="plan in plans" :key="plan.id" class="card" :class="{ hot: plan.highlight }">
      <view class="plan-row">
        <view>
          <view class="plan-name">{{ plan.name }}</view>
          <text class="muted">{{ plan.desc }}</text>
        </view>
        <view class="price">{{ yuan(plan.price) }}</view>
      </view>
      <button class="btn action" :disabled="buying" @click="buy(plan.id)">
        {{ plan.highlight ? "开通学期会员" : "开通月会员" }}
      </button>
    </view>

    <view v-if="orders.length" class="card">
      <view class="heading">订单记录</view>
      <view v-for="order in orders" :key="order.id" class="order">
        <view class="order-row">
          <text class="spell">{{ order.planName }}</text>
          <text :class="order.status === 'paid' ? 'ok' : 'wait'">{{
            order.status === "paid" ? "已支付" : "待支付"
          }}</text>
        </view>
        <text class="muted"
          >{{ yuan(order.amount) }} · {{ order.channel }} ·
          {{ order.createdAt.slice(0, 16).replace("T", " ") }}</text
        >
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import {
  createOrder,
  fetchMembership,
  fetchOrders,
  fetchPlans,
  mockPay,
  syncOrder,
} from "../../api";
import type { MembershipOrder, MembershipStatus, Plan } from "../../types/api";
import { ensureLogin } from "../../utils/auth";
import { errorMessage, yuan } from "../../utils/format";

const plans = ref<Plan[]>([]);
const status = ref<MembershipStatus | null>(null);
const orders = ref<MembershipOrder[]>([]);
const buying = ref(false);
const wechatReady = ref(false);

const statusText = computed(() => {
  if (!status.value?.active) return "当前是免费体验";
  const end = status.value.endAt ? status.value.endAt.slice(0, 10) : "";
  return `${status.value.planName} 生效中，至 ${end}`;
});

const payHint = computed(() => {
  if (wechatReady.value) {
    return "已配置微信支付：微信内将调起真实支付；开发账号仍可模拟。";
  }
  return "尚未配置商户号：点开通会走开发模拟支付，不会真实扣款。";
});

async function load() {
  const [planResult, membership, orderResult] = await Promise.all([
    fetchPlans(),
    fetchMembership(),
    fetchOrders().catch(() => ({ items: [] as MembershipOrder[] })),
  ]);
  plans.value = planResult.items;
  status.value = membership;
  wechatReady.value = Boolean(
    (membership as MembershipStatus & { wechatPayReady?: boolean }).wechatPayReady,
  );
  orders.value = orderResult.items;
}

async function buy(planId: string) {
  buying.value = true;
  try {
    const order = await createOrder(planId);
    if (order.payMode === "wechat" && order.payParams) {
      await requestWechatPay(order.payParams);
      const synced = await syncOrder(order.orderId);
      status.value = synced.membership;
      if (synced.membership.active) {
        uni.showToast({ title: "开通成功", icon: "success" });
      } else {
        uni.showToast({ title: "支付结果确认中，稍后刷新", icon: "none" });
      }
    } else if (order.allowMock || order.devPay !== false) {
      status.value = await mockPay(order.orderId);
      uni.showToast({ title: "模拟开通成功", icon: "success" });
    } else {
      uni.showToast({ title: "请配置微信支付或使用开发环境", icon: "none" });
    }
    await load();
  } catch (error) {
    uni.showToast({ title: errorMessage(error), icon: "none" });
  } finally {
    buying.value = false;
  }
}

function requestWechatPay(payParams: {
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: string;
  paySign: string;
}) {
  return new Promise<void>((resolve, reject) => {
    // #ifdef MP-WEIXIN
    uni.requestPayment({
      provider: "wxpay",
      timeStamp: payParams.timeStamp,
      nonceStr: payParams.nonceStr,
      package: payParams.package,
      signType: payParams.signType as "RSA",
      paySign: payParams.paySign,
      success: () => resolve(),
      fail: (err) => reject(err),
    });
    // #endif
    // #ifndef MP-WEIXIN
    reject(new Error("请在微信小程序内完成支付；H5 请用模拟开通"));
    // #endif
  });
}

onShow(() => {
  if (!ensureLogin()) return;
  load().catch((error: unknown) => {
    uni.showToast({ title: errorMessage(error), icon: "none" });
  });
});
</script>

<style scoped>
.heading {
  margin: 8rpx 0 12rpx;
  font-size: 36rpx;
  font-weight: 800;
}

.hot {
  border: 3rpx solid #ffc857;
  background: linear-gradient(180deg, #fff9e8 0%, #ffffff 60%);
}

.plan-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.plan-name {
  font-size: 32rpx;
  font-weight: 700;
}

.price {
  color: #d97706;
  font-size: 40rpx;
  font-weight: 700;
}

.action {
  margin-top: 24rpx;
}

.order {
  padding: 16rpx 0;
  border-top: 1rpx solid #ffe8e0;
}

.order:first-of-type {
  border-top: none;
}

.order-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6rpx;
}

.spell {
  font-weight: 700;
}

.ok {
  color: #1aa894;
  font-weight: 700;
}

.wait {
  color: #c98500;
  font-weight: 700;
}

.muted {
  display: block;
}
</style>
