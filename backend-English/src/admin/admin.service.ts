import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PLANS } from '../data/seed';
import { WalletService } from '../economy/wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import { DataStore } from '../store/data.store';
import { AdminAuthService } from './admin-auth.service';
import {
  CreateAdminDto,
  UpdateAdminDto,
  UpsertPlanDto,
  UpsertShopItemDto,
  UpsertTaskDto,
  UpsertTextbookDto,
  UpsertUnitDto,
  UpsertWordDto,
  WalletCreditDto,
} from './dto/admin.dto';
import { hashPassword } from './password';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: DataStore,
    private readonly wallet: WalletService,
    private readonly adminAuth: AdminAuthService,
  ) {}

  async dashboard() {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - 6);

    const [
      parents,
      children,
      words,
      orders,
      paid,
      statusGroups,
      recentOrders,
      recentAudits,
    ] = await Promise.all([
      this.prisma.parent.count(),
      this.prisma.child.count(),
      this.prisma.word.count(),
      this.prisma.order.count(),
      this.prisma.order.count({ where: { status: 'paid' } }),
      this.prisma.order.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.order.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true, status: true, amount: true },
      }),
      this.prisma.adminAuditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
    ]);

    const orderByStatus = statusGroups.map((row) => ({
      status: row.status,
      count: row._count._all,
    }));

    const dayMap = new Map<string, { total: number; paid: number }>();
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      dayMap.set(key, { total: 0, paid: 0 });
    }
    for (const order of recentOrders) {
      const key = order.createdAt.toISOString().slice(0, 10);
      const bucket = dayMap.get(key);
      if (!bucket) continue;
      bucket.total += 1;
      if (order.status === 'paid') bucket.paid += 1;
    }
    const last7Days = [...dayMap.entries()].map(([day, value]) => ({
      day,
      total: value.total,
      paid: value.paid,
    }));

    return {
      parents,
      children,
      words,
      orders,
      paidOrders: paid,
      orderByStatus,
      last7Days,
      recentAudits: recentAudits.map((row) => ({
        id: row.id,
        username: row.username,
        action: row.action,
        path: row.path,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async listAudits(params: { q?: string; page?: number; pageSize?: number }) {
    const { page, pageSize, skip } = this.pageOf(params.page, params.pageSize);
    const q = params.q?.trim();
    const where = q
      ? {
          OR: [
            { username: { contains: q } },
            { action: { contains: q } },
            { path: { contains: q } },
            { detail: { contains: q } },
          ],
        }
      : undefined;
    const [total, rows] = await Promise.all([
      this.prisma.adminAuditLog.count({ where }),
      this.prisma.adminAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      items: rows.map((row) => ({
        id: row.id,
        adminId: row.adminId,
        username: row.username,
        role: row.role,
        method: row.method,
        path: row.path,
        action: row.action,
        detail: row.detail,
        ip: row.ip,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  // ---- catalog ----
  async listTextbooks() {
    return this.prisma.textbook.findMany({
      orderBy: [{ grade: 'asc' }, { volume: 'asc' }],
      include: { _count: { select: { units: true } } },
    });
  }

  async upsertTextbook(dto: UpsertTextbookDto) {
    return this.prisma.textbook.upsert({
      where: { id: dto.id },
      create: dto,
      update: {
        name: dto.name,
        publisher: dto.publisher,
        grade: dto.grade,
        volume: dto.volume,
      },
    });
  }

  async deleteTextbook(id: string) {
    const units = await this.prisma.unit.count({ where: { textbookId: id } });
    if (units > 0) {
      throw new BadRequestException(
        `该教材下还有 ${units} 个单元，请先删空单元后再删教材`,
      );
    }
    await this.prisma.textbook.delete({ where: { id } });
    return { ok: true };
  }

  async listUnits(textbookId?: string) {
    return this.prisma.unit.findMany({
      where: textbookId ? { textbookId } : undefined,
      orderBy: { order: 'asc' },
      include: { _count: { select: { words: true } } },
    });
  }

  async upsertUnit(dto: UpsertUnitDto) {
    return this.prisma.unit.upsert({
      where: { id: dto.id },
      create: dto,
      update: {
        textbookId: dto.textbookId,
        title: dto.title,
        order: dto.order,
        free: dto.free,
      },
    });
  }

  async deleteUnit(id: string) {
    const words = await this.prisma.word.count({ where: { unitId: id } });
    if (words > 0) {
      throw new BadRequestException(
        `该单元下还有 ${words} 个单词，请先删空单词后再删单元`,
      );
    }
    await this.prisma.unit.delete({ where: { id } });
    return { ok: true };
  }

  async listWords(params: {
    unitId?: string;
    q?: string;
    page?: number;
    pageSize?: number;
  }) {
    const { page, pageSize, skip } = this.pageOf(params.page, params.pageSize);
    const q = params.q?.trim();
    const where = {
      ...(params.unitId ? { unitId: params.unitId } : {}),
      ...(q
        ? {
            OR: [
              { spelling: { contains: q } },
              { meaning: { contains: q } },
              { phonetic: { contains: q } },
            ],
          }
        : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.word.count({ where }),
      this.prisma.word.findMany({
        where,
        orderBy: { id: 'asc' },
        skip,
        take: pageSize,
      }),
    ]);
    return { items, total, page, pageSize };
  }

  async upsertWord(dto: UpsertWordDto) {
    const id = dto.id || `${dto.unitId}-w${randomUUID().slice(0, 8)}`;
    return this.prisma.word.upsert({
      where: { id },
      create: {
        id,
        unitId: dto.unitId,
        spelling: dto.spelling,
        phonetic: dto.phonetic,
        meaning: dto.meaning,
        example: dto.example,
      },
      update: {
        unitId: dto.unitId,
        spelling: dto.spelling,
        phonetic: dto.phonetic,
        meaning: dto.meaning,
        example: dto.example,
      },
    });
  }

  async deleteWord(id: string) {
    const [wrong, reviews, attempts] = await Promise.all([
      this.prisma.wrongWord.count({ where: { wordId: id } }),
      this.prisma.reviewState.count({ where: { wordId: id } }),
      this.prisma.studyAttempt.count({ where: { wordId: id } }),
    ]);
    const related = wrong + reviews + attempts;
    if (related > 0) {
      throw new BadRequestException(
        `该单词已有 ${related} 条学习相关记录，暂不可删除`,
      );
    }
    await this.prisma.word.delete({ where: { id } });
    return { ok: true };
  }

  private pageOf(page?: number, pageSize?: number) {
    const p = Math.max(1, Number(page) || 1);
    const size = Math.min(100, Math.max(1, Number(pageSize) || 20));
    return { page: p, pageSize: size, skip: (p - 1) * size };
  }

  // ---- users / orders ----
  async listParents(params: { q?: string; page?: number; pageSize?: number }) {
    const { page, pageSize, skip } = this.pageOf(params.page, params.pageSize);
    const q = params.q?.trim();
    const where = q
      ? {
          OR: [
            { nickname: { contains: q } },
            { openid: { contains: q } },
            { id: { contains: q } },
          ],
        }
      : undefined;
    const [total, rows] = await Promise.all([
      this.prisma.parent.count({ where }),
      this.prisma.parent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          _count: { select: { children: true, orders: true } },
          membership: true,
        },
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      items: rows.map((row) => ({
        id: row.id,
        nickname: row.nickname,
        openid: row.openid,
        childrenCount: row._count.children,
        ordersCount: row._count.orders,
        memberUntil: row.membership?.endAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async listChildren(params: { q?: string; page?: number; pageSize?: number }) {
    const { page, pageSize, skip } = this.pageOf(params.page, params.pageSize);
    const q = params.q?.trim();
    const where = q
      ? {
          OR: [
            { nickname: { contains: q } },
            { id: { contains: q } },
            { parent: { nickname: { contains: q } } },
          ],
        }
      : undefined;
    const [total, rows] = await Promise.all([
      this.prisma.child.count({ where }),
      this.prisma.child.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          parent: { select: { nickname: true } },
          wallet: true,
          _count: { select: { attempts: true } },
        },
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      items: rows.map((row) => ({
        id: row.id,
        nickname: row.nickname,
        grade: row.grade,
        parentNickname: row.parent.nickname,
        balance: row.wallet?.balance ?? 0,
        attempts: row._count.attempts,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async listOrders(params: {
    q?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }) {
    const { page, pageSize, skip } = this.pageOf(params.page, params.pageSize);
    const q = params.q?.trim();
    const status = params.status?.trim();
    const where = {
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { planId: { contains: q } },
              { outTradeNo: { contains: q } },
              { id: { contains: q } },
              { parent: { nickname: { contains: q } } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: { parent: { select: { nickname: true } } },
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      items: rows.map((row) => ({
        id: row.id,
        parentNickname: row.parent.nickname,
        planId: row.planId,
        amount: row.amount,
        status: row.status,
        channel: row.channel,
        outTradeNo: row.outTradeNo,
        paidAt: row.paidAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  // ---- shop / tasks (write = super) ----
  async listShop() {
    return this.prisma.shopItem.findMany({ orderBy: { price: 'asc' } });
  }

  async upsertShop(dto: UpsertShopItemDto) {
    return this.prisma.shopItem.upsert({
      where: { id: dto.id },
      create: {
        id: dto.id,
        name: dto.name,
        category: dto.category,
        price: dto.price,
        desc: dto.desc,
        roomAction: dto.roomAction,
        active: dto.active ?? true,
      },
      update: {
        name: dto.name,
        category: dto.category,
        price: dto.price,
        desc: dto.desc,
        roomAction: dto.roomAction,
        active: dto.active ?? true,
      },
    });
  }

  async deleteShop(id: string) {
    await this.prisma.shopItem.delete({ where: { id } });
    return { ok: true };
  }

  async listTasks() {
    return this.prisma.dailyTaskDef.findMany({ orderBy: { sort: 'asc' } });
  }

  async upsertTask(dto: UpsertTaskDto) {
    return this.prisma.dailyTaskDef.upsert({
      where: { id: dto.id },
      create: {
        id: dto.id,
        key: dto.key,
        title: dto.title,
        desc: dto.desc,
        metric: dto.metric,
        target: dto.target,
        reward: dto.reward,
        sort: dto.sort,
        active: dto.active ?? true,
      },
      update: {
        key: dto.key,
        title: dto.title,
        desc: dto.desc,
        metric: dto.metric,
        target: dto.target,
        reward: dto.reward,
        sort: dto.sort,
        active: dto.active ?? true,
      },
    });
  }

  async deleteTask(id: string) {
    await this.prisma.dailyTaskDef.delete({ where: { id } });
    return { ok: true };
  }

  // ---- plans ----
  async listPlans() {
    const overrides = await this.prisma.planOverride.findMany();
    const map = new Map(overrides.map((item) => [item.planId, item]));
    return PLANS.map((plan) => {
      const over = map.get(plan.id);
      if (!over) return { ...plan, overridden: false };
      return {
        id: over.planId,
        name: over.name,
        price: over.price,
        days: over.days,
        highlight: over.highlight,
        desc: over.desc,
        overridden: true,
      };
    });
  }

  async upsertPlan(dto: UpsertPlanDto) {
    return this.prisma.planOverride.upsert({
      where: { planId: dto.planId },
      create: {
        planId: dto.planId,
        name: dto.name,
        price: dto.price,
        days: dto.days,
        highlight: dto.highlight,
        desc: dto.desc,
      },
      update: {
        name: dto.name,
        price: dto.price,
        days: dto.days,
        highlight: dto.highlight,
        desc: dto.desc,
      },
    });
  }

  // ---- admins ----
  async listAdmins() {
    const rows = await this.prisma.adminUser.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => this.adminAuth.toPublic(row));
  }

  async createAdmin(dto: CreateAdminDto) {
    const exists = await this.prisma.adminUser.findUnique({
      where: { username: dto.username },
    });
    if (exists) throw new BadRequestException('用户名已存在');
    const row = await this.prisma.adminUser.create({
      data: {
        id: randomUUID(),
        username: dto.username.trim(),
        passwordHash: hashPassword(dto.password),
        role: dto.role,
        enabled: true,
      },
    });
    return this.adminAuth.toPublic(row);
  }

  async updateAdmin(
    id: string,
    dto: UpdateAdminDto,
    actor: { id: string; role: string },
  ) {
    const row = await this.prisma.adminUser.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('管理员不存在');

    if (id === actor.id) {
      if (dto.enabled === false) {
        throw new BadRequestException('不能禁用自己的账号');
      }
      if (dto.role && dto.role !== row.role) {
        throw new BadRequestException('不能修改自己的角色');
      }
    }

    const nextRole = dto.role ?? row.role;
    const nextEnabled = dto.enabled ?? row.enabled;
    const demotingSuper =
      row.role === 'SUPER_ADMIN' &&
      (nextRole !== 'SUPER_ADMIN' || nextEnabled === false);
    if (demotingSuper) {
      const supers = await this.prisma.adminUser.count({
        where: { role: 'SUPER_ADMIN', enabled: true },
      });
      if (supers <= 1) {
        throw new BadRequestException('至少保留一名启用的超级管理员');
      }
    }

    const updated = await this.prisma.adminUser.update({
      where: { id },
      data: {
        role: nextRole,
        enabled: nextEnabled,
        passwordHash: dto.password
          ? hashPassword(dto.password)
          : row.passwordHash,
      },
    });
    return this.adminAuth.toPublic(updated);
  }

  async creditWallet(childId: string, dto: WalletCreditDto) {
    const child = await this.store.findChild(childId);
    if (!child) throw new NotFoundException('孩子不存在');
    const eventId =
      dto.eventId?.trim() || `admin-credit:${childId}:${randomUUID()}`;
    return this.wallet.credit({
      childId,
      eventId,
      amount: dto.amount,
      reason: dto.reason || '后台手动加积分',
    });
  }
}
