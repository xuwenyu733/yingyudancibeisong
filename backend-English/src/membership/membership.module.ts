import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PayController } from '../pay/pay.controller';
import { WechatPayService } from '../pay/wechat-pay.service';
import { MembershipController } from './membership.controller';
import { MembershipService } from './membership.service';

@Module({
  imports: [AuthModule],
  controllers: [MembershipController, PayController],
  providers: [MembershipService, WechatPayService],
  exports: [MembershipService, WechatPayService],
})
export class MembershipModule {}
