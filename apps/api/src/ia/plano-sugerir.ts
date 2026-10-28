import type { Prisma, PrismaClient } from "@prisma/client";
import type { UsuarioLogado } from "@sac-aisa/auth";
import { tituloPlanoDoSku } from "@sac-aisa/domain";
import { filtroDeTreino } from "../reclamacoes";
import { lerJson } from "./esquemas";
import {
  type ConfigIa,
  type FonteConfigIa,
  inicioDoDia,
  resolverConfig,
} from "./ia";
import {
  esquemaRedacaoPlano,
  esquemaSintesePlano,
  type SintesePlano,
} from "./plano-esquemas";
import {
  type AncoraPlano,
  type CasoPlano,
  sistemaRedacaoPlano,
  sistemaSintesePlano,
  usuarioRedacaoPlano,
  usuarioSintesePlano,
  VERSAO_PLANO,
} from "./plano-prompts";
import { comNovaTentativa, MODELO_PADRAO, type ProvedorIa } from "./provedor";
import { redigir } from "./redacao";

const TIMEOUT_SINTESE_MS = 20_000;
const TIMEOUT_REDACAO_MS = 25_000;
const MAX_CASOS = 15;
const TRECHO = 280;
const MODELO_VALIDO = /^[A-Za-z0-9._:/-]{3,100}$/;

export type PedidoSugerirPlano = {
  sku?: string;
  produtoId?: string;
  causaId?: string;
  bancadaId?: string;
  baselineInicio?: string;
  baselineFim?: string;
  reclamacaoIds?: string[];
};

export type ResultadoSugerirPlano =
  | {
      ok: true;
      titulo: string;
      descricao: string;
      prioridade: "baixa" | "media" | "alta";
      avisos: string[];
      sintese: SintesePlano;
      modelos: { sintese: string; redacao: string };
      custoUsd: number;
      fonte: "ia";
    }
  | {
      ok: true;
      titulo: string;
      descricao: string;
      prioridade: "media";
      avisos: string[];
      sintese: null;
      modelos: null;
      custoUsd: 0;
      fonte: "regra";
      aviso: string;
    }
  | { ok: false; mensagem: string };

function diaIso(s: string): Date {
  return new Date(`${s.slice(0, 10)}T00:00:00.000Z`);
}

