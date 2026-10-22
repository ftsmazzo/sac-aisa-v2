import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import { type Prisma, PrismaClient } from "@prisma/client";
import { type PedidoComUsuario, Requer } from "./auth.guard";
import { ServicoClickup } from "./clickup";
import {
  lerEntradaEstado,
  type RepositorioJornada,
  ServicoJornada,
} from "./jornada";
import { ErroEscrita } from "./reclamacoes-escrita";

const ISO = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const DIA = (s: string | null) => (s ? new Date(`${s}T00:00:00.000Z`) : null);

/** Mudança de estado pelo Prisma: estado, histórico, auditoria e a marca do ClickUp numa transação só. */
export class RepositorioJornadaPrisma implements RepositorioJornada {
  constructor(private readonly prisma: PrismaClient) {}

  async obter(where: Prisma.ReclamacaoWhereInput) {
    const r = await this.prisma.reclamacao.findFirst({
      where,
      select: {
        id: true,
        numero: true,
        estado: true,
        devolucao: true,
        dataAbertura: true,
        dataAcao: true,
        setorRespId: true,
      },
    });
    if (!r) return null;
    return {
      ...r,
      dataAbertura: ISO(r.dataAbertura) as string,
      dataAcao: ISO(r.dataAcao),
    };
  }

  async gravar(args: Parameters<RepositorioJornada["gravar"]>[0]) {
    await this.prisma.$transaction(async (tx) => {
      // Só grava se o estado ainda é o que a pessoa viu: duas mudanças ao mesmo tempo não se atropelam.
      const r = await tx.reclamacao.updateMany({
        where: { id: args.id, estado: args.de },
        data: {
          estado: args.para,
          estadoDesde: new Date(),
          dataAcao: DIA(args.dataAcao),
          situacao: args.situacao,
          alteradoPorId: args.auditoria.usuarioId,
        },
      });
      if (r.count === 0) {
        throw new ErroEscrita(
          400,
          "A reclamação mudou enquanto você agia. Recarregue a ficha.",
        );
      }
      await tx.estadoHistorico.create({
        data: {
          reclamacaoId: args.id,
          de: args.de,
          para: args.para,
          autorId: args.auditoria.usuarioId,
          autorNome: args.auditoria.usuarioNome,
          motivo: args.motivo,
          origem: "web",
          reabertura: args.reabertura,
        },
      });
      await tx.clickupCard.updateMany({
        where: { reclamacaoId: args.id },
        data: { precisaSync: true },
      });
      await tx.auditoria.create({
        data: {
          usuarioId: args.auditoria.usuarioId,
          usuarioNome: args.auditoria.usuarioNome,
          acao: args.auditoria.acao,
          alvo: args.auditoria.alvo,
          detalhe: args.auditoria.detalhe,
          reclamacaoId: args.auditoria.reclamacaoId,
          extra: args.auditoria.extra as unknown as Prisma.InputJsonValue,
        },
      });
    });
  }
}

/**
 * Qualquer perfil logado chega aqui; a matriz do domínio decide o que cada um pode, no servidor.
 * Depois de gravar, o card do ClickUp é atualizado sem segurar a resposta.
 */
@Controller("reclamacoes")
export class ControladorJornada {
  private readonly servico: ServicoJornada;

  constructor(
    @Inject(PrismaClient) prisma: PrismaClient,
    @Inject(ServicoClickup) private readonly clickup: ServicoClickup,
  ) {
    this.servico = new ServicoJornada(new RepositorioJornadaPrisma(prisma));
  }

  @Requer("reclamacoes.ver")
  @Post(":id/estado")
  @HttpCode(200)
  async mudar(
    @Param("id") id: string,
    @Body() corpo: unknown,
    @Req() req: PedidoComUsuario,
  ) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
      throw new NotFoundException("Reclamação não encontrada.");
    }
    const r = lerEntradaEstado(corpo);
    if (!r.ok) throw new BadRequestException(r.mensagem);
    if (!req.usuario) throw new BadRequestException("Sessão ausente.");
    const usuario = req.usuario;
    try {
      const feito = await this.servico.mudar(id, r.entrada, usuario);
      void this.clickup.reclamacaoMudou(id).catch(() => undefined);
      return feito;
    } catch (e) {
      if (!(e instanceof ErroEscrita)) throw e;
      if (e.status === 403) throw new ForbiddenException(e.message);
      if (e.status === 404) throw new NotFoundException(e.message);
      throw new BadRequestException(e.message);
    }
  }
}
