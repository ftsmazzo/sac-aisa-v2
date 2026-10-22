import type { IncomingMessage } from "node:http";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpException,
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
  Post,
  Put,
  Req,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import type { Request, Response } from "express";
import { type PedidoComUsuario, Publico } from "./auth.guard";
import {
  type ContextoCaptura,
  iniciarBuscaPeriodica,
  RepositorioCapturaSql,
  ServicoCaptura,
} from "./canal-captura";
import { CenariosSimulados, ehCenario } from "./canal-cenarios";
import {
  ArmazemCifrado,
  ArmazemMemoria,
  type ArmazemToken,
  BASE_REAL,
  type CanalReal,
  ClienteML,
  ClienteShopee,
  ErroCanal,
  type PersistenciaSegredos,
} from "./canal-clientes";
import {
  faltaParaFuncionar,
  RegistroChamadas,
  type SituacaoDoCanal,
} from "./canal-registro";
import { CREDENCIAIS_SIMULADAS, MarketplaceSimulado } from "./canal-simulado";
import { ServicoIntegracoes } from "./integracoes";
import { lerChave } from "./segredos";
import { transacaoPrisma } from "./treino";
import { exigirAdministrador, exigirGestao } from "./treino.controller";

const CHAVE_FLAG = "canal_simulado";
const CANAIS: readonly CanalReal[] = ["mercadolivre", "shopee"];

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** O endereço desta API, para o marketplace simulado ser consumido como um canal de verdade. */
function urlDestaApi(): string {
  return (
    process.env.API_SELF_URL ??
    `http://127.0.0.1:${process.env.API_PORT ?? 3001}`
  ).replace(/\/+$/, "");
}

export interface SituacaoSimulacao {
  ativo: boolean;
  forcadoPorAmbiente: boolean;
}

/**
 * Tudo que liga os canais: o marketplace simulado, o registro de chamadas, a captura e os cenários.
 * Um por processo. O simulado só responde com o modo ligado (tela de simulação) ou com
 * `CANAL_SIMULADO=1`; sem isso, a rota `/simulado` devolve 404 e nada é captado dele.
 */
