import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EconomyModule } from '../economy/economy.module';
import { StudyController } from './study.controller';
import { StudyService } from './study.service';

@Module({
  imports: [AuthModule, EconomyModule],
  controllers: [StudyController],
  providers: [StudyService],
})
export class StudyModule {}
