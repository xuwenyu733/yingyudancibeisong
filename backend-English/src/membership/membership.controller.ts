import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { ParentUser } from '../domain/types';
import { CreateOrderDto } from './dto/create-order.dto';
import { MembershipService } from './membership.service';

@Controller('membership')
export class MembershipController {
  constructor(private readonly membershipService: MembershipService) {}

  @Get('plans')
  plans() {
    return this.membershipService.plans();
  }

  @Get('status')
  @UseGuards(AuthGuard)
  status(@CurrentUser() parent: ParentUser) {
    return this.membershipService.status(parent);
  }

  @Get('orders')
  @UseGuards(AuthGuard)
  listOrders(@CurrentUser() parent: ParentUser) {
    return this.membershipService.listOrders(parent);
  }

  @Get('orders/:id')
  @UseGuards(AuthGuard)
  getOrder(@CurrentUser() parent: ParentUser, @Param('id') id: string) {
    return this.membershipService.getOrder(parent, id);
  }

  @Post('orders')
  @UseGuards(AuthGuard)
  createOrder(@CurrentUser() parent: ParentUser, @Body() dto: CreateOrderDto) {
    return this.membershipService.createOrder(parent, dto);
  }

  @Post('orders/:id/mock-pay')
  @UseGuards(AuthGuard)
  mockPay(@CurrentUser() parent: ParentUser, @Param('id') id: string) {
    return this.membershipService.mockPay(parent, id);
  }

  @Post('orders/:id/sync')
  @UseGuards(AuthGuard)
  sync(@CurrentUser() parent: ParentUser, @Param('id') id: string) {
    return this.membershipService.syncOrder(parent, id);
  }
}
