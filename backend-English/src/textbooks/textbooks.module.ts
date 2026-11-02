import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TextbooksController, UnitsController } from './textbooks.controller';
import { TextbooksService } from './textbooks.service';

@Module({
  imports: [AuthModule],
  controllers: [TextbooksController, UnitsController],
  providers: [TextbooksService],
})
export class TextbooksModule {}
