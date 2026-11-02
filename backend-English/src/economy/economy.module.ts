import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EconomyController } from './economy.controller';
import { EconomyService } from './economy.service';
import { MissionService } from './mission.service';
import { ShopService } from './shop.service';
import { WalletService } from './wallet.service';

@Module({
  imports: [AuthModule],
  controllers: [EconomyController],
  providers: [EconomyService, WalletService, ShopService, MissionService],
  exports: [WalletService],
})
export class EconomyModule {}