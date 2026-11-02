import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from './wallet.service';

@Injectable()
export class ShopService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
  ) {}

  async listCatalog(childId: string) {
    const items = await this.prisma.shopItem.findMany({
      where: { active: true },
      orderBy: { price: 'asc' },
    });
    const owned = await this.prisma.inventoryItem.findMany({
      where: { childId },
    });
    const ownedSet = new Set(owned.map((row) => row.itemId));
    return {
      balance: await this.wallet.getBalance(childId),
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        price: item.price,
        desc: item.desc,
        roomAction: safeJson(item.roomAction),
        owned: ownedSet.has(item.id),
      })),
    };
  }

  async buy(childId: string, itemId: string) {
    const item = await this.prisma.shopItem.findUnique({ where: { id: itemId } });
    if (!item || !item.active) throw new NotFoundException('商品不存在');

    const existing = await this.prisma.inventoryItem.findUnique({
      where: { childId_itemId: { childId, itemId } },
    });
    if (existing && item.price > 0) {
      return {
        alreadyOwned: true,
        balance: await this.wallet.getBalance(childId),
        item: this.toPublicItem(item, true),
      };
    }

    const eventId = `buy:${childId}:${itemId}`;
    const paid = await this.wallet.debit({
      childId,
      eventId,
      amount: item.price,
      reason: `兑换 ${item.name}`,
    });

    const row = await this.prisma.inventoryItem.upsert({
      where: { childId_itemId: { childId, itemId } },
      create: {
        childId,
        itemId,
        equipped: item.category === 'outfit' && item.price === 0,
      },
      update: {},
    });

    if (item.category === 'outfit') {
      await this.equipOutfit(childId, itemId);
    }

    return {
      alreadyOwned: false,
      applied: paid.applied,
      balance: paid.balance,
      inventoryId: `${row.childId}:${row.itemId}`,
      item: this.toPublicItem(item, true),
    };
  }

  async listInventory(childId: string) {
    const rows = await this.prisma.inventoryItem.findMany({
      where: { childId },
      include: { item: true },
      orderBy: { createdAt: 'desc' },
    });
    return {
      balance: await this.wallet.getBalance(childId),
      items: rows.map((row) => ({
        ...this.toPublicItem(row.item, true),
        equipped: row.equipped,
        acquiredAt: row.createdAt.toISOString(),
      })),
    };
  }

  async equip(childId: string, itemId: string) {
    const row = await this.prisma.inventoryItem.findUnique({
      where: { childId_itemId: { childId, itemId } },
      include: { item: true },
    });
    if (!row) throw new BadRequestException('还没有这个物品，先去商城兑换吧');

    if (row.item.category === 'outfit') {
      await this.equipOutfit(childId, itemId);
    } else {
      await this.prisma.inventoryItem.update({
        where: { childId_itemId: { childId, itemId } },
        data: { equipped: true },
      });
    }

    return this.listInventory(childId);
  }

  private async equipOutfit(childId: string, itemId: string) {
    const outfits = await this.prisma.inventoryItem.findMany({
      where: { childId, item: { category: 'outfit' } },
      select: { itemId: true },
    });
    for (const outfit of outfits) {
      await this.prisma.inventoryItem.update({
        where: {
          childId_itemId: { childId, itemId: outfit.itemId },
        },
        data: { equipped: outfit.itemId === itemId },
      });
    }
  }

  private toPublicItem(
    item: {
      id: string;
      name: string;
      category: string;
      price: number;
      desc: string;
      roomAction: string;
    },
    owned: boolean,
  ) {
    return {
      id: item.id,
      name: item.name,
      category: item.category,
      price: item.price,
      desc: item.desc,
      roomAction: safeJson(item.roomAction),
      owned,
    };
  }
}

function safeJson(raw: string) {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}
