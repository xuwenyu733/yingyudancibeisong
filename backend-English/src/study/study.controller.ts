import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { ParentUser } from '../domain/types';
import { SubmitSessionDto } from './dto/submit-session.dto';
import { StudyService } from './study.service';

@Controller()
@UseGuards(AuthGuard)
export class StudyController {
  constructor(private readonly studyService: StudyService) {}

  @Get('study/today')
  today(@CurrentUser() parent: ParentUser) {
    return this.studyService.today(parent);
  }

  @Get('study/review')
  review(@CurrentUser() parent: ParentUser) {
    return this.studyService.review(parent);
  }

  @Post('study/sessions')
  submit(@CurrentUser() parent: ParentUser, @Body() dto: SubmitSessionDto) {
    return this.studyService.submit(parent, dto);
  }

  @Get('wrong-words')
  wrongWords(@CurrentUser() parent: ParentUser) {
    return this.studyService.wrongWords(parent);
  }
}
