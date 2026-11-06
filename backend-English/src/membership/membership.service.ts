import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';
import { OrderRecord, ParentUser } from '../domain/types';
import { WechatPayService } from '../pay/wechat-pay.service';
import { DataStore } from '../store/data.store';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class MembershipService {
  constructor(
    private readonly store: DataStore,
    private readonly wechatPay: WechatPayService,
  ) {}

  async plans() {
    const overrides = await this.store.listPlanOverrides();
    const map = new Map(overrides.map((item) => [item.planId, item]));
    const items = this.store.plans.map((plan) => {
      const over = map.get(plan.id);
      if (!over) return plan;
      return {
        id: over.planId,
        name: over.name,
        price: over.price,
        days: over.days,
        highlight: over.highlight,
        desc: over.desc,
      };
    });
    return { items };
  }

  async status(parent: ParentUser) {
    const membership = await this.store.getMembership(parent.id);
    const active = await this.store.isActiveMember(parent.id);
    const plan = membership
      ? this.store.plans.find((item) => item.id === membership.planId)
      : undefined;
    return {
      active,
      planId: active ? (membership?.planId ?? null) : null,
      planName: active ? (plan?.name ?? null) : null,
      endAt: active ? (membership?.endAt ?? null) : null,
      wechatPayReady: this.wechatPay.isConfigured(),
    };
  }

  async listOrders(parent: ParentUser) {
    const items = await this.store.listOrders(parent.id);
    return {
      items: items.map((order) => this.toPublicOrder(order)),
    };
  }

  async getOrder(parent: ParentUser, orderId: string) {
    const order = await this.requireOwnOrder(parent, orderId);
    return this.toPublicOrder(order);
  }

  async createOrder(parent: ParentUser, dto: CreateOrderDto) {
    const plan = this.store.plans.find((item) => item.id === dto.planId);
    if (!plan) throw new NotFoundException('套餐不存在');

    const outTradeNo = `WQ${Date.now()}${randomBytes(3).toString('hex')}`;
    const useWechat = this.wechatPay.isConfigured();

    const order: OrderRecord = {
      id: randomUUID(),
      parentId: parent.id,
      planId: plan.id,
      amount: plan.price,
      status: 'pending',
      outTradeNo,
      channel: useWechat ? 'wechat' : 'mock',
      prepayId: null,
      transactionId: null,
      paidAt: null,
      createdAt: new Date().toISOString(),
    };

    let payParams: Record<string, string> | null = null;
    if (useWechat) {
      try {
        const prepay = await this.wechatPay.createJsapiPrepay({
          outTradeNo,
          description: `单词闯关-${plan.name}`,
          amountFen: plan.price,
          openid: parent.openid,
        });
        order.prepayId = prepay.prepayId;
        payParams = prepay.payParams as unknown as Record<string, string>;
      } catch (error) {
        // 真实微信失败时仍落单，便于排查；客户端可走补单或改 mock（非生产）
        order.channel = 'mock';
        if (process.env.NODE_ENV === 'production') {
          throw error;
        }
      }
    }

    await this.store.saveOrder(order);

    return {
      orderId: order.id,
      outTradeNo: order.outTradeNo,
      amount: order.amount,
      planId: order.planId,
      status: order.status,
      channel: order.channel,
      payMode: order.channel === 'wechat' && payParams ? 'wechat' : 'mock',
      allowMock:
        order.channel === 'mock' || process.env.NODE_ENV !== 'production',
      payParams,
      wechatPayReady: this.wechatPay.isConfigured(),
    };
  }

  async mockPay(parent: ParentUser, orderId: string) {
    if (
      process.env.NODE_ENV === 'production' &&
      this.wechatPay.isConfigured()
    ) {
      throw new ForbiddenException('正式环境请走微信支付');
    }

    const order = await this.requireOwnOrder(parent, orderId);
    if (order.status === 'paid') return this.status(parent);

    await this.markPaid(order, {
      transactionId: `mock_${order.id.slice(0, 8)}`,
      channel: 'mock',
    });
    return this.status(parent);
  }

  /** 主动查单补单（用户支付后轮询） */
  async syncOrder(parent: ParentUser, orderId: string) {
    const order = await this.requireOwnOrder(parent, orderId);
    if (order.status === 'paid') {
      return { order: this.toPublicOrder(order), membership: await this.status(parent) };
    }
    if (!order.outTradeNo || order.channel !== 'wechat') {
      return { order: this.toPublicOrder(order), membership: await this.status(parent) };
    }
    if (!this.wechatPay.isConfigured()) {
      throw new BadRequestException('微信支付未配置，无法查单');
    }

    const remote = await this.wechatPay.queryByOutTradeNo(order.outTradeNo);
    if (remote.trade_state === 'SUCCESS') {
      await this.markPaid(order, {
        transactionId: remote.transaction_id || null,
        channel: 'wechat',
        amountFen: remote.amount?.total,
      });
      const fresh = await this.store.findOrder(order.id);
      return {
        order: this.toPublicOrder(fresh!),
        membership: await this.status(parent),
      };
    }
    return { order: this.toPublicOrder(order), membership: await this.status(parent) };
  }

  async fulfillWechatPayment(input: {
    outTradeNo: string;
    transactionId: string;
    amountFen?: number;
  }) {
    const order = await this.store.findOrderByOutTradeNo(input.outTradeNo);
    if (!order) throw new NotFoundException('订单不存在');
    if (order.status === 'paid') return;
    await this.markPaid(order, {
      transactionId: input.transactionId,
      channel: 'wechat',
      amountFen: input.amountFen,
    });
  }

  private async markPaid(
    order: OrderRecord,
    opts: {
      transactionId: string | null;
      channel: 'mock' | 'wechat';
      amountFen?: number;
    },
  ) {
    if (
      typeof opts.amountFen === 'number' &&
      opts.amountFen > 0 &&
      opts.amountFen !== order.amount
    ) {
      throw new BadRequestException('支付金额与订单不一致');
    }

    const plan = this.store.plans.find((item) => item.id === order.planId);
    if (!plan) throw new NotFoundException('套餐不存在');

    const now = new Date();
    const current = await this.store.getMembership(order.parentId);
    const base =
      current && new Date(current.endAt).getTime() > now.getTime()
        ? new Date(current.endAt)
        : now;
    const end = new Date(base.getTime() + plan.days * 24 * 60 * 60 * 1000);

    order.status = 'paid';
    order.channel = opts.channel;
    order.transactionId = opts.transactionId;
    order.paidAt = now.toISOString();
    await this.store.saveOrder(order);
    await this.store.setMembership({
      parentId: order.parentId,
      planId: plan.id,
      startAt: now.toISOString(),
      endAt: end.toISOString(),
    });
  }

  private async requireOwnOrder(parent: ParentUser, orderId: string) {
    const order = await this.store.findOrder(orderId);
    if (!order || order.parentId !== parent.id) {
      throw new NotFoundException('订单不存在');
    }
    return order;
  }

  private toPublicOrder(order: OrderRecord) {
    const plan = this.store.plans.find((item) => item.id === order.planId);
    return {
      id: order.id,
      planId: order.planId,
      planName: plan?.name ?? order.planId,
      amount: order.amount,
      status: order.status,
      channel: order.channel,
      outTradeNo: order.outTradeNo,
      paidAt: order.paidAt,
      createdAt: order.createdAt,
    };
  }
}
