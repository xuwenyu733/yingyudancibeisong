import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ChildrenModule } from './children/children.module';
import { MembershipModule } from './membership/membership.module';
import { RemindersModule } from './reminders/reminders.module';
import { ReportsModule } from './reports/reports.module';
import { StoreModule } from './store/store.module';
import { EconomyModule } from './economy/economy.module';
import { StudyModule } from './study/study.module';
import { TextbooksModule } from './textbooks/textbooks.module';

@Module({
  imports: [
    StoreModule,
    AuthModule,
    AdminModule,
    ChildrenModule,
    TextbooksModule,
    StudyModule,
    EconomyModule,
    MembershipModule,
    ReportsModule,
    RemindersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
