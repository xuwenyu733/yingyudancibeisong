import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ParentUser } from '../domain/types';
import { AuthService } from './auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      user?: ParentUser;
    }>();
    const header = request.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    request.user = await this.authService.verify(token);
    return true;
  }
}
