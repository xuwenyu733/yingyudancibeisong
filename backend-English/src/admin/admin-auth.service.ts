import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertLoginAllowed,
  clearLoginFailures,
  recordLoginFailure,
} from './admin-rate-limit';
import { AdminRole, AdminTokenPayload, AdminUserRecord } from './admin.types';
import { verifyPassword } from './password';

@Injectable()
export class AdminAuthService {
  private readonly secret =
    process.env.ADMIN_AUTH_SECRET ??
    `${process.env.AUTH_SECRET ?? 'dev-word-quest-secret'}:admin`;

  constructor(private readonly prisma: PrismaService) {}

  async login(username: string, password: string) {
    const name = username.trim();
    try {
      assertLoginAllowed(name);
    } catch (e) {
      throw new HttpException(
        e instanceof Error ? e.message : '尝试过多，请稍后再试',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.prisma.adminUser.findUnique({
      where: { username: name },
    });
    if (!user || !user.enabled) {
      recordLoginFailure(name);
      throw new UnauthorizedException('账号或密码错误');
    }
    if (!verifyPassword(password, user.passwordHash)) {
      recordLoginFailure(name);
      throw new UnauthorizedException('账号或密码错误');
    }
    clearLoginFailures(name);
    return {
      token: this.sign(user.id, user.role as AdminRole),
      user: this.toPublic(user),
    };
  }

  async verify(token: string) {
    const payload = this.readPayload(token);
    const user = await this.prisma.adminUser.findUnique({
      where: { id: payload.sub },
    });
    if (!user || !user.enabled) {
      throw new UnauthorizedException('登录已失效');
    }
    return this.toPublic(user);
  }

  private sign(userId: string, role: AdminRole): string {
    const payload: AdminTokenPayload = {
      sub: userId,
      typ: 'admin',
      role,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', this.secret)
      .update(body)
      .digest('base64url');
    return `${body}.${signature}`;
  }

  private readPayload(token: string): AdminTokenPayload {
    const [body, signature] = token.split('.');
    if (!body || !signature) throw new UnauthorizedException('请先登录');
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
    ) as AdminTokenPayload;
    if (payload.typ !== 'admin' || !payload.sub || payload.exp < Date.now()) {
      throw new UnauthorizedException('登录已过期');
    }
    return payload;
  }

  toPublic(user: {
    id: string;
    username: string;
    role: string;
    enabled: boolean;
    createdAt: Date;
  }): AdminUserRecord {
    return {
      id: user.id,
      username: user.username,
      role: user.role as AdminRole,
      enabled: user.enabled,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
