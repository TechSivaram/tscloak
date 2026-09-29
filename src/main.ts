import { ValidationPipe } from '@nestjs/common';

import { NestFactory } from '@nestjs/core';

import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import * as express from 'express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Product landing page
  app.use('/', express.static(join(process.cwd(), 'public')));

  /*
   * Multi-tenant client-admin portal: /idp-client-admin/{clientId}/
   * Falls back here only when no static asset matched above.
   */
  app.use('/idp-client-admin/:clientId', (req, res) => {
    res.sendFile(
      join(process.cwd(), 'public', 'idp-client-admin', 'index.html'),
    );
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Standalone Identity Provider')
    .setDescription('Identity management APIs')
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

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  document.security = [
    {
      'access-token': [],
    },
  ];

  SwaggerModule.setup('docs', app, document);

  const httpAdapter = app.getHttpAdapter();
  const instance = httpAdapter.getInstance();

  console.log(
    instance._router?.stack
      ?.filter((layer: any) => layer.route)
      ?.map((layer: any) => ({
        path: layer.route.path,
        methods: layer.route.methods,
      })),
  );

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();
