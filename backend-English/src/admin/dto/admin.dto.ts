import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class AdminLoginDto {
  @IsString()
  @MinLength(2)
  username!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}

export class UpsertTextbookDto {
  @IsString()
  id!: string;

  @IsString()
  name!: string;

  @IsString()
  publisher!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  grade!: number;

  @IsString()
  volume!: string;
}

export class UpsertUnitDto {
  @IsString()
  id!: string;

  @IsString()
  textbookId!: string;

  @IsString()
  title!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  order!: number;

  @IsBoolean()
  free!: boolean;
}

export class UpsertWordDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  unitId!: string;

  @IsString()
  spelling!: string;

  @IsString()
  phonetic!: string;

  @IsString()
  meaning!: string;

  @IsString()
  example!: string;
}

export class UpsertShopItemDto {
  @IsString()
  id!: string;

  @IsString()
  name!: string;

  @IsString()
  category!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  price!: number;

  @IsString()
  desc!: string;

  @IsString()
  roomAction!: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpsertTaskDto {
  @IsString()
  id!: string;

  @IsString()
  key!: string;

  @IsString()
  title!: string;

  @IsString()
  desc!: string;

  @IsString()
  metric!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  target!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  reward!: number;

  @Type(() => Number)
  @IsInt()
  sort!: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpsertPlanDto {
  @IsString()
  planId!: string;

  @IsString()
  name!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  price!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  days!: number;

  @IsBoolean()
  highlight!: boolean;

  @IsString()
  desc!: string;
}

export class CreateAdminDto {
  @IsString()
  @MinLength(3)
  username!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsIn(['ADMIN', 'SUPER_ADMIN'])
  role!: 'ADMIN' | 'SUPER_ADMIN';
}

export class UpdateAdminDto {
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsIn(['ADMIN', 'SUPER_ADMIN'])
  role?: 'ADMIN' | 'SUPER_ADMIN';

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class WalletCreditDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount!: number;

  @IsString()
  reason!: string;

  @IsOptional()
  @IsString()
  eventId?: string;
}
