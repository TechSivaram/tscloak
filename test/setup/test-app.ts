import { INestApplication } from '@nestjs/common';

import { Test, TestingModule } from '@nestjs/testing';

import { App } from 'supertest/types';

import { AppModule } from '../../src/app.module';

export async function createTestApp(): Promise<INestApplication<App>> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();

  await app.init();

  return app;
}
