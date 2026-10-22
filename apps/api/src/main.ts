import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { COOKIE_SESSAO, lerCookie, ServicoAuth } from "@sac-aisa/auth";
import { temPermissao } from "@sac-aisa/domain";
import { json, type NextFunction, type Request, type Response } from "express";
import { ModuloApp } from "./app.module";
import { origensPermitidas } from "./auth.guard";

async function iniciar() {
  const app = await NestFactory.create<NestExpressApplication>(ModuloApp);

  // Atrás do proxy do EasyPanel, o IP real vem no cabeçalho do proxy.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  // O arquivo de importação é grande. O limite maior vale só nesta rota e só depois
  // de conferir a sessão e a permissão: quem não é administrador nem chega a enviar o corpo.
  const auth = app.get(ServicoAuth);
  app.use(
    "/admin/importar",
    async (req: Request, res: Response, next: NextFunction) => {
      const usuario = await auth
        .validar(lerCookie(req.headers.cookie, COOKIE_SESSAO))
        .catch(() => null);
      if (!usuario) {
        res.status(401).json({ message: "Entre para continuar." });
        return;
      }
      if (!temPermissao(usuario.permissoes, "dados.importar")) {
        res.status(403).json({ message: "Sem permissão para esta ação." });
        return;
      }
      next();
    },
    json({ limit: "25mb" }),
  );

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
