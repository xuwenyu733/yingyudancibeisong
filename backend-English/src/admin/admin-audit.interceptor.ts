import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { AdminUserRecord } from './admin.types';

@Injectable()
export class AdminAuditInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{
      method: string;
      originalUrl?: string;
      url: string;
      body?: Record<string, unknown>;
      params?: Record<string, string>;
      ip?: string;
      headers: { 'x-forwarded-for'?: string };
      admin?: AdminUserRecord;
    }>();

    const method = (req.method || 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return next.handle();
    }

    const path = req.originalUrl || req.url || '';
    if (path.includes('/admin/auth/login')) {
      return next.handle();
    }

    return next.handle().pipe(
      tap({
        next: () => {
          void this.write(req, method, path);
        },
      }),
    );
  }

  private async write(
    req: {
      body?: Record<string, unknown>;
      params?: Record<string, string>;
      ip?: string;
      headers: { 'x-forwarded-for'?: string };
      admin?: AdminUserRecord;
    },
    method: string,
    path: string,
  ) {
    try {
      const admin = req.admin;
      const action = this.guessAction(method, path);
      const detail = this.safeDetail(req.body, req.params);
      const ip =
        req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.ip ||
        '';
      await this.prisma.adminAuditLog.create({
        data: {
          id: randomUUID(),
          adminId: admin?.id ?? null,
          username: admin?.username ?? 'unknown',
          role: admin?.role ?? '',
          method,
          path: path.slice(0, 240),
          action,
          detail,
          ip: ip.slice(0, 64),
        },
      });
    } catch {
      // 审计失败不影响主流程
    }
  }

  private guessAction(method: string, path: string): string {
    if (path.includes('/wallets/') && path.includes('/credit')) return '调积分';
    if (path.includes('/admins')) {
      if (method === 'POST') return '创建管理员';
      if (method === 'PATCH') return '更新管理员';
      return '管理账号';
    }
    if (path.includes('/plans')) return '改套餐';
    if (path.includes('/shop')) return method === 'DELETE' ? '删商品' : '改商品';
    if (path.includes('/tasks')) return method === 'DELETE' ? '删任务' : '改任务';
    if (path.includes('/textbooks'))
      return method === 'DELETE' ? '删教材' : '改教材';
    if (path.includes('/units')) return method === 'DELETE' ? '删单元' : '改单元';
    if (path.includes('/words')) return method === 'DELETE' ? '删单词' : '改单词';
    return `${method} ${path}`;
  }

  private safeDetail(
    body?: Record<string, unknown>,
    params?: Record<string, string>,
  ): string {
    const clone: Record<string, unknown> = { ...(params || {}) };
    if (body) {
      for (const [key, value] of Object.entries(body)) {
        if (/password/i.test(key)) {
          clone[key] = '***';
          continue;
        }
        clone[key] = value;
      }
    }
    const text = JSON.stringify(clone);
    return text.length > 800 ? `${text.slice(0, 800)}…` : text;
  }
}
