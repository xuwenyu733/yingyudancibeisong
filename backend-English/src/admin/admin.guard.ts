import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminAuthService } from './admin-auth.service';
import { AdminRole, AdminUserRecord } from './admin.types';

export const ROLES_KEY = 'admin_roles';
export const Roles = (...roles: AdminRole[]) => SetMetadata(ROLES_KEY, roles);

export const IS_PUBLIC_KEY = 'admin_public';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      admin?: AdminUserRecord;
    }>();
    const header = request.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw new UnauthorizedException('请先登录后台');
    request.admin = await this.auth.verify(token);

    const roles = this.reflector.getAllAndOverride<AdminRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles?.length && !roles.includes(request.admin.role)) {
      throw new ForbiddenException('权限不足');
    }
    return true;
  }
}
