import type { IncomingMessage } from "node:http";
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
  Param,
  Post,
  Put,
  Req,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import { type PedidoComUsuario, Publico, Requer } from "./auth.guard";
import {
  type DadosAnalise,
  type DadosCard,
  ErroWebhook,
  type FilaDoClickup,
  type ItemFila,
  iniciarFila,
  MAX_TENTATIVAS,
  type RepositorioClickup,
  ServicoClickup,
  ServicoWebhookClickup,
} from "./clickup";
import {
  type AuditoriaIntegracao,
  type ChaveIntegracao,
  chaveValida,
  ErroIntegracao,
  exigirAdministrador,
  lerEntradaIntegracao,
  type RegistroIntegracao,
  type RepositorioIntegracoes,
  type SegredoGravado,
  ServicoIntegracoes,
} from "./integracoes";

const DIA = (s: string | null) => (s ? new Date(`${s}T00:00:00.000Z`) : null);
const ISO = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

function dadosAuditoria(a: AuditoriaIntegracao) {
  return {
    usuarioId: a.usuarioId,
    usuarioNome: a.usuarioNome,
    acao: a.acao,
    alvo: a.alvo,
    detalhe: a.detalhe,
    extra: a.extra as Prisma.InputJsonValue,
  };
}

function objeto(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

/** Integrações pelo Prisma: o dado e a auditoria entram na mesma transação. */
export class RepositorioIntegracoesPrisma implements RepositorioIntegracoes {
  constructor(private readonly prisma: PrismaClient) {}

  async obter(chave: ChaveIntegracao): Promise<RegistroIntegracao | null> {
    const r = await this.prisma.integracaoConfig.findUnique({
      where: { chave },
    });
    if (!r) return null;
    return {
      chave,
      config: objeto(r.config),
      segredos: objeto(r.segredos) as Record<string, SegredoGravado>,
      estado: r.estado as RegistroIntegracao["estado"],
      ultimoErro: r.ultimoErro,
      testadoEm: r.testadoEm,
    };
  }

  async gravar(args: Parameters<RepositorioIntegracoes["gravar"]>[0]) {
    if (args.listas) {
      const ids = Object.keys(args.listas);
      const existentes = await this.prisma.setor.count({
        where: { id: { in: ids } },
      });
      if (existentes !== ids.length) {
        throw new ErroIntegracao(400, "Setor inexistente.");
      }
    }
    await this.prisma.$transaction(async (tx) => {
      const dados = {
        config: args.config as Prisma.InputJsonValue,
        segredos: args.segredos as unknown as Prisma.InputJsonValue,
        estado: "pendente",
        ultimoErro: null,
        alteradoPorId: args.usuarioId,
      };
      await tx.integracaoConfig.upsert({
        where: { chave: args.chave },
        create: { chave: args.chave, ...dados },
        update: dados,
      });
      for (const [setorId, listaId] of Object.entries(args.listas ?? {})) {
        if (listaId === "") {
          await tx.clickupConfig.deleteMany({ where: { setorId } });
        } else {
          await tx.clickupConfig.upsert({
            where: { setorId },
            create: { setorId, listaId },
            update: { listaId },
          });
        }
      }
      await tx.auditoria.create({ data: dadosAuditoria(args.auditoria) });
    });
  }

  async gravarTeste(
    args: Parameters<RepositorioIntegracoes["gravarTeste"]>[0],
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.integracaoConfig.upsert({
        where: { chave: args.chave },
        create: {
          chave: args.chave,
          estado: args.estado,
          ultimoErro: args.ultimoErro,
          testadoEm: args.testadoEm,
        },
        update: {
          estado: args.estado,
          ultimoErro: args.ultimoErro,
          testadoEm: args.testadoEm,
        },
      });
      await tx.auditoria.create({ data: dadosAuditoria(args.auditoria) });
    });
  }

  setores() {
    return this.prisma.setor.findMany({
      where: { ativo: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    });
  }

  async listas() {
    const l = await this.prisma.clickupConfig.findMany({
      select: { setorId: true, listaId: true },
    });
    return Object.fromEntries(l.map((x) => [x.setorId, x.listaId]));
  }
}

