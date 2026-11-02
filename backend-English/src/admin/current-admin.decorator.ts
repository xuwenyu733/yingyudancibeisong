import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AdminUserRecord } from './admin.types';

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AdminUserRecord => {
    const request = ctx.switchToHttp().getRequest<{ admin: AdminUserRecord }>();
    return request.admin;
  },
);
