import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { execSync } from 'child_process';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import { App } from 'supertest/types';

process.env.DATABASE_URL = 'file:./test.db';

import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  const dbPath = join(__dirname, '..', 'prisma', 'test.db');

  beforeAll(() => {
    if (existsSync(dbPath)) unlinkSync(dbPath);
    execSync('npx prisma db push --skip-generate', {
      cwd: join(__dirname, '..'),
      env: { ...process.env, DATABASE_URL: 'file:./test.db' },
      stdio: 'inherit',
    });
  });

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  it('/api/health (GET)', () => {
    return request(app.getHttpServer()).get('/api/health').expect(200).expect({
      ok: true,
      service: 'word-quest-server',
    });
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(() => {
    if (existsSync(dbPath)) unlinkSync(dbPath);
  });
});
