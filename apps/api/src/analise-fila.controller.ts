import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import { type Prisma, PrismaClient } from "@prisma/client";
import {
  type AuditoriaAnalise,
  lerAnalise,
  type RepositorioAnalise,
  ServicoAnalise,
} from "./analise-setor";
import { type PedidoComUsuario, Requer } from "./auth.guard";
import {
  type LinhaAberta,
  type RepositorioFila,
  ServicoFilaAlertas,
} from "./fila-alertas";
import { ErroEscrita } from "./reclamacoes-escrita";

const ISO = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const DIA = (s: string | null) => (s ? new Date(`${s}T00:00:00.000Z`) : null);
const NUM = (v: unknown) => (v == null ? 0 : Number(v));

/** Tamanho máximo do que a fila e os alertas varrem de uma vez. */
const LIMITE_ABERTAS = 2000;

function registroAuditoria(a: AuditoriaAnalise) {
  return {
    usuarioId: a.usuarioId,
    usuarioNome: a.usuarioNome,
    acao: a.acao,
    alvo: a.alvo,
    detalhe: a.detalhe,
    reclamacaoId: a.reclamacaoId,
    extra: a.extra as unknown as Prisma.InputJsonValue,
  };
}

/** Análise e auditoria (e o ajuste da devolução) entram na mesma transação. */
export class RepositorioAnalisePrisma implements RepositorioAnalise {
  constructor(private readonly prisma: PrismaClient) {}

  async obterReclamacao(
    where: Parameters<RepositorioAnalise["obterReclamacao"]>[0],
  ) {
    const r = await this.prisma.reclamacao.findFirst({
      where,
      include: { analises: true },
    });
    if (!r) return null;
    return {
      id: r.id,
      numero: r.numero,
      setorRespId: r.setorRespId,
      devolucao: r.devolucao,
      dataAbertura: ISO(r.dataAbertura) as string,
      dataAcao: ISO(r.dataAcao),
      dataRecebimento: ISO(r.dataRecebimento),
      analises: r.analises.map((a) => ({
        id: a.id,
        setorId: a.setorId,
        produtoPrecisaVoltar: a.produtoPrecisaVoltar,
        produtoRecebidoEm: ISO(a.produtoRecebidoEm),
        conclusao: a.conclusao,
        resultado: a.resultado,
      })),
    };
  }

  salvar(args: Parameters<RepositorioAnalise["salvar"]>[0]) {
    return this.prisma.$transaction(async (tx) => {
      const dados = {
        produtoPrecisaVoltar: args.dados.produtoPrecisaVoltar,
        produtoRecebidoEm: DIA(args.dados.produtoRecebidoEm),
        conclusao: args.dados.conclusao,
        resultado: args.dados.resultado,
      };
      const analise = args.analiseId
        ? await tx.analiseSetor.update({
            where: { id: args.analiseId },
            data: dados,
            select: { id: true },
          })
        : await tx.analiseSetor.create({
            data: {
              ...dados,
              reclamacaoId: args.reclamacaoId,
              setorId: args.setorId,
              analisadoPorId: args.usuarioId,
            },
            select: { id: true },
          });
      if (args.reclamacao) {
        await tx.reclamacao.update({
          where: { id: args.reclamacaoId },
          data: {
            devolucao: args.reclamacao.devolucao,
            dataRecebimento: DIA(args.reclamacao.dataRecebimento),
            situacao: args.reclamacao.situacao,
            alteradoPorId: args.usuarioId,
          },
        });
      }
      await tx.auditoria.create({
        data: registroAuditoria(args.auditar(analise.id)),
      });
      return analise;
    });
  }
}

export class RepositorioFilaPrisma implements RepositorioFila {
  constructor(private readonly prisma: PrismaClient) {}