/** Cards e eventos do ClickUp pelo Prisma. */
export class RepositorioClickupPrisma implements RepositorioClickup {
  constructor(private readonly prisma: PrismaClient) {}

  async carregarCard(reclamacaoId: string): Promise<DadosCard | null> {
    const c = await this.prisma.clickupCard.findUnique({
      where: { reclamacaoId },
      include: {
        reclamacao: {
          select: {
            id: true,
            numero: true,
            descricao: true,
            setorRespId: true,
            pedido: true,
            dataAbertura: true,
            setorResp: { select: { nome: true } },
            marca: { select: { nome: true } },
            canal: { select: { nome: true } },
            produto: { select: { codigo: true, nome: true } },
            causa: { select: { nome: true } },
            situacao: true,
            estado: true,
            devolucao: true,
            custo: true,
          },
        },
        comentarios: {
          where: { enviadoEm: null },
          orderBy: { criadoEm: "asc" },
          select: { id: true, texto: true },
        },
      },
    });
    if (!c?.reclamacao) return null;
    const r = c.reclamacao;
    const n = (v: unknown) => (v == null ? 0 : Number(v));
    return {
      cardId: c.id,
      taskId: c.taskId,
      listaId: c.listaId,
      statusExterno: c.statusExterno,
      tentativas: c.tentativas,
      precisaSync: c.precisaSync,
      comentarios: c.comentarios,
      reclamacao: {
        situacao: r.situacao,
        estado: r.estado,
        devolucao: r.devolucao,
        custoTotal: r.custo
          ? n(r.custo.freteEnvio) +
            n(r.custo.freteRetorno) +
            n(r.custo.valorPeca) +
            n(r.custo.estorno) +
            n(r.custo.desconto) +
            n(r.custo.guia)
          : 0,
        id: r.id,
        numero: r.numero,
        descricao: r.descricao,
        setorRespId: r.setorRespId,
        setorNome: r.setorResp?.nome ?? "",
        marca: r.marca?.nome ?? "",
        canal: r.canal.nome,
        produto: r.produto ? `${r.produto.codigo} ${r.produto.nome}` : "",
        causa: r.causa?.nome ?? "",
        pedido: r.pedido,
        dataAbertura: ISO(r.dataAbertura) ?? "",
      },
    };
  }

  async registrarCriado(
    args: Parameters<RepositorioClickup["registrarCriado"]>[0],
  ) {
    await this.prisma.clickupCard.update({
      where: { id: args.cardId },
      data: {
        taskId: args.taskId,
        listaId: args.listaId,
        statusExterno: args.statusExterno,
        sincronizadoEm: args.agora,
        tentativas: { increment: 1 },
        ultimoErro: null,
        proximaTentativaEm: null,
      },
    });
  }

  async registrarFalha(
    args: Parameters<RepositorioClickup["registrarFalha"]>[0],
  ) {
    await this.prisma.clickupCard.update({
      where: { id: args.cardId },
      data: {
        ultimoErro: args.erro,
        proximaTentativaEm: args.proxima,
        tentativas: args.contarTentativa ? { increment: 1 } : undefined,
      },
    });
  }

  async marcarSync(args: Parameters<RepositorioClickup["marcarSync"]>[0]) {
    const c = await this.prisma.clickupCard.findUnique({
      where: { reclamacaoId: args.reclamacaoId },
      select: { id: true, proximaTentativaEm: true, tentativas: true },
    });
    if (!c) return;
    // Esgotado (passou de todas as tentativas) só volta pelo botão "Tentar de novo".
    const esgotado = c.tentativas >= MAX_TENTATIVAS;
    await this.prisma.clickupCard.update({
      where: { id: c.id },
      data: {
        precisaSync: true,
        proximaTentativaEm:
          c.proximaTentativaEm ?? (esgotado ? null : args.agora),
        comentarios: {
          create: args.comentarios.map((texto) => ({ texto })),
        },
      },
    });
  }

  async comentarioEnviado(id: string, agora: Date) {
    await this.prisma.clickupComentario.update({
      where: { id },
      data: { enviadoEm: agora },
    });
  }

