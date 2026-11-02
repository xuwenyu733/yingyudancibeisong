import { IsIn, IsString } from 'class-validator';

export class CreateOrderDto {
  @IsString()
  @IsIn(['month', 'term'])
  planId!: 'month' | 'term';
}
