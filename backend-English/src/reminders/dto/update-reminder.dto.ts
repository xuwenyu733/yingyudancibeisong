import { IsBoolean } from 'class-validator';

export class UpdateReminderDto {
  @IsBoolean()
  enabled!: boolean;
}