@Injectable()
export class ServicoCanais implements OnModuleInit, OnModuleDestroy {
  readonly registro = new RegistroChamadas();
  readonly simulador = new MarketplaceSimulado({ latenciaMs: 60 });
  readonly captura: ServicoCaptura;
  readonly cenarios: CenariosSimulados;
  private readonly memoria = new ArmazemMemoria();
  private readonly clientes = new Map<string, ClienteML | ClienteShopee>();
  private parar: (() => void) | null = null;

  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(ServicoIntegracoes) private readonly integ: ServicoIntegracoes,
  ) {
    this.captura = new ServicoCaptura(
      () => this.contexto(),
      new RepositorioCapturaSql(transacaoPrisma(prisma)),
      this.registro,
    );
    this.cenarios = new CenariosSimulados(
      this.simulador,
      this.captura,
      () => this.contexto(),
      this.memoria,
      () => this.urlDoPush(),
      this.registro,
    );
  }

  onModuleInit() {
    const min = Number(process.env.CAPTURA_INTERVALO_MIN ?? 10);
    if (!(min > 0)) return;
    this.parar = iniciarBuscaPeriodica(this.captura, min * 60_000, (canal) =>
      this.buscaAtiva(canal),
    );
  }

  onModuleDestroy() {
    this.parar?.();
  }

  // ----- Marketplace simulado ligado ou desligado -----

  async situacao(): Promise<SituacaoSimulacao> {
    if (process.env.CANAL_SIMULADO === "1") {
      return { ativo: true, forcadoPorAmbiente: true };
    }
    const r = await this.prisma.config.findUnique({
      where: { chave: CHAVE_FLAG },
    });
    return { ativo: r?.valor === "1", forcadoPorAmbiente: false };
  }

  async definirAtivo(ativo: boolean): Promise<void> {
    await this.prisma.config.upsert({
      where: { chave: CHAVE_FLAG },
      create: { chave: CHAVE_FLAG, valor: ativo ? "1" : "0" },
      update: { valor: ativo ? "1" : "0" },
    });
  }

  private urlDoPush(): string {
    return process.env.SHOPEE_PUSH_URL ?? `${urlDestaApi()}/webhooks/shopee`;
  }

  // ----- Configuração -----

  private async configDo(canal: CanalReal) {
    const [cfg, ligado] = await Promise.all([
      this.integ.config(canal),
      this.situacao(),
    ]);
    const base = texto(cfg.baseUrl);
    // Simulado só se ligado e sem URL real configurada: trocar a URL é o que leva ao canal de verdade.
    const simulado = ligado.ativo && (!base || base.includes("/simulado"));
    return { cfg, simulado, base };
  }

  /** O contexto da captura, lido da configuração a cada uso: trocar a URL ou a credencial vale já. */
  async contexto(): Promise<ContextoCaptura> {
    const ml = await this.configDo("mercadolivre");
    const sp = await this.configDo("shopee");
    const simulado = { mercadolivre: ml.simulado, shopee: sp.simulado };

    const appId =
      texto(ml.cfg.appId) ||
      (ml.simulado ? CREDENCIAIS_SIMULADAS.mercadolivre.appId : "");
    const segredoML =
      (await this.integ.segredo("mercadolivre", "segredo")) ||
      (ml.simulado ? CREDENCIAIS_SIMULADAS.mercadolivre.segredo : "");
    const partnerId =
      texto(sp.cfg.partnerId) ||
      (sp.simulado ? String(CREDENCIAIS_SIMULADAS.shopee.partnerId) : "");
    const partnerKey =
      (await this.integ.segredo("shopee", "partnerKey")) ||
      (sp.simulado ? CREDENCIAIS_SIMULADAS.shopee.partnerKey : "");
    const shopId =
      texto(sp.cfg.shopId) ||
      (sp.simulado ? String(CREDENCIAIS_SIMULADAS.shopee.shopId) : "");

    const baseML =
      ml.base ||
      (ml.simulado ? `${urlDestaApi()}/simulado` : BASE_REAL.mercadolivre);
    const baseSP =
      sp.base || (sp.simulado ? `${urlDestaApi()}/simulado` : BASE_REAL.shopee);
    const redirect =
      texto(ml.cfg.urlRedirecionamento) || `${urlDestaApi()}/simulado/callback`;

    const doCache = (k: string, f: () => ClienteML | ClienteShopee) => {
      let c = this.clientes.get(k);
      if (!c) {
        c = f();
        this.clientes.set(k, c);
      }
      return c;
    };
    const mlCli = doCache(
      `ml|${baseML}|${appId}|${segredoML}|${redirect}|${ml.simulado}`,
      () =>
        new ClienteML(
          { baseUrl: baseML, appId, segredo: segredoML, redirectUri: redirect },
          this.armazem(ml.simulado),
          fetch,
          () => new Date(),
          this.registro,
        ),
    ) as ClienteML;
    const spCli = doCache(
      `sp|${baseSP}|${partnerId}|${partnerKey}|${shopId}|${sp.simulado}`,
      () =>
        new ClienteShopee(
          { baseUrl: baseSP, partnerId, partnerKey, shopId },
          this.armazem(sp.simulado),
          fetch,
          () => new Date(),
          this.registro,
        ),
    ) as ClienteShopee;
    return { ml: mlCli, shopee: spCli, segredoML, partnerKey, simulado };
  }

  private persistencia(): PersistenciaSegredos {
    return {
      ler: async (canal) => {
        const r = await this.prisma.integracaoConfig.findUnique({
          where: { chave: canal },
        });
        if (!r) return null;
        return {
          config: (r.config ?? {}) as Record<string, unknown>,
          segredos: (r.segredos ?? {}) as Record<
            string,
            { cifrado: string; fim: string }
          >,
        };
      },
      gravar: async (canal, r) => {
        await this.prisma.integracaoConfig.upsert({
          where: { chave: canal },
          create: {
            chave: canal,
            config: r.config as object,
            segredos: r.segredos as object,
          },
          update: {
            config: r.config as object,
            segredos: r.segredos as object,
          },
        });
      },
    };
  }

  /** Token real fica cifrado no banco. O do marketplace simulado nunca é gravado: é só de mentira. */
  private armazem(simulado: boolean): ArmazemToken {
    if (simulado) return this.memoria;
    const chave = lerChave(process.env.INTEGRACOES_CHAVE);
    if (!chave) {
      return {
        ler: async () => null,
        gravar: async () => {
          throw new ErroCanal(
            503,
            "A variável INTEGRACOES_CHAVE não está definida: não dá para guardar o token cifrado.",
          );
        },
      };
    }
    return new ArmazemCifrado(this.persistencia(), chave);
  }

  /** A busca periódica roda para o canal simulado ligado ou para o canal real já autorizado. */
  private async buscaAtiva(canal: CanalReal): Promise<boolean> {
    const { simulado } = await this.configDo(canal);
    if (simulado) return true;
    const chave = lerChave(process.env.INTEGRACOES_CHAVE);
    if (!chave) return false;
    return (
      (await new ArmazemCifrado(this.persistencia(), chave).ler(canal)) !== null
    );
  }

  /** O que o painel mostra de cada canal. */
  async painelDoCanal(canal: CanalReal) {
    const { cfg, simulado, base } = await this.configDo(canal);
    const credenciais =
      canal === "mercadolivre"
        ? !!texto(cfg.appId) &&
          !!(await this.integ.segredo("mercadolivre", "segredo"))
        : !!texto(cfg.partnerId) &&
          !!(await this.integ.segredo("shopee", "partnerKey"));
    const chave = lerChave(process.env.INTEGRACOES_CHAVE);
    const autorizado = chave
      ? (await new ArmazemCifrado(this.persistencia(), chave).ler(canal)) !==
        null
      : false;
    const s: SituacaoDoCanal = {
      credenciais,
      autorizado,
      urlPublica: (process.env.WEB_BASE_URL ?? "").startsWith("https://"),
      apiReal: !simulado,
    };
    return {
      canal,
      baseUrl:
        base || (simulado ? `${urlDestaApi()}/simulado` : BASE_REAL[canal]),
      simulado,
      casosNoCanal: simulado ? this.simulador.ids(canal).length : null,
      falta: faltaParaFuncionar(canal, s),
    };
  }
}

