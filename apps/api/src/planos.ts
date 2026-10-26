import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { efeitoDoPlano, podeEnviarPlano } from "@sac-aisa/domain";
import { type PedidoComUsuario, Requer } from "./auth.guard";
import { ServicoIntegracoes } from "./integracoes";

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const DIA = 86_400_000;

function usuarioDe(req: PedidoComUsuario) {
  if (!req.usuario) throw new BadRequestException("Sessão ausente.");
  return req.usuario;
}

function dia(d: Date): Date {
  return new Date(`${d.toISOString().slice(0, 10)}T00:00:00.000Z`);
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
        efeitos: { orderBy: { calculadoEm: "desc" }, take: 1 },
        card: { select: { taskId: true, ultimoErro: true } },
      },
    });
    return {
      itens: planos.map((p) => ({
        id: p.id,
        titulo: p.titulo,
        descricao: p.descricao,
        status: p.status,
        causa: p.causa?.nome ?? null,
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

  @Requer("planos.gerir")
  @Post()
  async criar(@Body() corpo: unknown, @Req() req: PedidoComUsuario) {
    const u = usuarioDe(req);
    const c =
      typeof corpo === "object" && corpo !== null
        ? (corpo as Record<string, unknown>)
        : {};
    const titulo = typeof c.titulo === "string" ? c.titulo.trim() : "";
    const descricao = typeof c.descricao === "string" ? c.descricao.trim() : "";
    const causaId = typeof c.causaId === "string" ? c.causaId : "";
    if (titulo.length < 3 || titulo.length > 160) {
      throw new BadRequestException("Dê um título ao plano.");
    }
    if (causaId && !ID.test(causaId)) {
      throw new BadRequestException("Causa inválida.");
    }
    const fim = dia(new Date());
    const inicio = new Date(fim.getTime() - 30 * DIA);
    const plano = await this.prisma.planoAcao.create({
      data: {
        titulo,
        descricao: descricao.slice(0, 4000),
        causaId: causaId || null,
        baselineInicio: inicio,
        baselineFim: fim,
        criadoPorId: u.id,
      },
    });
    return { id: plano.id };
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
