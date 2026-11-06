import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ParentUser } from '../domain/types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ParentUser => {
    const request = ctx.switchToHttp().getRequest<{ user: ParentUser }>();
    return request.user;
  },
);