  async registrarSincronizado(
    args: Parameters<RepositorioClickup["registrarSincronizado"]>[0],
  ) {
    await this.prisma.clickupCard.update({
      where: { id: args.cardId },
      data: {
        precisaSync: false,
        listaId: args.listaId ?? undefined,
        statusExterno: args.statusExterno ?? undefined,
        sincronizadoEm: args.agora,
        tentativas: 0,
        ultimoErro: null,
        proximaTentativaEm: null,
      },
    });
  }

  async carregarAnalise(analiseId: string): Promise<DadosAnalise | null> {
    const a = await this.prisma.analiseSetor.findUnique({
      where: { id: analiseId },
      select: {
        reclamacaoId: true,
        produtoPrecisaVoltar: true,
        produtoRecebidoEm: true,
        conclusao: true,
        resultado: true,
        setor: { select: { nome: true } },
        reclamacao: { select: { numero: true } },
      },
    });
    if (!a) return null;
    return {
      reclamacaoId: a.reclamacaoId,
      numero: a.reclamacao.numero,
      setorNome: a.setor.nome,
      produtoPrecisaVoltar: a.produtoPrecisaVoltar,
      produtoRecebidoEm: ISO(a.produtoRecebidoEm),
      conclusao: a.conclusao,
      resultado: a.resultado,
    };
  }

  async fila(): Promise<FilaDoClickup> {
    const cards = await this.prisma.clickupCard.findMany({
      where: {
        OR: [
          { taskId: null },
          { precisaSync: true },
          { comentarios: { some: { enviadoEm: null } } },
        ],
      },
      orderBy: { criadoEm: "asc" },
      take: 200,
      select: {
        id: true,
        taskId: true,
        tentativas: true,
        ultimoErro: true,
        proximaTentativaEm: true,
        reclamacao: { select: { numero: true } },
        plano: { select: { titulo: true } },
        _count: { select: { comentarios: { where: { enviadoEm: null } } } },
      },
    });
    const itens: ItemFila[] = cards.map((c) => ({
      cardId: c.id,
      titulo: c.reclamacao
        ? `Reclamação #${c.reclamacao.numero}`
        : (c.plano?.titulo ?? "Card"),
      estado: !c.ultimoErro
        ? "pendente"
        : c.proximaTentativaEm
          ? "erro"
          : "esgotado",
      taskId: c.taskId,
      tentativas: c.tentativas,
      ultimoErro: c.ultimoErro,
      proximaTentativaEm: c.proximaTentativaEm?.toISOString() ?? null,
      comentariosPendentes: c._count.comentarios,
    }));
    const totais = { pendente: 0, erro: 0, esgotado: 0 };
    for (const i of itens) totais[i.estado] += 1;
    return { itens, totais };
  }

  async reenviar(cardId: string | null, agora: Date) {
    const r = await this.prisma.clickupCard.updateMany({
      where: {
        ...(cardId ? { id: cardId } : {}),
        ultimoErro: { not: null },
        OR: [
          { taskId: null },
          { precisaSync: true },
          { comentarios: { some: { enviadoEm: null } } },
        ],
      },
      data: { tentativas: 0, proximaTentativaEm: agora },
    });
    return r.count;
  }

  async pendentes(agora: Date, limite: number) {
    const l = await this.prisma.clickupCard.findMany({
      where: {
        reclamacaoId: { not: null },
        proximaTentativaEm: { lte: agora },
        OR: [
          { taskId: null },
          { precisaSync: true },
          { comentarios: { some: { enviadoEm: null } } },
        ],
      },
      orderBy: { proximaTentativaEm: "asc" },
      take: limite,
      select: { reclamacaoId: true },
    });
    return l.flatMap((x) => (x.reclamacaoId ? [x.reclamacaoId] : []));
  }

  async gravarEvento(
    e: Parameters<RepositorioClickup["gravarEvento"]>[0],
  ): Promise<{ id: string; duplicado: boolean }> {
    try {
      const r = await this.prisma.clickupEvento.create({
        data: {
          taskId: e.taskId,
          tipo: e.tipo,
          payload: e.payload as Prisma.InputJsonValue,
          chave: e.chave,
        },
        select: { id: true },
      });
      return { id: r.id, duplicado: false };
    } catch (erro) {
      // Chave única repetida: a mesma entrega chegou de novo.
      const duplicada =
        e.chave !== null &&
        typeof erro === "object" &&
        erro !== null &&
        (erro as { code?: unknown }).code === "P2002";
      if (!duplicada) throw erro;
      const original = await this.prisma.clickupEvento.update({
        where: { chave: e.chave as string },
        data: { repeticoes: { increment: 1 } },
        select: { id: true },
      });
      return { id: original.id, duplicado: true };
    }
  }

