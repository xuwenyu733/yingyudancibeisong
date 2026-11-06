import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { validateEnv } from './common/env';

/** 本地开发默认放行的前端来源：H5/App、电脑端网页、运营后台三个 Vite 端口 */
const DEFAULT_CORS_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:5181',
  'http://127.0.0.1:5181',
];

const LAN_ORIGIN =
  /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/i;

function resolveCorsOrigin():
  | string[]
  | boolean
  | ((origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => void) {
  const configured = process.env.CORS_ORIGINS?.trim();
  if (configured === '*') return true;
  if (configured) {
    // 生产环境用逗号分隔的白名单，例如 https://www.example.com,https://admin.example.com
    return configured
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }
  // 开发：本机端口 + 局域网 IP（手机用电脑 IP 打开 H5 时需要）
  return (origin, cb) => {
    if (!origin || DEFAULT_CORS_ORIGINS.includes(origin) || LAN_ORIGIN.test(origin)) {
      cb(null, true);
      return;
    }
    cb(null, false);
  };
}

async function bootstrap() {
  // 安全底线：密钥缺失或仍是公开弱值时直接拒绝启动
  validateEnv();

  // rawBody：微信支付回调验签需要原始报文
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix('api');
  app.enableCors({ origin: resolveCorsOrigin(), credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  // 0.0.0.0：手机走局域网 IP 才能打到本机 API
  const port = Number(process.env.PORT ?? 3010);
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