// ---------- A API simulada, como middleware (fora do roteamento do Nest) ----------

/**
 * Atende `/simulado/*` com a resposta que a API real daria. Só com o marketplace simulado
 * ligado; senão é 404. As próprias regras de autenticação do canal (token, assinatura) valem.
 */
export function manipuladorSimulado(canais: ServicoCanais) {
  return async (req: Request, res: Response) => {
    if (!(await canais.situacao()).ativo) {
      res
        .status(404)
        .json({ message: "O marketplace simulado está desligado." });
      return;
    }
    const url = new URL(
      req.originalUrl.replace(/^\/simulado/, "") || "/",
      "http://simulado.local",
    );
    const tipo = String(req.headers["content-type"] ?? "");
    const b = req.body as unknown;
    const corpo =
      typeof b === "string"
        ? b
        : tipo.includes("application/x-www-form-urlencoded")
          ? new URLSearchParams(b as Record<string, string>).toString()
          : b && Object.keys(b as object).length
            ? JSON.stringify(b)
            : "";
    const cab: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === "string") cab[k.toLowerCase()] = v;
    }
    if (canais.simulador.latenciaMs > 0) {
      await new Promise((r) => setTimeout(r, canais.simulador.latenciaMs));
    }
    const r = canais.simulador.tratar({
      metodo: req.method,
      url,
      cabecalhos: cab,
      corpo,
    });
    res.status(r.status).json(r.json);
  };
}

// ---------- Avisos (webhooks) ----------

type PedidoBruto = IncomingMessage & {
  rawBody?: Buffer;
  originalUrl?: string;
  protocol?: string;
};

@Controller("webhooks")
export class ControladorWebhooksCanais {
  constructor(@Inject(ServicoCanais) private readonly canais: ServicoCanais) {}

  /** Aviso do Mercado Livre (tópico post_purchase). Responde 200 logo e processa na fila. */
  @Publico()
  @Post("mercadolivre")
  @HttpCode(200)
  async mercadolivre(
    @Req() req: PedidoBruto,
    @Headers("x-signature") assinatura: string | undefined,
  ) {
    if (!req.rawBody) throw new BadRequestException("Corpo ausente.");
    const r = await this.canais.captura.receberAvisoML(
      req.rawBody.toString("utf8"),
      assinatura,
    );
    if (r.status !== 200) throw new HttpException("Aviso recusado.", r.status);
    return { ok: true };
  }

