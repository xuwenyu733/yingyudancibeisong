import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createDecipheriv, createSign, randomBytes, verify } from 'crypto';
import { readFileSync } from 'fs';

export interface JsapiPayParams {
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: 'RSA';
  paySign: string;
  appId: string;
}

@Injectable()
export class WechatPayService {
  private readonly logger = new Logger(WechatPayService.name);

  isConfigured(): boolean {
    return Boolean(
      this.appId &&
        this.mchId &&
        this.serialNo &&
        this.apiV3Key &&
        this.privateKeyPem &&
        this.notifyUrl,
    );
  }

  get appId() {
    return process.env.WECHAT_APPID?.trim() || '';
  }

  get mchId() {
    return process.env.WECHAT_MCH_ID?.trim() || '';
  }

  get serialNo() {
    return process.env.WECHAT_MCH_SERIAL_NO?.trim() || '';
  }

  get apiV3Key() {
    return process.env.WECHAT_API_V3_KEY?.trim() || '';
  }

  get notifyUrl() {
    return process.env.WECHAT_PAY_NOTIFY_URL?.trim() || '';
  }

  get privateKeyPem() {
    const inline = process.env.WECHAT_MCH_PRIVATE_KEY?.replace(/\\n/g, '\n');
    if (inline?.includes('BEGIN')) return inline;
    const path = process.env.WECHAT_MCH_PRIVATE_KEY_PATH?.trim();
    if (!path) return '';
    try {
      return readFileSync(path, 'utf8');
    } catch (error) {
      this.logger.warn(`无法读取商户私钥: ${String(error)}`);
      return '';
    }
  }

  get platformPublicKey() {
    const inline = process.env.WECHAT_PLATFORM_PUBLIC_KEY?.replace(/\\n/g, '\n');
    if (inline?.includes('BEGIN')) return inline;
    const path = process.env.WECHAT_PLATFORM_PUBLIC_KEY_PATH?.trim();
    if (!path) return '';
    try {
      return readFileSync(path, 'utf8');
    } catch {
      return '';
    }
  }

  /** JSAPI 预下单，返回小程序/APP 调起参数 */
  async createJsapiPrepay(input: {
    outTradeNo: string;
    description: string;
    amountFen: number;
    openid: string;
  }): Promise<{ prepayId: string; payParams: JsapiPayParams }> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('微信支付未配置完整');
    }
    if (!input.openid || input.openid.startsWith('dev-')) {
      throw new ServiceUnavailableException(
        '当前账号没有真实微信 openid，无法 JSAPI 支付（开发登录请用 mock）',
      );
    }

    const body = {
      appid: this.appId,
      mchid: this.mchId,
      description: input.description.slice(0, 127),
      out_trade_no: input.outTradeNo,
      notify_url: this.notifyUrl,
      amount: { total: input.amountFen, currency: 'CNY' },
      payer: { openid: input.openid },
    };

    const data = await this.requestJson<{ prepay_id: string }>(
      'POST',
      '/v3/pay/transactions/jsapi',
      body,
    );
    if (!data.prepay_id) {
      throw new ServiceUnavailableException('微信未返回 prepay_id');
    }

    const payParams = this.buildJsapiPayParams(data.prepay_id);
    return { prepayId: data.prepay_id, payParams };
  }

  buildJsapiPayParams(prepayId: string): JsapiPayParams {
    const timeStamp = `${Math.floor(Date.now() / 1000)}`;
    const nonceStr = randomBytes(16).toString('hex');
    const pkg = `prepay_id=${prepayId}`;
    const message = `${this.appId}\n${timeStamp}\n${nonceStr}\n${pkg}\n`;
    const paySign = this.signMessage(message);
    return {
      appId: this.appId,
      timeStamp,
      nonceStr,
      package: pkg,
      signType: 'RSA',
      paySign,
    };
  }

  async queryByOutTradeNo(outTradeNo: string) {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('微信支付未配置完整');
    }
    return this.requestJson<{
      trade_state?: string;
      transaction_id?: string;
      out_trade_no?: string;
      amount?: { total?: number };
    }>(
      'GET',
      `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}?mchid=${encodeURIComponent(this.mchId)}`,
    );
  }

  /**
   * 校验回调签名。未配置平台公钥时：
   * - 仅允许 WECHAT_PAY_SKIP_NOTIFY_VERIFY=1（开发）
   */
  verifyNotifySignature(headers: Record<string, string | string[] | undefined>, rawBody: string) {
    const timestamp = header(headers, 'wechatpay-timestamp');
    const nonce = header(headers, 'wechatpay-nonce');
    const signature = header(headers, 'wechatpay-signature');
    if (!timestamp || !nonce || !signature) {
      return false;
    }
    const message = `${timestamp}\n${nonce}\n${rawBody}\n`;
    const pub = this.platformPublicKey;
    if (!pub) {
      if (process.env.WECHAT_PAY_SKIP_NOTIFY_VERIFY === '1') {
        this.logger.warn('已跳过微信回调验签（仅开发）');
        return true;
      }
      this.logger.error('缺少 WECHAT_PLATFORM_PUBLIC_KEY，拒绝回调');
      return false;
    }
    return verify(
      'RSA-SHA256',
      Buffer.from(message),
      pub,
      Buffer.from(signature, 'base64'),
    );
  }

  decryptNotifyResource(resource: {
    ciphertext: string;
    associated_data?: string;
    nonce: string;
  }) {
    const key = Buffer.from(this.apiV3Key);
    if (key.length !== 32) {
      throw new ServiceUnavailableException('WECHAT_API_V3_KEY 必须是 32 字节');
    }
    const buf = Buffer.from(resource.ciphertext, 'base64');
    const authTag = buf.subarray(buf.length - 16);
    const data = buf.subarray(0, buf.length - 16);
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(resource.nonce),
    );
    if (resource.associated_data) {
      decipher.setAAD(Buffer.from(resource.associated_data));
    }
    decipher.setAuthTag(authTag);
    const decoded = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(decoded.toString('utf8')) as {
      out_trade_no: string;
      transaction_id: string;
      trade_state: string;
      amount?: { total?: number };
    };
  }

  private async requestJson<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `https://api.mch.weixin.qq.com${path}`;
    const bodyText = body ? JSON.stringify(body) : '';
    const authorization = this.buildAuthorization(method, path, bodyText);
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: authorization,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'word-quest-english/1.0',
      },
      body: method === 'POST' ? bodyText : undefined,
    });
    const text = await response.text();
    if (!response.ok) {
      this.logger.error(`微信接口失败 ${method} ${path}: ${text}`);
      throw new ServiceUnavailableException(
        `微信支付接口错误 ${response.status}`,
      );
    }
    return text ? (JSON.parse(text) as T) : ({} as T);
  }

  private buildAuthorization(method: string, path: string, body: string) {
    const timestamp = `${Math.floor(Date.now() / 1000)}`;
    const nonce = randomBytes(16).toString('hex');
    const message = `${method}\n${path}\n${timestamp}\n${nonce}\n${body}\n`;
    const signature = this.signMessage(message);
    return `WECHATPAY2-SHA256-RSA2048 mchid="${this.mchId}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${this.serialNo}"`;
  }

  private signMessage(message: string) {
    const signer = createSign('RSA-SHA256');
    signer.update(message);
    signer.end();
    return signer.sign(this.privateKeyPem, 'base64');
  }
}

function header(
  headers: Record<string, string | string[] | undefined>,
  name: string,
) {
  const raw = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(raw) ? raw[0] : raw;
}