  obterEvento(id: string) {
    return this.prisma.clickupEvento.findUnique({
      where: { id },
      select: {
        id: true,
        taskId: true,
        tipo: true,
        payload: true,
        processadoEm: true,
      },
    });
  }

  async cardPorTaskId(taskId: string) {
    const c = await this.prisma.clickupCard.findUnique({
      where: { taskId },
      select: { id: true, reclamacaoId: true, statusExterno: true },
    });
    return c
      ? {
          cardId: c.id,
          reclamacaoId: c.reclamacaoId,
          statusExterno: c.statusExterno,
        }
      : null;
  }

  async reclamacaoParaStatus(id: string) {
    const r = await this.prisma.reclamacao.findUnique({
      where: { id },
      select: {
        numero: true,
        estado: true,
        dataAbertura: true,
        dataAcao: true,
        devolucao: true,
        setorRespId: true,
      },
    });
    return r
      ? {
          numero: r.numero,
          estado: r.estado,
          dataAbertura: ISO(r.dataAbertura) as string,
          dataAcao: ISO(r.dataAcao),
          devolucao: r.devolucao,
          temSetor: r.setorRespId !== null,
        }
      : null;
  }

  async aplicarStatus(
    args: Parameters<RepositorioClickup["aplicarStatus"]>[0],
  ) {
    await this.prisma.$transaction(async (tx) => {
      if (args.cardId) {
        await tx.clickupCard.update({
          where: { id: args.cardId },
          data: {
            statusExterno: args.statusExterno ?? undefined,
            sincronizadoEm: args.agora,
            // Recusado: o card precisa voltar ao status do estado atual.
            ...(args.corrigirCard ? { precisaSync: true } : {}),
          },
        });
      }
      if (args.reclamacao) {
        const passos = args.reclamacao.passos;
        // Só grava se o estado ainda é o de onde partimos: o SAC pode ter mexido no meio do caminho.
        const r = await tx.reclamacao.updateMany({
          where: { id: args.reclamacao.id, estado: args.reclamacao.de },
          data: {
            estado: passos[passos.length - 1],
            estadoDesde: args.agora,
            dataAcao: DIA(args.reclamacao.dataAcao),
            situacao: args.reclamacao.situacao,
          },
        });
        if (r.count > 0) {
          let de = args.reclamacao.de;
          for (const [i, para] of passos.entries()) {
            await tx.estadoHistorico.create({
              data: {
                reclamacaoId: args.reclamacao.id,
                de,
                para,
                // Um milissegundo a mais por passo mantém a ordem do histórico.
                quando: new Date(args.agora.getTime() + i),
                autorNome: "ClickUp",
                origem: "clickup",
              },
            });
            de = para;
          }
        }
      }
      if (args.auditoria) {
        await tx.auditoria.create({
          data: {
            usuarioNome: "ClickUp",
            acao: args.auditoria.acao,
            alvo: args.auditoria.alvo,
            detalhe: args.auditoria.detalhe,
            reclamacaoId: args.auditoria.reclamacaoId,
            extra: args.auditoria.extra as Prisma.InputJsonValue,
          },
        });
      }
      await tx.clickupEvento.update({
        where: { id: args.eventoId },
        data: { processadoEm: args.agora },
      });
    });
  }
}

/** Liga a fila de nova tentativa do ClickUp quando a API sobe. */
@Injectable()
export class FilaClickup implements OnModuleInit, OnModuleDestroy {
  private parar: (() => void) | null = null;

  constructor(
    @Inject(ServicoClickup) private readonly clickup: ServicoClickup,
  ) {}

  onModuleInit() {
    this.parar = iniciarFila(this.clickup);
  }

  onModuleDestroy() {
    this.parar?.();
  }
}

