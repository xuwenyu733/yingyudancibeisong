<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { createOrder, fetchMembership, fetchPlans, mockPay } from '../api'
import type { MembershipStatus, Plan } from '../types/api'
import { errorMessage, yuan } from '../utils/format'

const plans = ref<Plan[]>([])
const status = ref<MembershipStatus | null>(null)
const buying = ref(false)
const message = ref('')
const errorText = ref('')

const statusText = computed(() => {
  if (!status.value?.active) return '当前是免费体验'
  const end = status.value.endAt ? status.value.endAt.slice(0, 10) : ''
  return `${status.value.planName} 生效中，至 ${end}`
})

async function load() {
  const [planResult, membership] = await Promise.all([fetchPlans(), fetchMembership()])
  plans.value = planResult.items
  status.value = membership
}

onMounted(() => {
  load().catch((error: unknown) => {
    errorText.value = errorMessage(error)
  })
})

async function buy(planId: string) {
  buying.value = true
  errorText.value = ''
  message.value = ''
  try {
    const order = await createOrder(planId)
    const canMock =
      order.allowMock === true ||
      order.payMode === 'mock' ||
      order.channel === 'mock' ||
      order.devPay === true
    if (!canMock) {
      errorText.value = '当前环境未开启模拟支付，请接入微信支付或联系开发配置'
      return
    }
    status.value = await mockPay(order.orderId)
    message.value = '开发环境已模拟支付成功，会员已开通，可直接测试完整词库。'
  } catch (error) {
    errorText.value = errorMessage(error)
  } finally {
    buying.value = false
  }
}
</script>

<template>
  <section class="page">
    <div class="card">
      <div class="kicker">家长付费 · 开发可直充</div>
      <h1>{{ statusText }}</h1>
      <p class="muted">
        开发阶段点下方开通，会立刻走模拟支付成功，不产生真实扣款，方便测试会员内容。
      </p>
      <p v-if="message" class="ok">{{ message }}</p>
      <p v-if="errorText" class="error">{{ errorText }}</p>
    </div>
    <article v-for="plan in plans" :key="plan.id" class="card" :class="{ hot: plan.highlight }">
      <div class="row">
        <div>
          <h2>{{ plan.name }}</h2>
          <p class="muted">{{ plan.desc }}</p>
        </div>
        <div class="price">{{ yuan(plan.price) }}</div>
      </div>
      <button class="btn" :disabled="buying" @click="buy(plan.id)">
        {{
          buying
            ? '开通中...'
            : plan.highlight
              ? '一键开通学期会员（模拟支付）'
              : '一键开通月会员（模拟支付）'
        }}
      </button>
    </article>
  </section>
</template>

<style scoped>
.hot {
  border: 1px solid #f5c16c;
}

.price {
  color: #d97706;
  font-size: 28px;
  font-weight: 750;
}

.ok {
  color: var(--brand-dark);
  font-weight: 700;
}

.error {
  color: #b91c1c;
}
</style>
