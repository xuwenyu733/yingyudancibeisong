import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async getBalance(childId: string): Promise<number> {
    const wallet = await this.ensureWallet(childId);
    return wallet.balance;
  }

  async ensureWallet(childId: string) {
    return this.prisma.wallet.upsert({
      where: { childId },
      create: { childId, balance: 0 },
      update: {},
    });
  }

  /**
   * 幂等入账：相同 eventId 只生效一次，返回最终余额与本次是否新入账。
   */
  async credit(params: {
    childId: string;
    eventId: string;
    amount: number;
    reason: string;
  }): Promise<{ balance: number; applied: boolean; delta: number }> {
    const amount = Math.floor(params.amount);
    if (amount <= 0) {
      const balance = await this.getBalance(params.childId);
      return { balance, applied: false, delta: 0 };
    }

    const existing = await this.prisma.walletLedger.findUnique({
      where: { eventId: params.eventId },
    });
    if (existing) {
      return {
        balance: existing.balanceAfter,
        applied: false,
        delta: existing.delta,
      };
    }

    return this.prisma.$transaction(async (tx) => {
      const dup = await tx.walletLedger.findUnique({
        where: { eventId: params.eventId },
      });
      if (dup) {
        return { balance: dup.balanceAfter, applied: false, delta: dup.delta };
      }

      const wallet = await tx.wallet.upsert({
        where: { childId: params.childId },
        create: { childId: params.childId, balance: 0 },
        update: {},
      });
      const balance = wallet.balance + amount;
      await tx.wallet.update({
        where: { childId: params.childId },
        data: { balance },
      });
      await tx.walletLedger.create({
        data: {
          id: randomUUID(),
          childId: params.childId,
          eventId: params.eventId,
          delta: amount,
          balanceAfter: balance,
          reason: params.reason,
        },
      });
      return { balance, applied: true, delta: amount };
    });
  }

  /**
   * 幂等扣款：余额不足抛错；相同 eventId 重复请求返回上次结果。
   */
  async debit(params: {
    childId: string;
    eventId: string;
    amount: number;
    reason: string;
  }): Promise<{ balance: number; applied: boolean; delta: number }> {
    const amount = Math.floor(params.amount);
    if (amount < 0) throw new BadRequestException('扣款金额无效');

    const existing = await this.prisma.walletLedger.findUnique({
      where: { eventId: params.eventId },
    });
    if (existing) {
      return {
        balance: existing.balanceAfter,
        applied: false,
        delta: existing.delta,
      };
    }

    if (amount === 0) {
      const balance = await this.getBalance(params.childId);
      return { balance, applied: false, delta: 0 };
    }

    return this.prisma.$transaction(async (tx) => {
      const dup = await tx.walletLedger.findUnique({
        where: { eventId: params.eventId },
      });
      if (dup) {
        return { balance: dup.balanceAfter, applied: false, delta: dup.delta };
      }

      const wallet = await tx.wallet.upsert({
        where: { childId: params.childId },
        create: { childId: params.childId, balance: 0 },
        update: {},
      });
      if (wallet.balance < amount) {
        throw new BadRequestException('积分不够啦，再去背几个词吧');
      }
      const balance = wallet.balance - amount;
      await tx.wallet.update({
        where: { childId: params.childId },
        data: { balance },
      });
      await tx.walletLedger.create({
        data: {
          id: randomUUID(),
          childId: params.childId,
          eventId: params.eventId,
          delta: -amount,
          balanceAfter: balance,
          reason: params.reason,
        },
      });
      return { balance, applied: true, delta: -amount };
    });
  }

  async listLedger(childId: string, take = 30) {
    const rows = await this.prisma.walletLedger.findMany({
      where: { childId },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return rows.map((row) => ({
      id: row.id,
      eventId: row.eventId,
      delta: row.delta,
      balanceAfter: row.balanceAfter,
      reason: row.reason,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async requireChild(childId: string) {
    const child = await this.prisma.child.findUnique({ where: { id: childId } });
    if (!child) throw new NotFoundException('孩子档案不存在');
    return child;
  }
}
