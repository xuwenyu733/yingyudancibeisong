import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { ParentUser } from '../domain/types';
import { EconomyService } from './economy.service';

@Controller('economy')
@UseGuards(AuthGuard)
export class EconomyController {
  constructor(private readonly economy: EconomyService) {}

  @Get('wallet')
  wallet(@CurrentUser() parent: ParentUser) {
    return this.economy.getWallet(parent);
  }

  @Get('shop')
  shop(@CurrentUser() parent: ParentUser) {
    return this.economy.catalog(parent);
  }

  @Post('shop/:itemId/buy')
  buy(@CurrentUser() parent: ParentUser, @Param('itemId') itemId: string) {
    return this.economy.buy(parent, itemId);
  }

  @Get('inventory')
  inventory(@CurrentUser() parent: ParentUser) {
    return this.economy.inventory(parent);
  }

  @Post('inventory/:itemId/equip')
  equip(@CurrentUser() parent: ParentUser, @Param('itemId') itemId: string) {
    return this.economy.equip(parent, itemId);
  }

  @Get('missions')
  missions(@CurrentUser() parent: ParentUser) {
    return this.economy.missionStatus(parent);
  }

  @Post('check-in')
  checkIn(@CurrentUser() parent: ParentUser) {
    return this.economy.checkIn(parent);
  }

  @Post('tasks/:taskId/claim')
  claimTask(
    @CurrentUser() parent: ParentUser,
    @Param('taskId') taskId: string,
  ) {
    return this.economy.claimTask(parent, taskId);
  }
}
