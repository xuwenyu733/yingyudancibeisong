import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { ParentUser } from '../domain/types';
import { TextbooksService } from './textbooks.service';

@Controller('textbooks')
@UseGuards(AuthGuard)
export class TextbooksController {
  constructor(private readonly textbooksService: TextbooksService) {}

  @Get()
  list(@CurrentUser() parent: ParentUser) {
    return this.textbooksService.list(parent);
  }
}

@Controller('units')
@UseGuards(AuthGuard)
export class UnitsController {
  constructor(private readonly textbooksService: TextbooksService) {}

  @Get(':id/words')
  words(@CurrentUser() parent: ParentUser, @Param('id') id: string) {
    return this.textbooksService.wordsOfUnit(parent, id);
  }
}