  async abertas(where: Prisma.ReclamacaoWhereInput): Promise<LinhaAberta[]> {
    const linhas = await this.prisma.reclamacao.findMany({
      where,
      take: LIMITE_ABERTAS,
      include: {
        produto: { select: { codigo: true, nome: true } },
        causa: { select: { nome: true } },
        setorResp: { select: { id: true, nome: true } },
        custo: true,
        analises: { select: { setorId: true } },
      },
    });
    return linhas.map((l) => ({
      id: l.id,
      numero: l.numero,
      dataAbertura: ISO(l.dataAbertura) as string,
      devolucao: l.devolucao,
      causaId: l.causaId,
      causaManual: l.causaManual,
      descricao: l.descricao,
      laudo: l.laudo,
      solucao: l.solucao,
      produto: l.produto,
      causaNome: l.causa?.nome ?? null,
      setorResp: l.setorResp,
      setoresComAnalise: l.analises.map((a) => a.setorId),
      custos: {
        freteEnvio: NUM(l.custo?.freteEnvio),
        freteRetorno: NUM(l.custo?.freteRetorno),
        valorPeca: NUM(l.custo?.valorPeca),
        estorno: NUM(l.custo?.estorno),
        desconto: NUM(l.custo?.desconto),
        guia: NUM(l.custo?.guia),
      },
    }));
  }
}

function usuarioDe(req: PedidoComUsuario) {
  if (!req.usuario) throw new BadRequestException("Sessão ausente.");
  return req.usuario;
}

async function comErros<T>(f: () => Promise<T>): Promise<T> {
  try {
    return await f();
  } catch (e) {
    if (!(e instanceof ErroEscrita)) throw e;
    if (e.status === 403) throw new ForbiddenException(e.message);
    if (e.status === 404) throw new NotFoundException(e.message);
    throw new BadRequestException(e.message);
  }
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Análise do setor. O guarda exige a permissão; o serviço confere de novo, com escopo. */
@Controller("reclamacoes")
export class ControladorAnalise {
  private readonly servico: ServicoAnalise;

  constructor(@Inject(PrismaClient) prisma: PrismaClient) {
    this.servico = new ServicoAnalise(new RepositorioAnalisePrisma(prisma));
  }

  @Requer("reclamacoes.analisar")
  @Post(":id/analise")
  criar(
    @Param("id") id: string,
    @Body() corpo: unknown,
    @Req() req: PedidoComUsuario,
  ) {
    if (!ID.test(id)) throw new NotFoundException("Reclamação não encontrada.");
    const r = lerAnalise(corpo, "criar");
    if (!r.ok) throw new BadRequestException(r.mensagem);
    return comErros(() => this.servico.criar(id, r.entrada, usuarioDe(req)));
  }

  @Requer("reclamacoes.analisar")
  @Patch(":id/analise/:analiseId")
  editar(
    @Param("id") id: string,
    @Param("analiseId") analiseId: string,
    @Body() corpo: unknown,
    @Req() req: PedidoComUsuario,
  ) {
    if (!ID.test(id) || !ID.test(analiseId)) {
      throw new NotFoundException("Análise não encontrada.");
    }
    const r = lerAnalise(corpo, "editar");
    if (!r.ok) throw new BadRequestException(r.mensagem);
    return comErros(() =>
      this.servico.editar(id, analiseId, r.entrada, usuarioDe(req)),
    );
  }
}

@Controller()
export class ControladorFilaAlertas {
  private readonly servico: ServicoFilaAlertas;

  constructor(@Inject(PrismaClient) prisma: PrismaClient) {
    this.servico = new ServicoFilaAlertas(new RepositorioFilaPrisma(prisma));
  }

  @Requer("reclamacoes.analisar")
  @Get("fila")
  fila(@Req() req: PedidoComUsuario) {
    return comErros(() => this.servico.fila(usuarioDe(req)));
  }

  @Requer("alertas.ver")
  @Get("alertas")
  alertas(@Req() req: PedidoComUsuario) {
    return comErros(() => this.servico.alertas(usuarioDe(req)));
  }
}
