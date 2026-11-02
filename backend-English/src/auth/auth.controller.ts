import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { WechatLoginDto } from './dto/wechat-login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('wechat')
  wechat(@Body() dto: WechatLoginDto) {
    return this.authService.loginByWechatCode(dto.code);
  }
}
