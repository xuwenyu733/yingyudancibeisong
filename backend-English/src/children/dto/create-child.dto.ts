import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateChildDto {
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(12)
  nickname!: string;

  @IsInt()
  @Min(1)
  @Max(6)
  grade!: number;

  @IsOptional()
  @IsString()
  textbookId?: string;
}
