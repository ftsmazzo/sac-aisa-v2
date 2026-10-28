import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import {
  efeitoDoPlano,
  lerEntradaPlano,
  podeEnviarPlano,
  tituloPlanoDoSku,
} from "@sac-aisa/domain";
import { type PedidoComUsuario, Requer } from "./auth.guard";
import { ServicoIntegracoes } from "./integracoes";
import { filtroDeTreino } from "./reclamacoes";

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const DIA = 86_400_000;
const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const MAX_VINCULOS = 30;

function usuarioDe(req: PedidoComUsuario) {
  if (!req.usuario) throw new BadRequestException("Sessão ausente.");
  return req.usuario;
}

function dia(d: Date): Date {
  return new Date(`${d.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

function diaIso(s: string): Date {
  return new Date(`${s.slice(0, 10)}T00:00:00.000Z`);
}

/** Card do plano no ClickUp, na lista do setor ou na lista padrão. Sem criar status. */
export async function cardDoPlano(
  prisma: PrismaClient,
  integr: ServicoIntegracoes,
  planoId: string,
  http: typeof fetch = fetch,
): Promise<"criado" | "treino" | "sem_token" | "sem_lista" | "falha"> {
  const plano = await prisma.planoAcao.findUnique({
    where: { id: planoId },
    include: {
      card: true,
      setorResp: { select: { nome: true } },
      reclamacoes: { select: { reclamacao: { select: { treino: true } } } },
    },
  });
  if (!plano) return "falha";
  if (plano.card?.taskId) return "criado";
  const cfg = await integr.config("clickup");
  const treinos = plano.reclamacoes.map((l) => l.reclamacao.treino);
  if (!podeEnviarPlano(treinos, cfg.criarCardsTreino === true)) return "treino";
  const token = await integr.segredo("clickup", "token");
  if (!token) return "sem_token";
  const doSetor = plano.setorRespId
    ? await prisma.clickupConfig.findUnique({
        where: { setorId: plano.setorRespId },
      })
    : null;
  const padrao = await prisma.clickupConfig.findFirst({
    where: { listaPadrao: true },
  });
  const listaId = doSetor?.listaId || padrao?.listaId;
  if (!listaId) {
    await gravarFalha(
      prisma,
      plano.id,
      "Sem lista do setor e sem lista padrão.",
    );
    return "sem_lista";
  }
  try {
    const r = await http(
      `https://api.clickup.com/api/v2/list/${encodeURIComponent(listaId)}/task`,
      {
        method: "POST",
        headers: { Authorization: token, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: plano.titulo.slice(0, 200),
          markdown_description: [
            plano.descricao,
            plano.setorResp ? `Setor: ${plano.setorResp.nome}` : "",
          ]
            .filter(Boolean)
            .join("\n\n"),
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    const json = (await r.json().catch(() => null)) as { id?: unknown } | null;
    if (r.status !== 200 || typeof json?.id !== "string") {
      await gravarFalha(prisma, plano.id, `O ClickUp respondeu ${r.status}.`);
      return "falha";
    }
    await prisma.clickupCard.upsert({
      where: { planoId: plano.id },
      create: {
        planoId: plano.id,
        taskId: json.id,
        listaId,
        precisaSync: false,
      },
      update: {
        taskId: json.id,
        listaId,
        ultimoErro: null,
        precisaSync: false,
      },
    });
    return "criado";
  } catch {
    await gravarFalha(prisma, plano.id, "Sem resposta do ClickUp.");
    return "falha";
  }
}

async function gravarFalha(
  prisma: PrismaClient,
  planoId: string,
  erro: string,
) {
  await prisma.clickupCard.upsert({
    where: { planoId },
    create: {
      planoId,
      ultimoErro: erro,
      proximaTentativaEm: new Date(Date.now() + 60 * 60_000),
    },
    update: { ultimoErro: erro },
  });
}

@Controller("planos")
export class ControladorPlanos {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(ServicoIntegracoes) private readonly integr: ServicoIntegracoes,
  ) {}

  @Requer("planos.ver")
  @Get()
  async listar() {
    const planos = await this.prisma.planoAcao.findMany({
      orderBy: { criadoEm: "desc" },
      take: 100,
      include: {
        causa: { select: { nome: true } },
        produto: { select: { codigo: true, nome: true } },
        efeitos: { orderBy: { calculadoEm: "desc" }, take: 1 },
        card: { select: { taskId: true, ultimoErro: true } },
        _count: { select: { reclamacoes: true } },
      },
    });
    return {
      itens: planos.map((p) => ({
        id: p.id,
        titulo: p.titulo,
        descricao: p.descricao,
        status: p.status,
        origem: p.origem,
        causa: p.causa?.nome ?? null,
        produto: p.produto ? `${p.produto.codigo} · ${p.produto.nome}` : null,
        vinculados: p._count.reclamacoes,
        efeito: p.efeitos[0]
          ? {
              resultado: p.efeitos[0].resultado,
              quedaPercentual: Number(p.efeitos[0].quedaPercentual),
              antes: p.efeitos[0].ocorrenciasAntes,
              depois: p.efeitos[0].ocorrenciasDepois,
            }
          : null,
        card: p.card?.taskId ? "criado" : (p.card?.ultimoErro ?? null),
      })),
    };
  }

  /**
   * Pré-preenche o formulário a partir do SKU (coeficiente → Abrir plano).
   * Sugere a causa mais frequente no período e até 30 reclamações do recorte.
   */
  @Requer("planos.gerir")
  @Get("preencher")
  async preencher(
    @Query() query: Record<string, string | undefined>,
    @Req() req: PedidoComUsuario,
  ) {
    const u = usuarioDe(req);
    const sku = (query.sku ?? "").trim();
    if (!sku || sku.length > 64) {
      throw new BadRequestException("Informe o SKU do produto.");
    }
    const produto =
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
    if (!produto) throw new NotFoundException("Produto não encontrado.");
    const temPeriodo =
      (query.de && DIA_ISO.test(query.de)) ||
      (query.ate && DIA_ISO.test(query.ate));
    const fim =
      query.ate && DIA_ISO.test(query.ate)
        ? diaIso(query.ate)
        : dia(new Date());
    const inicio =
      query.de && DIA_ISO.test(query.de)
        ? diaIso(query.de)
        : temPeriodo
          ? new Date(fim.getTime() - 30 * DIA)
          : new Date(fim.getTime() - 365 * DIA);
    if (inicio.getTime() > fim.getTime()) {
      throw new BadRequestException("O período do plano está invertido.");
    }
    // Mesma visão do coeficiente/relatório: modo treino só vê treino.
    const casos = await this.prisma.reclamacao.findMany({
      where: {
        rascunho: false,
        ...filtroDeTreino({
          perfil: u.perfil,
          setores: u.setores,
          marcas: u.marcas,
          treino: u.modoTreino,
        }),
        produtoId: produto.id,
        dataAbertura: { gte: inicio, lte: fim },
      },
      select: { id: true, causaId: true },
      orderBy: { dataAbertura: "desc" },
      take: 200,
    });
    const contagem = new Map<string, number>();
    for (const c of casos) {
      if (!c.causaId) continue;
      contagem.set(c.causaId, (contagem.get(c.causaId) ?? 0) + 1);
    }
    let causaId: string | null = null;
    let melhor = 0;
    for (const [id, n] of contagem) {
      if (n > melhor) {
        melhor = n;
        causaId = id;
      }
    }
    const causa = causaId
      ? await this.prisma.causa.findUnique({
          where: { id: causaId },
          select: {
            id: true,
            nome: true,
            acao: true,
            setorId: true,
            regra: { select: { setorId: true, acao: true } },
          },
        })
      : null;
    const setorRespId = causa?.regra?.setorId ?? causa?.setorId ?? null;
    const acao = (causa?.regra?.acao ?? causa?.acao ?? "").trim();
    const doRecorte = causaId
      ? casos.filter((c) => c.causaId === causaId).slice(0, MAX_VINCULOS)
      : casos.slice(0, MAX_VINCULOS);
    const descricao =
      acao ||
      (casos.length > 0
        ? `Investigar a causa raiz das ${casos.length} ocorrência(s) do SKU ${produto.codigo} e definir ações preventivas no processo.`
        : `Investigar a causa raiz das reclamações do SKU ${produto.codigo} e definir ações preventivas no processo.`);
    return {
      sku: produto.codigo,
      produtoId: produto.id,
      produtoNome: produto.nome,
      bancadaId: produto.bancadaId,
      bancada: produto.bancada
        ? `${produto.bancada.codigo}${produto.bancada.nome ? ` · ${produto.bancada.nome}` : ""}`
        : null,
      causaId: causa?.id ?? null,
      causaNome: causa?.nome ?? null,
      acao,
      setorRespId,
      titulo: tituloPlanoDoSku(produto.codigo, produto.nome),
      descricao,
      origem: "kpi" as const,
      baselineInicio: inicio.toISOString().slice(0, 10),
      baselineFim: fim.toISOString().slice(0, 10),
      reclamacaoIds: doRecorte.map((c) => c.id),
      ocorrencias: casos.length,
      modoTreino: u.modoTreino === true,
    };
  }

  @Requer("planos.gerir")
  @Post()
  async criar(@Body() corpo: unknown, @Req() req: PedidoComUsuario) {
    const u = usuarioDe(req);
    const lido = lerEntradaPlano(corpo);
    if (!lido.ok) throw new BadRequestException(lido.mensagem);
    const e = lido.valor;

    const produtoId = e.produtoId;
    let bancadaId = e.bancadaId;
    let setorRespId = e.setorRespId;
    let descricao = e.descricao;

    if (produtoId) {
      const p = await this.prisma.produto.findUnique({
        where: { id: produtoId },
        select: { id: true, bancadaId: true },
      });
      if (!p) throw new BadRequestException("Produto não encontrado.");
      if (!bancadaId) bancadaId = p.bancadaId;
    }
    if (e.causaId) {
      const causa = await this.prisma.causa.findUnique({
        where: { id: e.causaId },
        select: {
          id: true,
          acao: true,
          setorId: true,
          regra: { select: { setorId: true, acao: true } },
        },
      });
      if (!causa) throw new BadRequestException("Causa não encontrada.");
      if (!setorRespId) {
        setorRespId = causa.regra?.setorId ?? causa.setorId;
      }
      if (!descricao) {
        descricao = (causa.regra?.acao ?? causa.acao ?? "").trim();
      }
    }
    if (bancadaId) {
      const b = await this.prisma.bancada.findUnique({
        where: { id: bancadaId },
        select: { id: true },
      });
      if (!b) throw new BadRequestException("Bancada não encontrada.");
    }
    if (setorRespId) {
      const s = await this.prisma.setor.findUnique({
        where: { id: setorRespId },
        select: { id: true },
      });
      if (!s) throw new BadRequestException("Setor não encontrado.");
    }

    const fim = e.baselineFim ? diaIso(e.baselineFim) : dia(new Date());
    const inicio = e.baselineInicio
      ? diaIso(e.baselineInicio)
      : new Date(fim.getTime() - 30 * DIA);

    const filtroTreino = filtroDeTreino({
      perfil: u.perfil,
      setores: u.setores,
      marcas: u.marcas,
      treino: u.modoTreino,
    });

    let reclamacaoIds = e.reclamacaoIds;
    // Autovínculo só no fluxo KPI (coeficiente). Manual só vincula IDs explícitos.
    if (
      reclamacaoIds.length === 0 &&
      e.origem === "kpi" &&
      (produtoId || e.causaId || bancadaId)
    ) {
      const ligados = await this.prisma.reclamacao.findMany({
        where: {
          rascunho: false,
          ...filtroTreino,
          dataAbertura: { gte: inicio, lte: fim },
          ...(produtoId ? { produtoId } : {}),
          ...(e.causaId ? { causaId: e.causaId } : {}),
          ...(bancadaId ? { bancadaId } : {}),
        },
        select: { id: true },
        orderBy: { dataAbertura: "desc" },
        take: MAX_VINCULOS,
      });
      reclamacaoIds = ligados.map((r) => r.id);
    } else if (reclamacaoIds.length > 0) {
      const ok = await this.prisma.reclamacao.findMany({
        where: {
          id: { in: reclamacaoIds },
          rascunho: false,
          ...filtroTreino,
        },
        select: { id: true },
      });
      if (ok.length !== reclamacaoIds.length) {
        throw new BadRequestException(
          "Uma ou mais reclamações do plano não existem.",
        );
      }
    }

    const plano = await this.prisma.planoAcao.create({
      data: {
        titulo: e.titulo,
        descricao,
        causaId: e.causaId,
        produtoId,
        bancadaId,
        setorRespId,
        origem: e.origem,
        prioridade: e.prioridade,
        responsavel: e.responsavel,
        prazo: e.prazo ? diaIso(e.prazo) : null,
        baselineInicio: inicio,
        baselineFim: fim,
        criadoPorId: u.id,
        reclamacoes: {
          create: reclamacaoIds.map((reclamacaoId) => ({ reclamacaoId })),
        },
      },
    });
    return { id: plano.id, vinculados: reclamacaoIds.length };
  }

  @Requer("planos.gerir")
  @Post(":id/efeito")
  async medir(@Param("id") id: string) {
    if (!ID.test(id)) throw new NotFoundException("Plano não encontrado.");
    const plano = await this.prisma.planoAcao.findUnique({ where: { id } });
    if (!plano) throw new NotFoundException("Plano não encontrado.");
    if (!plano.causaId && !plano.produtoId && !plano.bancadaId) {
      throw new BadRequestException(
        "O plano precisa de causa, produto ou bancada para medir o efeito.",
      );
    }
    const fim = plano.baselineFim ?? dia(plano.criadoEm);
    const inicio = plano.baselineInicio ?? new Date(fim.getTime() - 30 * DIA);
    const dias = Math.max(
      1,
      Math.round((fim.getTime() - inicio.getTime()) / DIA),
    );
    const depoisInicio = new Date(fim.getTime() + DIA);
    const depoisFim = new Date(depoisInicio.getTime() + dias * DIA);
    const onde = {
      rascunho: false,
      treino: false,
      ...(plano.causaId ? { causaId: plano.causaId } : {}),
      ...(plano.produtoId ? { produtoId: plano.produtoId } : {}),
      ...(plano.bancadaId ? { bancadaId: plano.bancadaId } : {}),
    };
    const [antes, depois] = await Promise.all([
      this.prisma.reclamacao.count({
        where: { ...onde, dataAbertura: { gte: inicio, lte: fim } },
      }),
      this.prisma.reclamacao.count({
        where: {
          ...onde,
          dataAbertura: { gte: depoisInicio, lte: depoisFim },
        },
      }),
    ]);
    const efeito = efeitoDoPlano(antes, depois);
    await this.prisma.$transaction([
      this.prisma.planoEfeito.create({
        data: {
          planoId: plano.id,
          antesInicio: inicio,
          antesFim: fim,
          depoisInicio,
          depoisFim,
          ocorrenciasAntes: antes,
          ocorrenciasDepois: depois,
          quedaPercentual: efeito.quedaPercentual,
          resultado: efeito.resultado,
        },
      }),
      this.prisma.planoAcao.update({
        where: { id: plano.id },
        data: { status: efeito.reabrir ? "em_andamento" : "concluido" },
      }),
    ]);
    const card = await cardDoPlano(this.prisma, this.integr, plano.id);
    return { ...efeito, antes, depois, card };
  }
}
