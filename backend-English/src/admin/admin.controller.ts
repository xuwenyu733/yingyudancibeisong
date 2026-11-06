import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AdminAuditInterceptor } from './admin-audit.interceptor';
import { AdminAuthService } from './admin-auth.service';
import { AdminGuard, Public, Roles } from './admin.guard';
import { AdminService } from './admin.service';
import { CurrentAdmin } from './current-admin.decorator';
import {
  AdminLoginDto,
  CreateAdminDto,
  UpdateAdminDto,
  UpsertPlanDto,
  UpsertShopItemDto,
  UpsertTaskDto,
  UpsertTextbookDto,
  UpsertUnitDto,
  UpsertWordDto,
  WalletCreditDto,
} from './dto/admin.dto';
import { AdminUserRecord } from './admin.types';

@Controller('admin')
@UseGuards(AdminGuard)
@UseInterceptors(AdminAuditInterceptor)
export class AdminController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly admin: AdminService,
  ) {}

  @Public()
  @Post('auth/login')
  login(@Body() dto: AdminLoginDto) {
    return this.auth.login(dto.username, dto.password);
  }

  @Get('me')
  me(@CurrentAdmin() admin: AdminUserRecord) {
    return admin;
  }

  @Get('dashboard')
  dashboard() {
    return this.admin.dashboard();
  }

  @Get('audits')
  @Roles('SUPER_ADMIN')
  audits(
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.admin.listAudits({
      q,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('textbooks')
  textbooks() {
    return this.admin.listTextbooks();
  }

  @Post('textbooks')
  upsertTextbook(@Body() dto: UpsertTextbookDto) {
    return this.admin.upsertTextbook(dto);
  }

  @Delete('textbooks/:id')
  deleteTextbook(@Param('id') id: string) {
    return this.admin.deleteTextbook(id);
  }

  @Get('units')
  units(@Query('textbookId') textbookId?: string) {
    return this.admin.listUnits(textbookId);
  }

  @Post('units')
  upsertUnit(@Body() dto: UpsertUnitDto) {
    return this.admin.upsertUnit(dto);
  }

  @Delete('units/:id')
  deleteUnit(@Param('id') id: string) {
    return this.admin.deleteUnit(id);
  }

  @Get('words')
  words(
    @Query('unitId') unitId?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.admin.listWords({
      unitId,
      q,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : 50,
    });
  }

  @Post('words')
  upsertWord(@Body() dto: UpsertWordDto) {
    return this.admin.upsertWord(dto);
  }

  @Delete('words/:id')
  deleteWord(@Param('id') id: string) {
    return this.admin.deleteWord(id);
  }

  @Get('parents')
  parents(
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.admin.listParents({
      q,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('children')
  children(
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.admin.listChildren({
      q,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('orders')
  orders(
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.admin.listOrders({
      q,
      status,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('shop')
  shop() {
    return this.admin.listShop();
  }

  @Post('shop')
  @Roles('SUPER_ADMIN')
  upsertShop(@Body() dto: UpsertShopItemDto) {
    return this.admin.upsertShop(dto);
  }

  @Delete('shop/:id')
  @Roles('SUPER_ADMIN')
  deleteShop(@Param('id') id: string) {
    return this.admin.deleteShop(id);
  }

  @Get('tasks')
  tasks() {
    return this.admin.listTasks();
  }

  @Post('tasks')
  @Roles('SUPER_ADMIN')
  upsertTask(@Body() dto: UpsertTaskDto) {
    return this.admin.upsertTask(dto);
  }

  @Delete('tasks/:id')
  @Roles('SUPER_ADMIN')
  deleteTask(@Param('id') id: string) {
    return this.admin.deleteTask(id);
  }

  @Get('plans')
  plans() {
    return this.admin.listPlans();
  }

  @Post('plans')
  @Roles('SUPER_ADMIN')
  upsertPlan(@Body() dto: UpsertPlanDto) {
    return this.admin.upsertPlan(dto);
  }

  @Get('admins')
  @Roles('SUPER_ADMIN')
  admins() {
    return this.admin.listAdmins();
  }

  @Post('admins')
  @Roles('SUPER_ADMIN')
  createAdmin(@Body() dto: CreateAdminDto) {
    return this.admin.createAdmin(dto);
  }

  @Patch('admins/:id')
  @Roles('SUPER_ADMIN')
  updateAdmin(
    @Param('id') id: string,
    @Body() dto: UpdateAdminDto,
    @CurrentAdmin() actor: AdminUserRecord,
  ) {
    return this.admin.updateAdmin(id, dto, actor);
  }

  @Post('wallets/:childId/credit')
  @Roles('SUPER_ADMIN')
  credit(
    @Param('childId') childId: string,
    @Body() dto: WalletCreditDto,
  ) {
    return this.admin.creditWallet(childId, dto);
  }
}
