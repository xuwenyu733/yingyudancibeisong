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

function resolveCorsOrigins(): string[] {
  const configured = process.env.CORS_ORIGINS?.trim();
  if (configured) {
    // 生产环境用逗号分隔的白名单，例如 https://www.example.com,https://admin.example.com
    return configured
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }
  return DEFAULT_CORS_ORIGINS;
}

async function bootstrap() {
  // 安全底线：密钥缺失或仍是公开弱值时直接拒绝启动
  validateEnv();

  // rawBody：微信支付回调验签需要原始报文
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix('api');
  app.enableCors({ origin: resolveCorsOrigins(), credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  await app.listen(process.env.PORT ?? 3010);
}

void bootstrap();
