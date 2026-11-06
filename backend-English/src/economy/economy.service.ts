import { BadRequestException, Injectable } from '@nestjs/common';
import { ParentUser } from '../domain/types';
import { DataStore } from '../store/data.store';
import { MissionService } from './mission.service';
import { ShopService } from './shop.service';
import { WalletService } from './wallet.service';

@Injectable()
export class EconomyService {
  constructor(
    private readonly store: DataStore,
    private readonly wallets: WalletService,
    private readonly shop: ShopService,
    private readonly missions: MissionService,
  ) {}

  async getWallet(parent: ParentUser) {
    const child = await this.requireChild(parent);
    return {
      childId: child.id,
      balance: await this.wallets.getBalance(child.id),
      ledger: await this.wallets.listLedger(child.id),
    };
  }

  async catalog(parent: ParentUser) {
    const child = await this.requireChild(parent);
    return this.shop.listCatalog(child.id);
  }

  async buy(parent: ParentUser, itemId: string) {
    const child = await this.requireChild(parent);
    return this.shop.buy(child.id, itemId);
  }

  async inventory(parent: ParentUser) {
    const child = await this.requireChild(parent);
    return this.shop.listInventory(child.id);
  }

  async equip(parent: ParentUser, itemId: string) {
    const child = await this.requireChild(parent);
    return this.shop.equip(child.id, itemId);
  }

  async missionStatus(parent: ParentUser) {
    const child = await this.requireChild(parent);
    return this.missions.status(child.id);
  }

  async checkIn(parent: ParentUser) {
    const child = await this.requireChild(parent);
    return this.missions.checkIn(child.id);
  }

  async claimTask(parent: ParentUser, taskId: string) {
    const child = await this.requireChild(parent);
    return this.missions.claimTask(child.id, taskId);
  }

  private async requireChild(parent: ParentUser) {
    if (!parent.currentChildId) {
      throw new BadRequestException('请先创建孩子档案');
    }
    const child = await this.store.findChild(parent.currentChildId);
    if (!child || child.parentId !== parent.id) {
      throw new BadRequestException('请先创建孩子档案');
    }
    return child;
  }
}