function dia(d: Date): Date {
  return new Date(`${d.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

function cortar(s: string, n: number): string {
  const t = s.trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

function modeloDe(
  cfgJson: Record<string, unknown>,
  env: Record<string, string | undefined>,
  chaveCfg: string,
  chaveEnv: string,
  padrao: string,
): string {
  const tela =
    typeof cfgJson[chaveCfg] === "string"
      ? String(cfgJson[chaveCfg]).trim()
      : "";
  const amb = env[chaveEnv]?.trim() ?? "";
  return [tela, amb, padrao].find((m) => MODELO_VALIDO.test(m)) ?? padrao;
}

export function montarFallbackRegra(args: {
  sku: string;
  produtoNome: string;
  acaoCausa: string;
  aviso: string;
}): Extract<ResultadoSugerirPlano, { fonte: "regra" }> {
  const titulo = tituloPlanoDoSku(args.sku, args.produtoNome);
  const descricao =
    args.acaoCausa.trim() ||
    `Investigar a causa raiz das reclamações do SKU ${args.sku} e definir ações preventivas no processo.`;
  return {
    ok: true,
    titulo,
    descricao,
    prioridade: "media",
    avisos: [],
    sintese: null,
    modelos: null,
    custoUsd: 0,
    fonte: "regra",
    aviso: args.aviso,
  };
}

export class ServicoPlanoIa {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly fonte: FonteConfigIa,
    private readonly criarProvedor: (chave: string) => ProvedorIa,
    private readonly env: Record<string, string | undefined> = process.env,
  ) {}

  async sugerir(
    usuario: UsuarioLogado,
    pedido: PedidoSugerirPlano,
  ): Promise<ResultadoSugerirPlano> {
    if (!usuario.permissoes.includes("planos.gerir")) {
      return { ok: false, mensagem: "Sem permissão para gerir planos." };
    }
    if (!usuario.permissoes.includes("ia.usar")) {
      return { ok: false, mensagem: "Sem permissão para usar a IA." };
    }

    const ctx = await this.carregarContexto(usuario, pedido);
    if (!ctx.ok) return ctx;

    const cfg = await resolverConfig(this.fonte, this.env);
    const cfgJson = await this.fonte.config();
    if (cfg.chave === null) {
      return montarFallbackRegra({
        sku: ctx.ancora.sku,
        produtoNome: ctx.ancora.produto,
        acaoCausa: ctx.ancora.acaoCausa,
        aviso: "A IA não está configurada. Usei a ação sugerida da causa.",
      });
    }
    if (await this.limiteAtingido(cfg)) {
      return montarFallbackRegra({
        sku: ctx.ancora.sku,
        produtoNome: ctx.ancora.produto,
        acaoCausa: ctx.ancora.acaoCausa,
        aviso: "Limite diário da IA atingido. Usei a ação sugerida da causa.",
      });
    }

    const modeloSintese = modeloDe(
      cfgJson,
      this.env,
      "modeloSintese",
      "OPENROUTER_MODELO_SINTESE",
      MODELO_PADRAO,
    );
    const modeloRedacao = modeloDe(
      cfgJson,
      this.env,
      "modeloPlano",
      "OPENROUTER_MODELO_PLANO",
      cfg.modelo,
    );

    const provedor = this.criarProvedor(cfg.chave);
    let sintese: SintesePlano;
    let custo = 0;
    let modeloSinteseUsado = modeloSintese;
    let modeloRedacaoUsado = modeloRedacao;

    try {
      const t0 = Date.now();
      const respS = await comNovaTentativa(provedor, {
        sistema: sistemaSintesePlano(),
        usuario: usuarioSintesePlano(ctx.ancora, ctx.casos),
        modelo: modeloSintese,
        timeoutMs: TIMEOUT_SINTESE_MS,
        maxTokens: 700,
      });
      sintese = esquemaSintesePlano.parse(lerJson(respS.texto));
      custo += respS.custoUsd;
      modeloSinteseUsado = respS.modelo;
      await this.gravar({
        usuarioId: usuario.id,
        etapa: "plano_sintese",
        sugestao: sintese,
        modelo: respS.modelo,
        tokensEntrada: respS.tokensEntrada,
        tokensSaida: respS.tokensSaida,
        custoUsd: respS.custoUsd,
        latenciaMs: Date.now() - t0,
        entradaRedigida: usuarioSintesePlano(ctx.ancora, ctx.casos).slice(
          0,
          8000,
        ),
        erro: null,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha na síntese do plano.";
      await this.gravar({
        usuarioId: usuario.id,
        etapa: "plano_sintese",
        sugestao: {},
        modelo: modeloSintese,
        tokensEntrada: 0,
        tokensSaida: 0,
        custoUsd: 0,
        latenciaMs: 0,
        entradaRedigida: "",
        erro: msg.slice(0, 500),
      });
      return montarFallbackRegra({
        sku: ctx.ancora.sku,
        produtoNome: ctx.ancora.produto,
        acaoCausa: ctx.ancora.acaoCausa,
        aviso: "A síntese da IA falhou. Usei a ação sugerida da causa.",
      });
    }

    try {
      const t1 = Date.now();
      const respR = await comNovaTentativa(provedor, {
        sistema: sistemaRedacaoPlano(),
        usuario: usuarioRedacaoPlano(ctx.ancora, sintese),
        modelo: modeloRedacao,
        timeoutMs: TIMEOUT_REDACAO_MS,
        maxTokens: 900,
      });
      const redacao = esquemaRedacaoPlano.parse(lerJson(respR.texto));
      custo += respR.custoUsd;
      modeloRedacaoUsado = respR.modelo;
      await this.gravar({
        usuarioId: usuario.id,
        etapa: "plano_rascunho",
        sugestao: redacao,
        modelo: respR.modelo,
        tokensEntrada: respR.tokensEntrada,
        tokensSaida: respR.tokensSaida,
        custoUsd: respR.custoUsd,
        latenciaMs: Date.now() - t1,
        entradaRedigida: usuarioRedacaoPlano(ctx.ancora, sintese).slice(
          0,
          8000,
        ),
        erro: null,
      });
      return {
        ok: true,
        titulo: redacao.titulo,
        descricao: redacao.descricao,
        prioridade: redacao.prioridade,
        avisos: redacao.avisos,
        sintese,
        modelos: { sintese: modeloSinteseUsado, redacao: modeloRedacaoUsado },
        custoUsd: Math.round(custo * 1_000_000) / 1_000_000,
        fonte: "ia",
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha na redação do plano.";
      await this.gravar({
        usuarioId: usuario.id,
        etapa: "plano_rascunho",
        sugestao: { sintese },
        modelo: modeloRedacao,
        tokensEntrada: 0,
        tokensSaida: 0,
        custoUsd: 0,
        latenciaMs: 0,
        entradaRedigida: "",
        erro: msg.slice(0, 500),
      });
      // Síntese ok, mas redação falhou: devolve texto a partir da síntese + ação.
      return {
        ok: true,
        titulo: tituloPlanoDoSku(ctx.ancora.sku, ctx.ancora.produto),
        descricao: [
          ctx.ancora.acaoCausa.trim(),
          "",
          "Síntese (IA):",
          sintese.resumo,
          sintese.hipoteses.length
            ? `Hipóteses: ${sintese.hipoteses.join("; ")}`
            : "",
          sintese.lacunas.length
            ? `A investigar: ${sintese.lacunas.join("; ")}`
            : "",
        ]
          .filter((l) => l !== undefined)
          .join("\n")
          .trim()
          .slice(0, 4000),
        prioridade: "media",
        avisos: ["A redação final da IA falhou; revise a síntese abaixo."],
        sintese,
        modelos: { sintese: modeloSinteseUsado, redacao: modeloRedacaoUsado },
        custoUsd: Math.round(custo * 1_000_000) / 1_000_000,
        fonte: "ia",
      };
    }
  }

  private async limiteAtingido(cfg: ConfigIa): Promise<boolean> {
    const desde = inicioDoDia(new Date());
    const r = await this.prisma.iaRegistro.aggregate({
      where: {
        criadoEm: { gte: desde },
        OR: [
          {
            tipo: { in: ["triagem", "pergunta"] },
            etapa: { not: "triagem_regras" },
          },
          {
            tipo: "preenchimento",
            etapa: { in: ["plano_sintese", "plano_rascunho"] },
          },
        ],
      },
      _count: { _all: true },
      _sum: { custoUsd: true },
    });
    const chamadas = r._count._all;
    const custo = Number(r._sum.custoUsd ?? 0);
    return chamadas >= cfg.limiteChamadas || custo >= cfg.limiteCustoUsd;
  }

  private async gravar(args: {
    usuarioId: string;
    etapa: string;
    sugestao: unknown;
    modelo: string;
    tokensEntrada: number;
    tokensSaida: number;
    custoUsd: number;
    latenciaMs: number;
    entradaRedigida: string;
    erro: string | null;
  }) {
    await this.prisma.iaRegistro.create({
      data: {
        tipo: "preenchimento",
        etapa: args.etapa,
        sugestao: args.sugestao as Prisma.InputJsonValue,
        modelo: args.modelo,
        versaoPrompt: VERSAO_PLANO,
        tokensEntrada: args.tokensEntrada,
        tokensSaida: args.tokensSaida,
        custoUsd: args.custoUsd,
        latenciaMs: args.latenciaMs,
        entradaRedigida: args.entradaRedigida,
        erro: args.erro,
        usouRegras: false,
        usuarioId: args.usuarioId,
      },
    });
  }

  private async carregarContexto(
    usuario: UsuarioLogado,
    pedido: PedidoSugerirPlano,
  ): Promise<
    | { ok: true; ancora: AncoraPlano; casos: CasoPlano[] }
    | { ok: false; mensagem: string }
  > {
    const sku = (pedido.sku ?? "").trim();
    let produto = pedido.produtoId
      ? await this.prisma.produto.findUnique({
          where: { id: pedido.produtoId },
          select: {
            id: true,
            codigo: true,
            nome: true,
            bancadaId: true,
            bancada: { select: { codigo: true, nome: true } },
          },
        })
      : null;
    if (!produto && sku) {
      produto =
        (await this.prisma.produto.findUnique({
          where: { codigo: sku },
          select: {
            id: true,
            codigo: true,
            nome: true,
            bancadaId: true,
            bancada: { select: { codigo: true, nome: true } },
          },
        })) ??
        (await this.prisma.produto.findFirst({
          where: { codigo: { equals: sku, mode: "insensitive" } },
          select: {
            id: true,
            codigo: true,
            nome: true,
            bancadaId: true,
            bancada: { select: { codigo: true, nome: true } },
          },
        }));
    }
    if (!produto) {
      return { ok: false, mensagem: "Informe o produto ou o SKU do plano." };
    }

    const fim = pedido.baselineFim
      ? diaIso(pedido.baselineFim)
      : dia(new Date());
    const inicio = pedido.baselineInicio
      ? diaIso(pedido.baselineInicio)
      : new Date(fim.getTime() - 365 * 86_400_000);

    const filtroTreino = filtroDeTreino({
      perfil: usuario.perfil,
      setores: usuario.setores,
      marcas: usuario.marcas,
      treino: usuario.modoTreino,
    });

    const ids = (pedido.reclamacaoIds ?? [])
      .filter(Boolean)
      .slice(0, MAX_CASOS);
    const linhas = await this.prisma.reclamacao.findMany({
      where: {
        rascunho: false,
        ...filtroTreino,
        produtoId: produto.id,
        ...(pedido.causaId ? { causaId: pedido.causaId } : {}),
        ...(pedido.bancadaId ? { bancadaId: pedido.bancadaId } : {}),
        ...(ids.length
          ? { id: { in: ids } }
          : { dataAbertura: { gte: inicio, lte: fim } }),
      },
      select: {
        descricao: true,
        laudo: true,
        solucao: true,
        clienteNome: true,
        pedido: true,
        causa: { select: { nome: true } },
      },
      orderBy: { dataAbertura: "desc" },
      take: MAX_CASOS,
    });

    const causaId = pedido.causaId;
    const causa = causaId
      ? await this.prisma.causa.findUnique({
          where: { id: causaId },
          select: {
            nome: true,
            acao: true,
            setor: { select: { nome: true } },
            regra: { select: { acao: true } },
          },
        })
      : null;

    const bancadaId = pedido.bancadaId || produto.bancadaId;
    const bancada = bancadaId
      ? await this.prisma.bancada.findUnique({
          where: { id: bancadaId },
          select: { codigo: true, nome: true },
        })
      : produto.bancada;

    const casos: CasoPlano[] = linhas.map((l) => {
      const dados = {
        nomes: l.clienteNome ? [l.clienteNome] : [],
        literais: l.pedido ? [l.pedido] : [],
      };
      return {
        texto: cortar(redigir(l.descricao, dados), TRECHO),
        laudo: cortar(redigir(l.laudo, dados), TRECHO),
        solucao: cortar(redigir(l.solucao, dados), TRECHO),
        causa: l.causa?.nome ?? "",
      };
    });

    const ancora: AncoraPlano = {
      sku: produto.codigo,
      produto: produto.nome,
      bancada: bancada
        ? `${bancada.codigo}${bancada.nome ? ` · ${bancada.nome}` : ""}`
        : "",
      causa: causa?.nome ?? "",
      acaoCausa: (causa?.regra?.acao ?? causa?.acao ?? "").trim(),
      setor: causa?.setor?.nome ?? "",
      ppm: null,
      reclamacoes: linhas.length,
      vendas: null,
      periodo: `${inicio.toISOString().slice(0, 10)} a ${fim.toISOString().slice(0, 10)}`,
    };

    return { ok: true, ancora, casos };
  }
}
