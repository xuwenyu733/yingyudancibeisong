import { IsString } from 'class-validator';

export class UpdateChildTextbookDto {
  @IsString()
  textbookId!: string;
}