function usuarioDe(req: PedidoComUsuario) {
  if (!req.usuario) throw new BadRequestException("Sessão ausente.");
  return req.usuario;
}

/** Só o administrador. O serviço confere o perfil de novo: quem decide é o servidor. */
@Controller("admin/integracoes")
export class ControladorIntegracoes {
  constructor(
    @Inject(ServicoIntegracoes) private readonly servico: ServicoIntegracoes,
    @Inject(ServicoClickup) private readonly clickup: ServicoClickup,
  ) {}

  /** Fila de envio ao ClickUp: pendentes, com erro e esgotados. */
  @Requer("integracoes.gerir")
  @Get("clickup/fila")
  filaClickup(@Req() req: PedidoComUsuario) {
    return this.comErros(async () => {
      exigirAdministrador(usuarioDe(req));
      return this.clickup.fila();
    });
  }

  /** "Tentar de novo": um card (`cardId`) ou tudo o que está com erro ou esgotado. */
  @Requer("integracoes.gerir")
  @Post("clickup/fila/reenviar")
  @HttpCode(200)
  reenviarClickup(@Body() corpo: unknown, @Req() req: PedidoComUsuario) {
    const cardId =
      typeof corpo === "object" && corpo !== null && "cardId" in corpo
        ? (corpo as { cardId: unknown }).cardId
        : null;
    if (
      cardId !== null &&
      (typeof cardId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(cardId))
    ) {
      throw new BadRequestException("Card inválido.");
    }
    return this.comErros(async () => {
      exigirAdministrador(usuarioDe(req));
      return { reenviados: await this.clickup.reenviar(cardId) };
    });
  }

  @Requer("integracoes.gerir")
  @Get()
  painel(@Req() req: PedidoComUsuario) {
    return this.comErros(() => this.servico.painel(usuarioDe(req)));
  }

  @Requer("integracoes.gerir")
  @Put(":chave")
  async salvar(
    @Param("chave") chave: string,
    @Body() corpo: unknown,
    @Req() req: PedidoComUsuario,
  ) {
    if (!chaveValida(chave))
      throw new NotFoundException("Integração inexistente.");
    const r = lerEntradaIntegracao(chave, corpo);
    if (!r.ok) throw new BadRequestException(r.mensagem);
    await this.comErros(() =>
      this.servico.salvar(usuarioDe(req), chave, r.entrada),
    );
    return { ok: true };
  }

  @Requer("integracoes.gerir")
  @Post(":chave/testar")
  @HttpCode(200)
  async testar(@Param("chave") chave: string, @Req() req: PedidoComUsuario) {
    if (!chaveValida(chave))
      throw new NotFoundException("Integração inexistente.");
    return this.comErros(() => this.servico.testar(usuarioDe(req), chave));
  }

  private async comErros<T>(f: () => Promise<T>): Promise<T> {
    try {
      return await f();
    } catch (e) {
      if (!(e instanceof ErroIntegracao)) throw e;
      if (e.status === 403) throw new ForbiddenException(e.message);
      if (e.status === 404) throw new NotFoundException(e.message);
      if (e.status === 503) throw new ServiceUnavailableException(e.message);
      throw new BadRequestException(e.message);
    }
  }
}

type PedidoBruto = IncomingMessage & { rawBody?: Buffer };

/** Aviso do ClickUp. Pública, mas só aceita corpo com assinatura válida. */
@Controller("webhooks")
export class ControladorWebhooks {
  constructor(
    @Inject(ServicoWebhookClickup)
    private readonly webhook: ServicoWebhookClickup,
  ) {}

  @Publico()
  @Post("clickup")
  @HttpCode(200)
  async clickup(
    @Req() req: PedidoBruto,
    @Headers("x-signature") assinatura: string | undefined,
  ) {
    try {
      const { id, duplicado } = await this.webhook.receber(
        req.rawBody,
        assinatura,
      );
      // Responde já; o ClickUp não espera o processamento. Entrega repetida é ignorada.
      if (!duplicado) {
        setImmediate(() => {
          this.webhook.processar(id).catch(() => undefined);
        });
      }
      return { ok: true };
    } catch (e) {
      if (e instanceof ErroWebhook) {
        throw new HttpException(e.message, e.status);
      }
      throw e;
    }
  }
}
