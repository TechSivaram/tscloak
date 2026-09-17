import {
  ValidationPipe,
} from '@nestjs/common';

import {
  NestFactory,
} from '@nestjs/core';

import {
  DocumentBuilder,
  SwaggerModule,
} from '@nestjs/swagger';

import { AppModule } from './app.module';
import { join } from 'path';
import * as express from 'express';

async function bootstrap() {
  const app =
    await NestFactory.create(
      AppModule,
    );

  // Product landing page
  app.use(
    '/',
    express.static(join(process.cwd(), 'public')),
  );

  /*
   * Multi-tenant client-admin portal: /client-admin/{clientId}/
   * Falls back here only when no static asset matched above.
   */
  app.use(
    '/client-admin/:clientId',
    (req, res) => {
      res.sendFile(
        join(process.cwd(), 'public', 'client-admin', 'index.html'),
      );
    },
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const swaggerConfig =
    new DocumentBuilder()
      .setTitle(
        'Standalone Identity Provider',
      )
      .setDescription(
        'Identity management APIs',
      )
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'Opaque',
        },
        'access-token',
      )
      .build();

  const document =
    SwaggerModule.createDocument(
      app,
      swaggerConfig,
    );

  document.security = [
    {
      'access-token': [],
    },
  ];

  SwaggerModule.setup(
    'docs',
    app,
    document,
  );

  await app.listen(
    process.env.PORT ?? 3000,
  );
}

bootstrap();