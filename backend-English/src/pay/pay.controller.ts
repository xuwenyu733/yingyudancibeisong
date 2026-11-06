import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { MembershipService } from '../membership/membership.service';
import { WechatPayService } from './wechat-pay.service';

@Controller('pay')
export class PayController {
  constructor(
    private readonly wechatPay: WechatPayService,
    private readonly membership: MembershipService,
  ) {}

  /** 微信支付 V3 结果通知（无需登录） */
  @Post('wechat/notify')
  @HttpCode(200)
  async wechatNotify(
    @Req() req: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const raw =
      req.rawBody?.toString('utf8') ||
      (typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body ?? {}));

    if (!this.wechatPay.verifyNotifySignature(headers, raw)) {
      throw new BadRequestException({ code: 'FAIL', message: '签名校验失败' });
    }

    const payload = JSON.parse(raw) as {
      resource?: {
        ciphertext: string;
        associated_data?: string;
        nonce: string;
      };
    };
    if (!payload.resource) {
      throw new BadRequestException({ code: 'FAIL', message: '缺少 resource' });
    }

    const decrypted = this.wechatPay.decryptNotifyResource(payload.resource);
    if (decrypted.trade_state === 'SUCCESS') {
      await this.membership.fulfillWechatPayment({
        outTradeNo: decrypted.out_trade_no,
        transactionId: decrypted.transaction_id,
        amountFen: decrypted.amount?.total,
      });
    }

    return { code: 'SUCCESS', message: '成功' };
  }
}
