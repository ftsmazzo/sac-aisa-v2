import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { NextFunction, Request, Response } from "express";
import { ModuloApp } from "./app.module";
import { origensPermitidas } from "./auth.guard";

async function iniciar() {
  const app = await NestFactory.create<NestExpressApplication>(ModuloApp);

  // Atrás do proxy do EasyPanel, o IP real vem no cabeçalho do proxy.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.useBodyParser("json", { limit: "100kb" });

  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  app.enableCors({ origin: origensPermitidas(), credentials: true });

  const porta = Number(process.env.API_PORT ?? 3001);
  await app.listen(porta, "0.0.0.0");
}

iniciar();
