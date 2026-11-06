import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DataStore } from './data.store';

@Global()
@Module({
  providers: [PrismaService, DataStore],
  exports: [PrismaService, DataStore],
})
export class StoreModule {}
