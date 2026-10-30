import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Prisma, Situacao } from "@prisma/client";
import { PrismaClient } from "@prisma/client";
import type { UsuarioLogado } from "@sac-aisa/auth";
import { mesclarPermissoes } from "@sac-aisa/domain";
import {
  type Escopo,
  filtroDeEscopo,
  filtroDeTreino,
  montarFiltro,
} from "../reclamacoes";
import type { ChatToolDef } from "./orquestrador";
import { normSku, resolverPeriodo, setorFuzzyMatch } from "./periodo";

export type GestorToolDef = ChatToolDef;

function dia(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

function situacaoDe(r: { dataAcao: Date | null; devolucao: string }): Situacao {
  if (r.dataAcao) return "resolvida";
  if (r.devolucao === "AGUARDANDO") return "aguardando";
  return "tratativa";
}

type CustoLinha = {
  freteEnvio: { toString(): string } | number;
  freteRetorno: { toString(): string } | number;
  valorPeca: { toString(): string } | number;
  estorno: { toString(): string } | number;
  desconto: { toString(): string } | number;
  guia: { toString(): string } | number;
};

function somaCusto(c: CustoLinha | null | undefined): number {
  if (!c) return 0;
  return (
    Number(c.freteEnvio) +
    Number(c.freteRetorno) +
    Number(c.valorPeca) +
    Number(c.estorno) +
    Number(c.desconto) +
    Number(c.guia)
  );
}

const CUSTO_SELECT = {
  freteEnvio: true,
  freteRetorno: true,
  valorPeca: true,
  estorno: true,
  desconto: true,
  guia: true,
} as const;

function escopoDe(u: UsuarioLogado): Escopo {
  return {
    perfil: u.perfil,
    setores: u.setores,
    marcas: u.marcas,
    treino: u.modoTreino === true,
  };
}

export const GESTOR_TOOL_DEFS: GestorToolDef[] = [
  {
    type: "function",
    function: {
      name: "catalogo",
      description:
        "Use quando o gestor perguntar o que você faz. Não devolve cifra. Explique em prosa — sem listar comandos ou menus.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "periodo_resolver",
      description:
        "Converte período em {de, ate} (America/Sao_Paulo). Use ANTES de listar/KPI. Aceita hoje, ontem, semana, 15d, 30d, 45d, ano/este ano, “últimos N dias”, ou dias=N.",
      parameters: {
        type: "object",
        properties: {
          preset: {
            type: "string",
            description:
              "hoje | ontem | semana | 15d | 30d | 45d | ano | este ano | ultimos 45 dias",
          },
          dias: { type: "number", description: "N últimos dias (1–365)." },
          de: { type: "string", description: "YYYY-MM-DD início" },
          ate: { type: "string", description: "YYYY-MM-DD fim" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reclamacoes_listar",
      description:
        "Lista resumida de reclamações no período (máx. 15) + total. Sem PII do comprador. Sempre de/ate.",
      parameters: {
        type: "object",
        properties: {
          de: { type: "string" },
          ate: { type: "string" },
          status: {
            type: "string",
            description: "aguardando | tratativa | resolvida",
          },
          setor: { type: "string", description: "Setor responsável (fuzzy)" },
          sku: { type: "string" },
          causa: { type: "string", description: "Id ou nome parcial da causa" },
          q: { type: "string", description: "Busca livre (SKU/texto)" },
        },
        required: ["de", "ate"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sku_resolver",
      description:
        "Resolve SKU digitado (g-156, g156) para o código canônico. USE antes de negar que um SKU não existe.",
      parameters: {
        type: "object",
        properties: { sku: { type: "string" } },
        required: ["sku"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sku_analise",
      description:
        "Análise de um SKU no período: volume, causas, amostra. Fuzzy interno.",
      parameters: {
        type: "object",
        properties: {
          sku: { type: "string" },
          de: { type: "string" },
          ate: { type: "string" },
        },
        required: ["sku", "de", "ate"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reclamacao_status",
      description:
        "Status de UMA reclamação por nº de registro. Sem nome/telefone/endereço do comprador.",
      parameters: {
        type: "object",
        properties: {
          token: { type: "string", description: "Número do registro" },
        },
        required: ["token"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "kpi_resumo",
      description:
        "Totais no período: quantidade, aguardando/tratativa/resolvida, custo.",
      parameters: {
        type: "object",
        properties: { de: { type: "string" }, ate: { type: "string" } },
        required: ["de", "ate"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "causas_top",
      description: "Ranking das principais causas no período.",
      parameters: {
        type: "object",
        properties: {
          de: { type: "string" },
          ate: { type: "string" },
          limite: { type: "number" },
        },
        required: ["de", "ate"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "setor_resumo",
      description:
        "Resumo por setor responsável (fuzzy). Sem nome: ranking. Com nome: detalhe.",
      parameters: {
        type: "object",
        properties: {
          de: { type: "string" },
          ate: { type: "string" },
          nome: { type: "string" },
        },
        required: ["de", "ate"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "alertas_abertos",
      description: "Lista alertas com status aberto agora.",
      parameters: {
        type: "object",
        properties: { limite: { type: "number" } },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fila_setor",
      description:
        "Contagem da fila por setor (reclamações em tratativa / aguardando sem ação).",
      parameters: {
        type: "object",
        properties: {
          setor: { type: "string", description: "Opcional — fuzzy" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "planos_listar",
      description: "Lista planos de ação recentes (status, SKU, vinculados).",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description: "aberto | em_andamento | concluido | cancelado",
          },
          sku: { type: "string" },
          limite: { type: "number" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "plano_status",
      description: "Detalhe de um plano por id ou título parcial / SKU (G48).",
      parameters: {
        type: "object",
        properties: {
          token: {
            type: "string",
            description: "Id do plano, título parcial ou SKU",
          },
        },
        required: ["token"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "clickup_card",
      description:
        "Status do card ClickUp ligado a uma reclamação (nº) ou a um plano (id/título/SKU). Só leitura — não cria nem edita card.",
      parameters: {
        type: "object",
        properties: {
          token: {
            type: "string",
            description: "Nº reclamação, id/título do plano ou SKU",
          },
          tipo: {
            type: "string",
            description: "reclamacao | plano | auto (padrão)",
          },
        },
        required: ["token"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ppm_qualidade",
      description:
        "PPM geral e SKUs com mais reclamações no período (usa vendas_dia se houver).",
      parameters: {
        type: "object",
        properties: { de: { type: "string" }, ate: { type: "string" } },
        required: ["de", "ate"],
        additionalProperties: false,
      },
    },
  },
];

@Injectable()
export class GestorToolsService {
  private readonly log = new Logger(GestorToolsService.name);

  constructor(@Inject(PrismaClient) private readonly prisma: PrismaClient) {}

  defs() {
    return GESTOR_TOOL_DEFS;
  }

  private dataOk(v: unknown): v is string {
    return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  }

  private datasOuErro(
    args: Record<string, unknown>,
  ): { de: string; ate: string } | { erro: string } {
    if (!this.dataOk(args.de) || !this.dataOk(args.ate)) {
      return {
        erro: "Informe de e ate no formato YYYY-MM-DD (chame periodo_resolver antes).",
      };
    }
    return { de: args.de, ate: args.ate };
  }

  async execute(
    name: string,
    args: Record<string, unknown>,
    usuario: UsuarioLogado,
  ): Promise<unknown> {
    try {
      switch (name) {
        case "catalogo":
          return this.catalogo();
        case "periodo_resolver":
          return resolverPeriodo(
            typeof args.preset === "string" ? args.preset : undefined,
            this.dataOk(args.de) ? args.de : undefined,
            this.dataOk(args.ate) ? args.ate : undefined,
            typeof args.dias === "number"
              ? args.dias
              : typeof args.dias === "string" && args.dias.trim()
                ? Number(args.dias)
                : undefined,
          );
        case "reclamacoes_listar": {
          const d = this.datasOuErro(args);
          if ("erro" in d) return d;
          return this.reclamacoesListar({ ...args, ...d }, usuario);
        }
        case "sku_resolver":
          return this.skuResolver(typeof args.sku === "string" ? args.sku : "");
        case "sku_analise": {
          const d = this.datasOuErro(args);
          if ("erro" in d) return d;
          return this.skuAnalise(
            typeof args.sku === "string" ? args.sku : "",
            d.de,
            d.ate,
            usuario,
          );
        }
        case "reclamacao_status":
          return this.reclamacaoStatus(
            typeof args.token === "string" ? args.token : "",
            usuario,
          );
        case "kpi_resumo": {
          const d = this.datasOuErro(args);
          if ("erro" in d) return d;
          return this.kpiResumo(d.de, d.ate, usuario);
        }
        case "causas_top": {
          const d = this.datasOuErro(args);
          if ("erro" in d) return d;
          return this.causasTop(d.de, d.ate, Number(args.limite) || 8, usuario);
        }
        case "setor_resumo": {
          const d = this.datasOuErro(args);
          if ("erro" in d) return d;
          return this.setorResumo(
            d.de,
            d.ate,
            typeof args.nome === "string" ? args.nome : "",
            usuario,
          );
        }
        case "alertas_abertos":
          return this.alertasAbertos(Number(args.limite) || 10, usuario);
        case "fila_setor":
          return this.filaSetor(
            typeof args.setor === "string" ? args.setor : "",
            usuario,
          );
        case "planos_listar":
          return this.planosListar(args, usuario);
        case "plano_status":
          return this.planoStatus(
            typeof args.token === "string" ? args.token : "",
            usuario,
          );
        case "clickup_card":
          return this.clickupCard(
            typeof args.token === "string" ? args.token : "",
            typeof args.tipo === "string" ? args.tipo : "auto",
            usuario,
          );
        case "ppm_qualidade": {
          const d = this.datasOuErro(args);
          if ("erro" in d) return d;
          return this.ppmQualidade(d.de, d.ate, usuario);
        }
        default:
          return { erro: `Tool desconhecida: ${name}` };
      }
    } catch (e) {
      this.log.warn(`Tool ${name} falhou: ${e}`);
      return { erro: String(e) };
    }
  }

  private catalogo() {
    return {
      escopo:
        "Assistente do gestor SAC AISA — conversa natural, somente leitura",
      cobre: [
        "Reclamações por período / setor / causa / SKU",
        "Status de registro e jornada",
        "KPI, causas, setores, fila, alertas, PPM",
        "Planos de ação e status do card ClickUp",
      ],
      nao_cobre: [
        "Alterar reclamação ou plano",
        "Criar/editar card ClickUp",
        "WhatsApp com comprador",
      ],
      tom: "WhatsApp: bullets • , negrito *texto*, sem ## nem **.",
    };
  }

  private whereBase(usuario: UsuarioLogado): Prisma.ReclamacaoWhereInput {
    const escopo = escopoDe(usuario);
    const partes: Prisma.ReclamacaoWhereInput[] = [filtroDeTreino(escopo)];
    const doEscopo = filtroDeEscopo(escopo);
    if (doEscopo) partes.push(doEscopo);
    return partes.length === 1 ? partes[0] : { AND: partes };
  }

  private async resolverSetorId(nome: string): Promise<string | null> {
    if (!nome.trim()) return null;
    const setores = await this.prisma.setor.findMany({
      where: { ativo: true },
      select: { id: true, nome: true },
    });
    const hit = setores.find((s) => setorFuzzyMatch(s.nome, nome));
    return hit?.id ?? null;
  }

  private async skuResolver(raw: string) {
    const input = String(raw || "").trim();
    if (!input) return { erro: "Informe o SKU" };
    const needle = normSku(input);
    if (!needle) return { erro: "SKU inválido", input };

    const depara = await this.prisma.skuDepara.findMany({ take: 500 });
    for (const d of depara) {
      if (normSku(d.skuOrigem) === needle || normSku(d.skuDestino) === needle) {
        const prod = await this.prisma.produto.findFirst({
          where: { codigo: { equals: d.skuDestino, mode: "insensitive" } },
        });
        return {
          input,
          encontrado: true,
          melhor: {
            sku: d.skuDestino,
            produto: prod?.nome || "",
            via: "depara",
          },
          candidatos: [
            { sku: d.skuDestino, produto: prod?.nome || "", score: 100 },
          ],
        };
      }
    }

    const produtos = await this.prisma.produto.findMany({
      where: { ativo: true },
      select: { codigo: true, nome: true },
      take: 4000,
    });
    const cand = produtos
      .map((p) => {
        const n = normSku(p.codigo);
        let score = 0;
        if (n === needle) score = 100;
        else if (n.startsWith(needle) || needle.startsWith(n)) score = 80;
        else if (n.includes(needle) || needle.includes(n)) score = 60;
        return { sku: p.codigo, produto: p.nome, score };
      })
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    if (!cand.length) {
      return {
        input,
        encontrado: false,
        mensagem: `Nenhum SKU parecido com "${input}".`,
        candidatos: [],
      };
    }
    return {
      input,
      encontrado: true,
      melhor: { sku: cand[0].sku, produto: cand[0].produto, via: "fuzzy" },
      candidatos: cand,
    };
  }

  private async reclamacoesListar(
    args: Record<string, unknown> & { de: string; ate: string },
    usuario: UsuarioLogado,
  ) {
    const escopo = escopoDe(usuario);
    let setorId: string | undefined;
    if (typeof args.setor === "string" && args.setor.trim()) {
      setorId = (await this.resolverSetorId(args.setor)) || undefined;
      if (!setorId) {
        const setores = await this.prisma.setor.findMany({
          where: { ativo: true },
          select: { nome: true },
        });
        return {
          erro: `Setor não encontrado: ${args.setor}`,
          setores_disponiveis: setores.map((s) => s.nome),
        };
      }
    }

    let causaId: string | undefined;
    if (typeof args.causa === "string" && args.causa.trim()) {
      const c = args.causa.trim();
      const causa = await this.prisma.causa.findFirst({
        where: {
          OR: [{ id: c }, { nome: { contains: c, mode: "insensitive" } }],
        },
      });
      causaId = causa?.id;
    }

    let produto: string | undefined;
    if (typeof args.sku === "string" && args.sku.trim()) {
      const r = await this.skuResolver(args.sku);
      if (r.encontrado && "melhor" in r && r.melhor) produto = r.melhor.sku;
      else produto = args.sku.trim();
    }

    const situacao =
      args.status === "aguardando" ||
      args.status === "tratativa" ||
      args.status === "resolvida"
        ? (args.status as Situacao)
        : undefined;

    const where = montarFiltro(
      {
        de: args.de,
        ate: args.ate,
        setorId,
        causaId,
        produto,
        situacao,
        pagina: 1,
        porPagina: 15,
      },
      escopo,
    );

    // Busca livre sem PII do comprador (não usa montarFiltro.busca → clienteNome).
    const q = typeof args.q === "string" ? args.q.trim() : "";
    const whereFinal: Prisma.ReclamacaoWhereInput =
      q.length > 0
        ? {
            AND: [
              where,
              {
                OR: [
                  { descricao: { contains: q, mode: "insensitive" } },
                  { laudo: { contains: q, mode: "insensitive" } },
                  { pedido: { contains: q, mode: "insensitive" } },
                  {
                    produto: {
                      codigo: { contains: q, mode: "insensitive" },
                    },
                  },
                ],
              },
            ],
          }
        : where;

    const [total, linhas] = await Promise.all([
      this.prisma.reclamacao.count({ where: whereFinal }),
      this.prisma.reclamacao.findMany({
        where: whereFinal,
        orderBy: { dataAbertura: "desc" },
        take: 15,
        select: {
          numero: true,
          dataAbertura: true,
          dataAcao: true,
          devolucao: true,
          estado: true,
          produto: { select: { codigo: true } },
          causa: { select: { nome: true } },
          setorResp: { select: { nome: true } },
        },
      }),
    ]);

    return {
      de: args.de,
      ate: args.ate,
      total,
      sku_canonico: produto,
      itens: linhas.map((r) => ({
        reg: r.numero,
        sku: r.produto?.codigo ?? "",
        causa: r.causa?.nome ?? "",
        setor: r.setorResp?.nome ?? "",
        situacao: situacaoDe(r),
        estado: r.estado,
        abertura: r.dataAbertura.toISOString().slice(0, 10),
      })),
    };
  }

  private async skuAnalise(
    raw: string,
    de: string,
    ate: string,
    usuario: UsuarioLogado,
  ) {
    const resolved = await this.skuResolver(raw);
    if (!resolved.encontrado || !("melhor" in resolved) || !resolved.melhor) {
      return resolved;
    }
    const sku = resolved.melhor.sku;
    const where = montarFiltro(
      {
        de,
        ate,
        produto: sku,
        pagina: 1,
        porPagina: 15,
      },
      escopoDe(usuario),
    );
    const [total, porCausa, amostra] = await Promise.all([
      this.prisma.reclamacao.count({ where }),
      this.prisma.reclamacao.groupBy({
        by: ["causaId"],
        where,
        _count: { _all: true },
        orderBy: { _count: { causaId: "desc" } },
        take: 10,
      }),
      this.prisma.reclamacao.findMany({
        where,
        orderBy: { dataAbertura: "desc" },
        take: 8,
        select: {
          numero: true,
          causa: { select: { nome: true } },
          setorResp: { select: { nome: true } },
          dataAbertura: true,
          dataAcao: true,
          devolucao: true,
          estado: true,
        },
      }),
    ]);
    const causaIds = porCausa
      .map((c) => c.causaId)
      .filter((id): id is string => !!id);
    const nomes =
      causaIds.length > 0
        ? await this.prisma.causa.findMany({
            where: { id: { in: causaIds } },
            select: { id: true, nome: true },
          })
        : [];
    const nomePorId = new Map(nomes.map((c) => [c.id, c.nome]));
    return {
      de,
      ate,
      input: raw,
      sku_canonico: sku,
      produto: resolved.melhor.produto,
      total_reclamacoes: total,
      causas: porCausa.map((c) => ({
        nome: (c.causaId && nomePorId.get(c.causaId)) || "(sem causa)",
        n: c._count._all,
      })),
      amostra: amostra.map((r) => ({
        reg: r.numero,
        causa: r.causa?.nome ?? "",
        setor: r.setorResp?.nome ?? "",
        situacao: situacaoDe(r),
        estado: r.estado,
        abertura: r.dataAbertura.toISOString().slice(0, 10),
      })),
    };
  }

  private async reclamacaoStatus(token: string, usuario: UsuarioLogado) {
    const n = Number(String(token).replace(/\D/g, ""));
    if (!Number.isFinite(n) || n <= 0)
      return { erro: "Informe o nº do registro" };
    const base = this.whereBase(usuario);
    const r = await this.prisma.reclamacao.findFirst({
      where: { AND: [base, { numero: n }] },
      select: {
        numero: true,
        dataAbertura: true,
        dataAcao: true,
        dataRecebimento: true,
        devolucao: true,
        estado: true,
        produto: { select: { codigo: true, nome: true } },
        causa: { select: { nome: true } },
        setorResp: { select: { nome: true } },
        card: {
          select: {
            taskId: true,
            statusExterno: true,
            listaId: true,
            ultimoErro: true,
          },
        },
        custo: { select: CUSTO_SELECT },
      },
    });
    if (!r) return { encontrado: false, reg: n };
    return {
      encontrado: true,
      reg: r.numero,
      sku: r.produto?.codigo ?? "",
      produto: r.produto?.nome ?? "",
      causa: r.causa?.nome ?? "",
      setor: r.setorResp?.nome ?? "",
      situacao: situacaoDe(r),
      estado_jornada: r.estado,
      abertura: r.dataAbertura.toISOString().slice(0, 10),
      recebimento: r.dataRecebimento
        ? r.dataRecebimento.toISOString().slice(0, 10)
        : null,
      acao: r.dataAcao ? r.dataAcao.toISOString().slice(0, 10) : null,
      custo: Math.round(somaCusto(r.custo)),
      clickup: r.card
        ? {
            taskId: r.card.taskId,
            status: r.card.statusExterno,
            listaId: r.card.listaId,
            erro: r.card.ultimoErro,
          }
        : null,
    };
  }

  private async carregarPeriodo(
    de: string,
    ate: string,
    usuario: UsuarioLogado,
    extra?: Prisma.ReclamacaoWhereInput,
  ) {
    const where: Prisma.ReclamacaoWhereInput = {
      AND: [
        this.whereBase(usuario),
        {
          dataAbertura: {
            gte: dia(de),
            lte: dia(ate),
          },
        },
        ...(extra ? [extra] : []),
      ],
    };
    return this.prisma.reclamacao.findMany({
      where,
      select: {
        dataAcao: true,
        devolucao: true,
        causa: { select: { nome: true } },
        setorResp: { select: { nome: true } },
        produto: { select: { codigo: true } },
        custo: { select: CUSTO_SELECT },
      },
      take: 5000,
    });
  }

  private async kpiResumo(de: string, ate: string, usuario: UsuarioLogado) {
    const linhas = await this.carregarPeriodo(de, ate, usuario);
    let aguardando = 0;
    let tratativa = 0;
    let resolvida = 0;
    let custo = 0;
    for (const r of linhas) {
      const s = situacaoDe(r);
      if (s === "aguardando") aguardando++;
      else if (s === "tratativa") tratativa++;
      else resolvida++;
      custo += somaCusto(r.custo);
    }
    return {
      de,
      ate,
      n: linhas.length,
      aguardando,
      tratativa,
      resolvida,
      custo: Math.round(custo),
    };
  }

  private async causasTop(
    de: string,
    ate: string,
    limite: number,
    usuario: UsuarioLogado,
  ) {
    const linhas = await this.carregarPeriodo(de, ate, usuario);
    const map = new Map<string, number>();
    for (const r of linhas) {
      const k = r.causa?.nome || "(sem causa)";
      map.set(k, (map.get(k) || 0) + 1);
    }
    const top = [...map.entries()]
      .map(([k, n]) => ({ k, n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, Math.min(Math.max(limite, 1), 12));
    return { de, ate, top };
  }

  private async setorResumo(
    de: string,
    ate: string,
    nome: string,
    usuario: UsuarioLogado,
  ) {
    const linhas = await this.carregarPeriodo(de, ate, usuario);
    const map = new Map<string, number>();
    for (const r of linhas) {
      const k = r.setorResp?.nome || "(sem setor)";
      map.set(k, (map.get(k) || 0) + 1);
    }
    const ranking = [...map.entries()]
      .map(([k, n]) => ({ k, n }))
      .sort((a, b) => b.n - a.n);

    if (!nome.trim()) {
      return {
        de,
        ate,
        ranking: ranking.slice(0, 10),
        setores_disponiveis: ranking.map((r) => r.k),
      };
    }

    const match = ranking.filter((r) => setorFuzzyMatch(r.k, nome));
    const nomes = match.map((m) => m.k);
    const filtradas = linhas.filter(
      (r) => r.setorResp?.nome && setorFuzzyMatch(r.setorResp.nome, nome),
    );
    let aguardando = 0;
    let tratativa = 0;
    let resolvida = 0;
    for (const r of filtradas) {
      const s = situacaoDe(r);
      if (s === "aguardando") aguardando++;
      else if (s === "tratativa") tratativa++;
      else resolvida++;
    }
    const causas = new Map<string, number>();
    for (const r of filtradas) {
      const c = r.causa?.nome || "(sem causa)";
      causas.set(c, (causas.get(c) || 0) + 1);
    }
    return {
      de,
      ate,
      query: nome,
      nomes_oficiais: nomes,
      n: filtradas.length,
      aguardando,
      tratativa,
      resolvida,
      causas: [...causas.entries()]
        .map(([k, n]) => ({ k, n }))
        .sort((a, b) => b.n - a.n)
        .slice(0, 8),
      setores_disponiveis: ranking.map((r) => r.k),
    };
  }

  private async alertasAbertos(limite: number, usuario: UsuarioLogado) {
    const where: Prisma.AlertaWhereInput = { status: "aberto" };
    if (usuario.perfil === "responsavel_setor" && usuario.setores.length > 0) {
      where.setor = { in: usuario.setores };
    }
    const lista = await this.prisma.alerta.findMany({
      where,
      orderBy: { criadoEm: "desc" },
      take: Math.min(Math.max(limite, 1), 20),
      select: {
        tipo: true,
        titulo: true,
        setor: true,
        reclamacao: { select: { numero: true } },
      },
    });
    return {
      total: lista.length,
      itens: lista.map((a) => ({
        tipo: a.tipo,
        titulo: a.titulo.slice(0, 80),
        setor: a.setor,
        reg: a.reclamacao?.numero ?? null,
      })),
    };
  }

  private async filaSetor(setor: string, usuario: UsuarioLogado) {
    const linhas = await this.prisma.reclamacao.findMany({
      where: {
        AND: [this.whereBase(usuario), { dataAcao: null }],
      },
      select: {
        devolucao: true,
        setorResp: { select: { nome: true } },
      },
      take: 3000,
    });
    const map = new Map<string, { aguardando: number; tratativa: number }>();
    for (const r of linhas) {
      const k = r.setorResp?.nome || "(sem setor)";
      if (setor.trim() && !setorFuzzyMatch(k, setor)) continue;
      const slot = map.get(k) || { aguardando: 0, tratativa: 0 };
      if (r.devolucao === "AGUARDANDO") slot.aguardando++;
      else slot.tratativa++;
      map.set(k, slot);
    }
    const itens = [...map.entries()]
      .map(([nome, v]) => ({
        setor: nome,
        aguardando: v.aguardando,
        tratativa: v.tratativa,
        total: v.aguardando + v.tratativa,
      }))
      .sort((a, b) => b.total - a.total);
    return { query: setor || null, itens };
  }

  private filtroPlanosEscopo(
    usuario: UsuarioLogado,
  ): Prisma.PlanoAcaoWhereInput | null {
    if (usuario.perfil !== "responsavel_setor") return null;
    if (!usuario.setores.length) return { id: "__nenhum__" };
    return { setorResp: { nome: { in: usuario.setores } } };
  }

  private async planosListar(
    args: Record<string, unknown>,
    usuario: UsuarioLogado,
  ) {
    const partes: Prisma.PlanoAcaoWhereInput[] = [];
    const escopoPlano = this.filtroPlanosEscopo(usuario);
    if (escopoPlano) partes.push(escopoPlano);
    if (
      args.status === "aberto" ||
      args.status === "em_andamento" ||
      args.status === "concluido" ||
      args.status === "cancelado"
    ) {
      partes.push({ status: args.status });
    }
    if (typeof args.sku === "string" && args.sku.trim()) {
      const r = await this.skuResolver(args.sku);
      const codigo =
        r.encontrado && "melhor" in r && r.melhor
          ? r.melhor.sku
          : args.sku.trim();
      partes.push({
        produto: { codigo: { equals: codigo, mode: "insensitive" } },
      });
    }
    const where: Prisma.PlanoAcaoWhereInput =
      partes.length === 0
        ? {}
        : partes.length === 1
          ? partes[0]
          : { AND: partes };
    const take = Math.min(Math.max(Number(args.limite) || 15, 1), 30);
    const planos = await this.prisma.planoAcao.findMany({
      where,
      orderBy: { criadoEm: "desc" },
      take,
      include: {
        causa: { select: { nome: true } },
        produto: { select: { codigo: true } },
        card: { select: { taskId: true, statusExterno: true } },
        _count: { select: { reclamacoes: true } },
      },
    });
    return {
      itens: planos.map((p) => ({
        id: p.id,
        titulo: p.titulo,
        status: p.status,
        sku: p.produto?.codigo ?? "",
        causa: p.causa?.nome ?? "",
        vinculados: p._count.reclamacoes,
        clickup: p.card
          ? { taskId: p.card.taskId, status: p.card.statusExterno }
          : null,
      })),
    };
  }

  private async planoStatus(token: string, usuario: UsuarioLogado) {
    const t = token.trim();
    if (!t) return { erro: "Informe id, título ou SKU do plano" };
    const escopoPlano = this.filtroPlanosEscopo(usuario);
    const comEscopo = (
      w: Prisma.PlanoAcaoWhereInput,
    ): Prisma.PlanoAcaoWhereInput =>
      escopoPlano ? { AND: [w, escopoPlano] } : w;
    const include = {
      causa: { select: { nome: true } },
      produto: { select: { codigo: true, nome: true } },
      efeitos: { orderBy: { calculadoEm: "desc" as const }, take: 1 },
      card: {
        select: {
          taskId: true,
          statusExterno: true,
          listaId: true,
          ultimoErro: true,
        },
      },
      _count: { select: { reclamacoes: true } },
    };
    const plano =
      (await this.prisma.planoAcao.findFirst({
        where: comEscopo({ id: t }),
        include,
      })) ||
      (await this.prisma.planoAcao.findFirst({
        where: comEscopo({
          OR: [
            { titulo: { contains: t, mode: "insensitive" } },
            {
              produto: {
                codigo: {
                  contains: t.replace(/[^a-zA-Z0-9]/g, ""),
                  mode: "insensitive",
                },
              },
            },
          ],
        }),
        orderBy: { criadoEm: "desc" },
        include,
      }));
    if (!plano) return { encontrado: false, token: t };
    const efeito = plano.efeitos[0];
    return {
      encontrado: true,
      id: plano.id,
      titulo: plano.titulo,
      status: plano.status,
      sku: plano.produto?.codigo ?? "",
      produto: plano.produto?.nome ?? "",
      causa: plano.causa?.nome ?? "",
      vinculados: plano._count.reclamacoes,
      efeito: efeito
        ? {
            resultado: efeito.resultado,
            quedaPercentual: Number(efeito.quedaPercentual),
            antes: efeito.ocorrenciasAntes,
            depois: efeito.ocorrenciasDepois,
          }
        : null,
      clickup: plano.card
        ? {
            taskId: plano.card.taskId,
            status: plano.card.statusExterno,
            listaId: plano.card.listaId,
            erro: plano.card.ultimoErro,
            url: plano.card.taskId
              ? `https://app.clickup.com/t/${plano.card.taskId}`
              : null,
          }
        : null,
    };
  }

  private async clickupCard(
    token: string,
    tipo: string,
    usuario: UsuarioLogado,
  ) {
    const t = token.trim();
    if (!t) return { erro: "Informe nº da reclamação ou plano/SKU" };

    const tentarPlano = async () => {
      const p = await this.planoStatus(t, usuario);
      if (!p || !("encontrado" in p) || !p.encontrado) return null;
      return {
        tipo: "plano" as const,
        ref: { id: p.id, titulo: p.titulo, sku: p.sku },
        card: p.clickup,
      };
    };

    const tentarRec = async () => {
      const st = await this.reclamacaoStatus(t, usuario);
      if (!st || !("encontrado" in st) || !st.encontrado) return null;
      return {
        tipo: "reclamacao" as const,
        ref: { reg: st.reg, sku: st.sku },
        card: st.clickup,
      };
    };

    if (tipo === "plano") {
      const r = await tentarPlano();
      return r || { encontrado: false, token: t };
    }
    if (tipo === "reclamacao") {
      const r = await tentarRec();
      return r || { encontrado: false, token: t };
    }

    if (
      /^\d+$/.test(t.replace(/\D/g, "")) &&
      t.replace(/\D/g, "").length <= 6
    ) {
      const r = await tentarRec();
      if (r) return r;
    }
    const p = await tentarPlano();
    if (p) return p;
    const r = await tentarRec();
    return r || { encontrado: false, token: t };
  }

  private async ppmQualidade(de: string, ate: string, usuario: UsuarioLogado) {
    const linhas = await this.carregarPeriodo(de, ate, usuario);
    const porSku = new Map<string, number>();
    for (const r of linhas) {
      const sku = r.produto?.codigo || "(sem sku)";
      porSku.set(sku, (porSku.get(sku) || 0) + 1);
    }
    const vendas = await this.prisma.vendaDia.groupBy({
      by: ["sku"],
      where: { data: { gte: dia(de), lte: dia(ate) } },
      _sum: { quantidade: true },
    });
    const vendMap = new Map(
      vendas.map((v) => [normSku(v.sku), v._sum.quantidade || 0]),
    );
    const itens = [...porSku.entries()]
      .map(([sku, reclamacoes]) => {
        const vend = vendMap.get(normSku(sku)) || 0;
        const ppm = vend > 0 ? (reclamacoes / vend) * 1_000_000 : null;
        return { sku, reclamacoes, vendas: vend, ppm };
      })
      .sort((a, b) => b.reclamacoes - a.reclamacoes)
      .slice(0, 12);

    const totalRec = linhas.length;
    const totalVend = [...vendMap.values()].reduce((a, b) => a + b, 0);
    return {
      de,
      ate,
      total_reclamacoes: totalRec,
      total_vendas: totalVend,
      ppm_geral: totalVend > 0 ? (totalRec / totalVend) * 1_000_000 : null,
      top: itens,
    };
  }
}

/** Monta UsuarioLogado a partir do registro Prisma do gestor autorizado. */
export function usuarioGestorDe(u: {
  id: string;
  login: string;
  nome: string;
  perfil: UsuarioLogado["perfil"];
  modoTreino: boolean;
  setores: { setor: { nome: string } }[];
  marcas: { marca: { nome: string } }[];
  permissoes: { chave: string; permitido: boolean }[];
}): UsuarioLogado {
  return {
    id: u.id,
    login: u.login,
    nome: u.nome,
    perfil: u.perfil,
    setores: u.setores.map((s) => s.setor.nome),
    marcas: u.marcas.map((m) => m.marca.nome),
    modoTreino:
      (u.perfil === "administrador" || u.perfil === "gestor") &&
      u.modoTreino === true,
    permissoes: mesclarPermissoes(u.perfil, u.permissoes),
  };
}

export { normSku, resolverPeriodo, setorFuzzyMatch };
