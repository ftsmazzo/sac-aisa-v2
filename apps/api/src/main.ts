import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { COOKIE_SESSAO, lerCookie, ServicoAuth } from "@sac-aisa/auth";
import { temPermissao } from "@sac-aisa/domain";
import {
  json,
  type NextFunction,
  type Request,
  type Response,
  urlencoded,
} from "express";
import { ModuloApp } from "./app.module";
import { origensPermitidas } from "./auth.guard";
import { manipuladorSimulado, ServicoCanais } from "./canais.controller";
import { vigiarErros } from "./erros";

async function iniciar() {
  await vigiarErros(process.env.SENTRY_DSN);
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

  // O webhook do ClickUp é assinado sobre o corpo cru: guarda os bytes antes de qualquer leitura.
  app.use(
    "/webhooks/clickup",
    json({
      limit: "200kb",
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
      },
    }),
  );

  // Avisos dos canais: o Mercado Livre e a Shopee assinam o corpo cru.
  for (const rota of ["/webhooks/mercadolivre", "/webhooks/shopee"]) {
    app.use(
      rota,
      json({
        limit: "200kb",
        verify: (req, _res, buf) => {
          (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
        },
      }),
    );
  }

  // Cola da planilha de vendas: o corpo só é lido depois da sessão.
  // Gestor e administrador. O responsável de setor vê o coeficiente, não grava venda.
  app.use("/relatorios", (req: Request, res: Response, next: NextFunction) => {
    const caminho = req.path;
    const cola =
      req.method === "POST" &&
      (caminho === "/vendas" ||
        caminho === "/vendas/previa" ||
        caminho.endsWith("/relatorios/vendas") ||
        caminho.endsWith("/relatorios/vendas/previa"));
    if (!cola) {
      next();
      return;
    }
    void (async () => {
      const usuario = await auth
        .validar(lerCookie(req.headers.cookie, COOKIE_SESSAO))
        .catch(() => null);
      if (!usuario) {
        res.status(401).json({ message: "Entre para continuar." });
        return;
      }
      if (
        !temPermissao(usuario.permissoes, "relatorios.ver") ||
        (usuario.perfil !== "administrador" && usuario.perfil !== "gestor")
      ) {
        res.status(403).json({ message: "Sem permissão para esta ação." });
        return;
      }
      json({ limit: "2mb" })(req, res, next);
    })();
  });

  // Foto da ficha: o corpo só é lido depois da sessão e da permissão.
  app.use("/reclamacoes", (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "POST" || !req.path.endsWith("/fotos")) {
      next();
      return;
    }
    void (async () => {
      const usuario = await auth
        .validar(lerCookie(req.headers.cookie, COOKIE_SESSAO))
        .catch(() => null);
      if (!usuario) {
        res.status(401).json({ message: "Entre para continuar." });
        return;
      }
      if (!temPermissao(usuario.permissoes, "reclamacoes.editar")) {
        res.status(403).json({ message: "Sem permissão para esta ação." });
        return;
      }
      json({ limit: "8mb" })(req, res, next);
    })();
  });

  // Marketplace simulado (só responde com o modo ligado). Aceita o formulário do OAuth do Mercado Livre.
  app.use(
    "/simulado",
    urlencoded({ extended: false, limit: "100kb" }),
    json({ limit: "100kb" }),
    manipuladorSimulado(app.get(ServicoCanais)),
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
