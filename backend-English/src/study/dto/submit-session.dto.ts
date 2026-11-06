import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class AnswerDto {
  @IsString()
  wordId!: string;

  /** 兼容旧客户端：无 rating 时用 correct 推导 */
  @IsOptional()
  @IsBoolean()
  correct?: boolean;

  /** 1 不认识 / 2 模糊 / 3 认识 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  rating?: 1 | 2 | 3;
}

export class SubmitSessionDto {
  @IsOptional()
  @IsString()
  unitId?: string;

  @IsOptional()
  @IsIn(['normal', 'review'])
  mode?: 'normal' | 'review';

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AnswerDto)
  answers!: AnswerDto[];
}
