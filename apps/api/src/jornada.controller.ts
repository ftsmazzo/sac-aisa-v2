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
import { papelDe } from "@sac-aisa/domain";
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
        solucao: true,
        respostaEnviadaEm: true,
      },
    });
    if (!r) return null;
    return {
      id: r.id,
      numero: r.numero,
      estado: r.estado,
      devolucao: r.devolucao,
      setorRespId: r.setorRespId,
      solucao: r.solucao,
      respostaEnviada: r.respostaEnviadaEm !== null,
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
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
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

  /** O SAC registra a resposta que foi ao marketplace. Fechar só fica liberado depois disto. */
  @Requer("reclamacoes.ver")
  @Post(":id/resposta")
  @HttpCode(200)
  async resposta(
    @Param("id") id: string,
    @Body() corpo: unknown,
    @Req() req: PedidoComUsuario,
  ) {
    const usuario = this.exigirSac(id, req);
    const texto = lerTexto(corpo, "texto", 4000);
    const r = await this.prisma.reclamacao.findUnique({
      where: { id },
      select: { numero: true, estado: true },
    });
    if (!r) throw new NotFoundException("Reclamação não encontrada.");
    if (r.estado !== "resolvida_setor") {
      throw new BadRequestException(
        "A resposta é enviada quando a reclamação voltou ao SAC.",
      );
    }
    const agora = new Date();
    await this.prisma.$transaction([
      this.prisma.reclamacao.update({
        where: { id },
        data: {
          respostaMarketplace: texto,
          respostaEnviadaEm: agora,
          alteradoPorId: usuario.id,
        },
      }),
      this.prisma.auditoria.create({
        data: {
          usuarioId: usuario.id,
          usuarioNome: usuario.nome,
          acao: "reclamacao.resposta",
          alvo: `Reclamação #${r.numero}`,
          detalhe: "Resposta enviada no marketplace.",
          reclamacaoId: id,
          extra: { texto: texto.slice(0, 500) },
        },
      }),
    ]);
    return { id, enviadaEm: agora.toISOString() };
  }

  /** Depois de fechada: se o cliente confirmou o reparo, o reenvio ou ficou satisfeito. */
  @Requer("reclamacoes.ver")
  @Post(":id/acompanhamento")
  @HttpCode(200)
  async acompanhamento(
    @Param("id") id: string,
    @Body() corpo: unknown,
    @Req() req: PedidoComUsuario,
  ) {
    const usuario = this.exigirSac(id, req);
    const valor = lerAcompanhamento(corpo);
    const r = await this.prisma.reclamacao.findUnique({
      where: { id },
      select: { numero: true, estado: true },
    });
    if (!r) throw new NotFoundException("Reclamação não encontrada.");
    if (r.estado !== "finalizada") {
      throw new BadRequestException(
        "O acompanhamento é feito depois que a reclamação fecha.",
      );
    }
    await this.prisma.$transaction([
      this.prisma.reclamacao.update({
        where: { id },
        data: { acompanhamento: valor, alteradoPorId: usuario.id },
      }),
      this.prisma.auditoria.create({
        data: {
          usuarioId: usuario.id,
          usuarioNome: usuario.nome,
          acao: "reclamacao.acompanhamento",
          alvo: `Reclamação #${r.numero}`,
          detalhe: ROTULO_ACOMPANHAMENTO[valor],
          reclamacaoId: id,
          extra: { valor, rotulo: ROTULO_ACOMPANHAMENTO[valor] },
        },
      }),
    ]);
    return { id, acompanhamento: valor };
  }

  private exigirSac(id: string, req: PedidoComUsuario) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
      throw new NotFoundException("Reclamação não encontrada.");
    }
    if (!req.usuario) throw new BadRequestException("Sessão ausente.");
    if (papelDe(req.usuario.perfil) === "setor") {
      throw new ForbiddenException("Esta etapa é do SAC.");
    }
    return req.usuario;
  }
}

const ROTULO_ACOMPANHAMENTO: Record<string, string> = {
  satisfeito: "Cliente ficou satisfeito.",
  reparo: "Cliente confirmou o reparo.",
  reenvio: "Cliente confirmou o reenvio.",
  insatisfeito: "Cliente não ficou satisfeito.",
};

function lerTexto(corpo: unknown, campo: string, max: number): string {
  const c = (corpo ?? {}) as Record<string, unknown>;
  const v = c[campo];
  if (typeof v !== "string" || v.trim() === "" || v.trim().length > max) {
    throw new BadRequestException(`Informe ${campo}.`);
  }
  return v.trim();
}

function lerAcompanhamento(corpo: unknown): string {
  const c = (corpo ?? {}) as Record<string, unknown>;
  const v = c.valor;
  if (typeof v !== "string" || !(v in ROTULO_ACOMPANHAMENTO)) {
    throw new BadRequestException(
      "Informe satisfeito, reparo, reenvio ou insatisfeito.",
    );
  }
  return v;
}
