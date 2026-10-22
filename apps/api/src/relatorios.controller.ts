import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Query,
  Req,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { type PedidoComUsuario, Requer } from "./auth.guard";
import { ErroEscrita } from "./reclamacoes-escrita";
import {
  lerFiltrosRelatorio,
  type RepositorioRelatorios,
  ServicoRelatorios,
} from "./relatorios";

const ISO = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const NUM = (v: unknown) => (v == null ? 0 : Number(v));

/** Consultas pelo Prisma, sempre parametrizadas. Só o que o relatório usa, sem dado de cliente. */
export class RepositorioRelatoriosPrisma implements RepositorioRelatorios {
  constructor(private readonly prisma: PrismaClient) {}

  async linhas(args: Parameters<RepositorioRelatorios["linhas"]>[0]) {
    const l = await this.prisma.reclamacao.findMany({
      where: args.where,
      take: args.take,
      orderBy: [{ dataAbertura: "desc" }, { numero: "desc" }],
      select: {
        dataAbertura: true,
        dataRecebimento: true,
        dataAcao: true,
        devolucao: true,
        produto: { select: { codigo: true, nome: true } },
        bancada: { select: { codigo: true, nome: true } },
        causa: { select: { nome: true, categoria: true, origem: true } },
        setorResp: { select: { nome: true } },
        custo: true,
        analises: {
          orderBy: { criadoEm: "asc" },
          take: 1,
          select: { criadoEm: true },
        },
      },
    });
    return l.map((r) => ({
      dataAbertura: ISO(r.dataAbertura) as string,
      dataRecebimento: ISO(r.dataRecebimento),
      dataAcao: ISO(r.dataAcao),
      devolucao: r.devolucao,
      primeiraAnalise: ISO(r.analises[0]?.criadoEm ?? null),
      produto: r.produto,
      bancada: r.bancada,
      causa: r.causa,
      setorResp: r.setorResp,
      custos: {
        freteEnvio: NUM(r.custo?.freteEnvio),
        freteRetorno: NUM(r.custo?.freteRetorno),
        valorPeca: NUM(r.custo?.valorPeca),
        estorno: NUM(r.custo?.estorno),
        desconto: NUM(r.custo?.desconto),
        guia: NUM(r.custo?.guia),
      },
    }));
  }
}

@Controller("relatorios")
export class ControladorRelatorios {
  private readonly servico: ServicoRelatorios;

  constructor(@Inject(PrismaClient) prisma: PrismaClient) {
    this.servico = new ServicoRelatorios(
      new RepositorioRelatoriosPrisma(prisma),
    );
  }

  @Requer("relatorios.ver")
  @Get()
  async gerar(
    @Query() query: Record<string, unknown>,
    @Req() req: PedidoComUsuario,
  ) {
    const f = lerFiltrosRelatorio(query);
    if (!f.ok) throw new BadRequestException(f.mensagem);
    if (!req.usuario) throw new BadRequestException("Sessão ausente.");
    try {
      return await this.servico.gerar(f.filtros, req.usuario);
    } catch (e) {
      if (e instanceof ErroEscrita && e.status === 403) {
        throw new ForbiddenException(e.message);
      }
      throw e;
    }
  }
}
