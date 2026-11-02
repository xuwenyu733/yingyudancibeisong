<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { createOrder, fetchMembership, fetchPlans, mockPay } from '../api'
import type { MembershipStatus, Plan } from '../types/api'
import { errorMessage, yuan } from '../utils/format'

const plans = ref<Plan[]>([])
const status = ref<MembershipStatus | null>(null)
const buying = ref(false)
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
  try {
    const order = await createOrder(planId)
    if (!order.devPay) {
      errorText.value = '请接入微信支付'
      return
    }
    status.value = await mockPay(order.orderId)
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
      <div class="kicker">家长付费</div>
      <h1>{{ statusText }}</h1>
      <p class="muted">开发环境点开通后会直接模拟支付成功，不会产生真实扣款。</p>
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
        {{ plan.highlight ? '开通学期会员' : '开通月会员' }}
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

.error {
  color: #b91c1c;
}
</style>