  /** Push 29 da Shopee. Confere o header Authorization sobre url|corpo e responde 200 logo. */
  @Publico()
  @Post("shopee")
  @HttpCode(200)
  async shopee(
    @Req() req: PedidoBruto,
    @Headers("authorization") authorization: string | undefined,
  ) {
    if (!req.rawBody) throw new BadRequestException("Corpo ausente.");
    const url =
      process.env.SHOPEE_PUSH_URL ??
      `${req.protocol ?? "http"}://${req.headers.host ?? "localhost"}${req.originalUrl ?? "/webhooks/shopee"}`;
    const r = await this.canais.captura.receberPushShopee(
      url,
      req.rawBody.toString("utf8"),
      authorization,
    );
    if (r.status !== 200) throw new HttpException("Aviso recusado.", r.status);
    return { ok: true };
  }
}

// ---------- Tela de simulação ----------

function lerCanalReal(v: unknown): CanalReal {
  if (!CANAIS.includes(v as CanalReal)) {
    throw new BadRequestException("Informe o canal: mercadolivre ou shopee.");
  }
  return v as CanalReal;
}

@Controller("admin/simulacao")
export class ControladorSimulacao {
  constructor(
    @Inject(ServicoCanais) private readonly canais: ServicoCanais,
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
  ) {}

  @Get()
  async estado(@Req() req: PedidoComUsuario) {
    if (!req.usuario) throw new BadRequestException("Sessão ausente.");
    exigirGestao(req.usuario);
    const [situacao, ml, sp, capturadas] = await Promise.all([
      this.canais.situacao(),
      this.canais.painelDoCanal("mercadolivre"),
      this.canais.painelDoCanal("shopee"),
      this.prisma.reclamacao.count({
        where: { origemRegistro: "canal", treino: true },
      }),
    ]);
    return {
      ...situacao,
      canais: [ml, sp],
      reclamacoesCapturadas: capturadas,
      registro: this.canais.registro.listar().slice(-200),
    };
  }

  /** Liga ou desliga o marketplace simulado. Só o administrador; com `CANAL_SIMULADO=1` fica sempre ligado. */
  @Put("ativo")
  async ativo(@Body() corpo: unknown, @Req() req: PedidoComUsuario) {
    if (!req.usuario) throw new BadRequestException("Sessão ausente.");
    exigirAdministrador(req.usuario);
    const c = (corpo ?? {}) as Record<string, unknown>;
    if (typeof c.ativo !== "boolean") {
      throw new BadRequestException(
        "Informe se o marketplace simulado fica ligado.",
      );
    }
    if (process.env.CANAL_SIMULADO === "1") {
      throw new BadRequestException(
        "Ligado pela variável CANAL_SIMULADO; só o servidor desliga.",
      );
    }
    await this.canais.definirAtivo(c.ativo);
    return this.canais.situacao();
  }

  @Post("cenario")
  @HttpCode(200)
  async cenario(@Body() corpo: unknown, @Req() req: PedidoComUsuario) {
    if (!req.usuario) throw new BadRequestException("Sessão ausente.");
    exigirGestao(req.usuario);
    if (!(await this.canais.situacao()).ativo) {
      throw new BadRequestException(
        "Ligue o marketplace simulado antes de rodar um cenário.",
      );
    }
    const c = (corpo ?? {}) as Record<string, unknown>;
    if (!ehCenario(c.cenario))
      throw new BadRequestException("Cenário inválido.");
    const canal =
      c.cenario === "reiniciar" ? "mercadolivre" : lerCanalReal(c.canal);
    try {
      return await this.canais.cenarios.executar(c.cenario, canal);
    } catch (e) {
      if (e instanceof ErroCanal) {
        return { ok: false, mensagem: e.message };
      }
      throw e;
    }
  }

  @Post("registro/limpar")
  @HttpCode(200)
  limpar(@Req() req: PedidoComUsuario) {
    if (!req.usuario) throw new BadRequestException("Sessão ausente.");
    exigirGestao(req.usuario);
    this.canais.registro.limpar();
    return { ok: true };
  }
}
