import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { shanghaiDate } from '../common/day';
import { ParentUser } from '../domain/types';
import { DataStore } from '../store/data.store';

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);
  private accessToken: string | null = null;
  private accessTokenExpireAt = 0;

  constructor(private readonly store: DataStore) {}

  async status(parent: ParentUser) {
    const setting = await this.store.getReminder(parent.id);
    const child = parent.currentChildId
      ? await this.store.findChild(parent.currentChildId)
      : undefined;
    const studiedToday =
      child && child.parentId === parent.id
        ? (await this.store.countToday(child.id)) > 0
        : false;

    return {
      enabled: setting?.enabled ?? false,
      accepted: setting?.accepted ?? false,
      studiedToday,
      lastSentAt: setting?.lastSentAt ?? null,
      lastSentDay: setting?.lastSentDay ?? null,
      childName: child?.nickname ?? null,
      templateConfigured: Boolean(process.env.WECHAT_SUBSCRIBE_TEMPLATE_ID),
      mode: this.sendMode(),
    };
  }

  async setEnabled(parent: ParentUser, enabled: boolean) {
    await this.store.upsertReminder(parent.id, { enabled });
    return this.status(parent);
  }

  async markAccepted(parent: ParentUser) {
    await this.store.upsertReminder(parent.id, {
      enabled: true,
      accepted: true,
      acceptedAt: new Date(),
    });
    return this.status(parent);
  }

  async mockSend(parent: ParentUser) {
    return this.sendForParent(parent, true);
  }

  async runDailyCheck() {
    const day = shanghaiDate();
    const settings = await this.store.listEnabledReminders();
    const results = [];

    for (const setting of settings) {
      const parent = await this.store.findParent(setting.parentId);
      if (!parent) continue;
      results.push(await this.sendForParent(parent, false, day));
    }

    return {
      day,
      checked: settings.length,
      results,
    };
  }

  private async sendForParent(
    parent: ParentUser,
    force: boolean,
    day = shanghaiDate(),
  ) {
    const setting = await this.store.getReminder(parent.id);
    if (!force && !setting?.enabled) {
      return this.logAndReturn(parent.id, day, 'skipped', '未开启提醒');
    }

    if (!force && setting?.lastSentDay === day) {
      return this.logAndReturn(parent.id, day, 'skipped', '今日已提醒过');
    }

    const child = parent.currentChildId
      ? await this.store.findChild(parent.currentChildId)
      : undefined;
    if (!child || child.parentId !== parent.id) {
      return this.logAndReturn(parent.id, day, 'skipped', '没有孩子档案');
    }

    const studiedToday = (await this.store.countToday(child.id)) > 0;
    if (!force && studiedToday) {
      return this.logAndReturn(parent.id, day, 'skipped', '今日已学习');
    }

    const title = `${child.nickname}今天还没背单词`;
    const tip = '打开小程序继续闯关打卡';
    const mode = this.sendMode();

    if (mode === 'wechat') {
      try {
        await this.sendWechatSubscribe(parent.openid, title, tip);
        await this.store.upsertReminder(parent.id, {
          lastSentAt: new Date(),
          lastSentDay: day,
          accepted: false,
        });
        return this.logAndReturn(parent.id, day, 'sent', '微信订阅消息已发送');
      } catch (error) {
        const reason =
          error instanceof Error ? error.message : '微信推送失败';
        this.logger.warn(reason);
        return this.logAndReturn(parent.id, day, 'failed', reason);
      }
    }

    await this.store.upsertReminder(parent.id, {
      lastSentAt: new Date(),
      lastSentDay: day,
    });
    this.logger.log(`[mock reminder] ${parent.id} ${title}`);
    return this.logAndReturn(
      parent.id,
      day,
      'mock',
      `${title}｜${tip}`,
    );
  }

  private sendMode(): 'wechat' | 'mock' {
    const appId = process.env.WECHAT_APPID?.trim();
    const secret = process.env.WECHAT_SECRET?.trim();
    const templateId = process.env.WECHAT_SUBSCRIBE_TEMPLATE_ID?.trim();
    if (appId && secret && templateId && process.env.WECHAT_DEV_LOGIN !== '1') {
      return 'wechat';
    }
    return 'mock';
  }

  private async sendWechatSubscribe(
    openid: string,
    title: string,
    tip: string,
  ) {
    if (openid.startsWith('dev_')) {
      throw new Error('开发 openid 无法发送真实订阅消息');
    }

    const templateId = process.env.WECHAT_SUBSCRIBE_TEMPLATE_ID!.trim();
    const token = await this.getAccessToken();
    const response = await fetch(
      `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          touser: openid,
          template_id: templateId,
          page: 'pages/home/index',
          data: {
            thing1: { value: title.slice(0, 20) },
            thing2: { value: tip.slice(0, 20) },
          },
        }),
      },
    );
    const data = (await response.json()) as {
      errcode?: number;
      errmsg?: string;
    };
    if (data.errcode) {
      throw new Error(data.errmsg || `微信错误码 ${data.errcode}`);
    }
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.accessTokenExpireAt) {
      return this.accessToken;
    }

    const appId = process.env.WECHAT_APPID!.trim();
    const secret = process.env.WECHAT_SECRET!.trim();
    const response = await fetch(
      'https://api.weixin.qq.com/cgi-bin/token' +
        `?grant_type=client_credential&appid=${encodeURIComponent(appId)}` +
        `&secret=${encodeURIComponent(secret)}`,
    );
    const data = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      errmsg?: string;
    };
    if (!data.access_token) {
      throw new Error(data.errmsg || '获取 access_token 失败');
    }
    this.accessToken = data.access_token;
    this.accessTokenExpireAt =
      Date.now() + Math.max(60, (data.expires_in ?? 7200) - 120) * 1000;
    return this.accessToken;
  }

  private async logAndReturn(
    parentId: string,
    day: string,
    status: string,
    reason: string,
  ) {
    await this.store.addReminderLog({
      id: randomUUID(),
      parentId,
      day,
      status,
      reason,
    });
    return { parentId, day, status, reason };
  }
}
