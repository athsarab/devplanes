import "reflect-metadata";
import * as express from "express";
import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/http-exception.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(express.json({
    verify: (request: express.Request & { rawBody?: Buffer }, _response, buffer) => {
      request.rawBody = buffer;
    },
  }));
  const config = app.get(ConfigService);

  app.setGlobalPrefix("api/v1");
  const corsOrigin = config
    .get<string>("CORS_ORIGIN", "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigin, credentials: true });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = config.get<number>("API_PORT", 3001);
  await app.listen(port);
  Logger.log(`DevScope API listening on http://localhost:${port}/api/v1`);
}

bootstrap();
