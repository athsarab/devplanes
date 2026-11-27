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

  const port = Number(
    config.get<string>("PORT") ?? config.get<string>("API_PORT") ?? 3001,
  );
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT or API_PORT must be a valid TCP port");
  }

  await app.listen(port, "0.0.0.0");
  Logger.log(`DevScope API listening on 0.0.0.0:${port}/api/v1`);
}

bootstrap();
