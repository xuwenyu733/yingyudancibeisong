import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { ParentUser } from '../domain/types';
import { DataStore } from '../store/data.store';
import { authSecret } from '../common/env';

interface TokenPayload {
  sub: string;
  exp: number;
}

interface WechatSessionResponse {
  openid?: string;
  errcode?: number;
  errmsg?: string;
}

@Injectable()
export class AuthService {
  /** 密钥由启动校验 validateEnv 保证存在，不再有硬编码兜底 */
  private readonly secret = authSecret();

  constructor(private readonly store: DataStore) {}

  async loginByWechatCode(code: string) {
    const { openid, mode } = await this.resolveOpenid(code);
    let parent = await this.store.findParentByOpenid(openid);
    if (!parent) {
      parent = {
        id: randomUUID(),
        openid,
        nickname: '家长',
        currentChildId: null,
      };
      await this.store.saveParent(parent);
    }

    return {
      token: this.sign(parent.id),
      mode,
      user: this.toPublicUser(parent),
    };
  }

  async verify(token: string): Promise<ParentUser> {
    const userId = this.readUserId(token);
    const parent = await this.store.findParent(userId);
    if (!parent) {
      throw new UnauthorizedException('登录已失效，请重新登录');
    }
    return parent;
  }

  private async resolveOpenid(
    code: string,
  ): Promise<{ openid: string; mode: 'wechat' | 'dev' }> {
    const appId = process.env.WECHAT_APPID?.trim();
    const secret = process.env.WECHAT_SECRET?.trim();
    const forceDev =
      process.env.WECHAT_DEV_LOGIN === '1' ||
      !appId ||
      !secret ||
      code.startsWith('demo');

    if (forceDev) {
      return { openid: `dev_${code}`, mode: 'dev' };
    }

    const url =
      'https://api.weixin.qq.com/sns/jscode2session' +
      `?appid=${encodeURIComponent(appId)}` +
      `&secret=${encodeURIComponent(secret)}` +
      `&js_code=${encodeURIComponent(code)}` +
      '&grant_type=authorization_code';

    let data: WechatSessionResponse;
    try {
      const response = await fetch(url);
      data = (await response.json()) as WechatSessionResponse;
    } catch {
      throw new ServiceUnavailableException('微信登录暂时不可用');
    }

    if (!data.openid) {
      throw new UnauthorizedException(
        data.errmsg || '微信登录失败，请重试',
      );
    }

    return { openid: data.openid, mode: 'wechat' };
  }

  private sign(userId: string): string {
    const payload: TokenPayload = {
      sub: userId,
      exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
    };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', this.secret)
      .update(body)
      .digest('base64url');
    return `${body}.${signature}`;
  }

  private readUserId(token: string): string {
    const [body, signature] = token.split('.');
    if (!body || !signature) {
      throw new UnauthorizedException('请先登录');
    }

    const expected = createHmac('sha256', this.secret)
      .update(body)
      .digest('base64url');
    const left = Buffer.from(signature);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      throw new UnauthorizedException('请先登录');
    }

    const payload = JSON.parse(
      Buffer.from(body, 'base64url').toString(),
    ) as TokenPayload;
    if (!payload.sub || payload.exp < Date.now()) {
      throw new UnauthorizedException('登录已过期');
    }
    return payload.sub;
  }

  private toPublicUser(parent: ParentUser) {
    return {
      id: parent.id,
      nickname: parent.nickname,
      currentChildId: parent.currentChildId,
    };
  }
}
