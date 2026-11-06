import { Module } from '@nestjs/common';
import { EconomyModule } from '../economy/economy.module';
import { AdminAuditInterceptor } from './admin-audit.interceptor';
import { AdminAuthService } from './admin-auth.service';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

@Module({
  imports: [EconomyModule],
  controllers: [AdminController],
  providers: [
    AdminAuthService,
    AdminService,
    AdminGuard,
    AdminAuditInterceptor,
  ],
  exports: [AdminAuthService],
})
export class AdminModule {}
