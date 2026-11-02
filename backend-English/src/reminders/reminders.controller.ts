import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { ParentUser } from '../domain/types';
import { UpdateReminderDto } from './dto/update-reminder.dto';
import { RemindersService } from './reminders.service';

@Controller('reminders')
@UseGuards(AuthGuard)
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @Get('status')
  status(@CurrentUser() parent: ParentUser) {
    return this.remindersService.status(parent);
  }

  @Post('enabled')
  setEnabled(
    @CurrentUser() parent: ParentUser,
    @Body() dto: UpdateReminderDto,
  ) {
    return this.remindersService.setEnabled(parent, dto.enabled);
  }

  @Post('accept')
  accept(@CurrentUser() parent: ParentUser) {
    return this.remindersService.markAccepted(parent);
  }

  @Post('mock-send')
  mockSend(@CurrentUser() parent: ParentUser) {
    return this.remindersService.mockSend(parent);
  }

  @Post('run-check')
  runCheck() {
    return this.remindersService.runDailyCheck();
  }
}
