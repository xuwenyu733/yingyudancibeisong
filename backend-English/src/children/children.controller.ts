import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { ParentUser } from '../domain/types';
import { ChildrenService } from './children.service';
import { CreateChildDto } from './dto/create-child.dto';
import { UpdateChildTextbookDto } from './dto/update-child-textbook.dto';

@Controller('children')
@UseGuards(AuthGuard)
export class ChildrenController {
  constructor(private readonly childrenService: ChildrenService) {}

  @Get()
  list(@CurrentUser() parent: ParentUser) {
    return this.childrenService.list(parent);
  }

  @Post()
  create(@CurrentUser() parent: ParentUser, @Body() dto: CreateChildDto) {
    return this.childrenService.create(parent, dto);
  }

  @Post(':id/current')
  select(@CurrentUser() parent: ParentUser, @Param('id') id: string) {
    return this.childrenService.select(parent, id);
  }

  @Post(':id/textbook')
  updateTextbook(
    @CurrentUser() parent: ParentUser,
    @Param('id') id: string,
    @Body() dto: UpdateChildTextbookDto,
  ) {
    return this.childrenService.updateTextbook(parent, id, dto.textbookId);
  }
}
