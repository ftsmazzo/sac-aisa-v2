import {
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Query,
  Req,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { type PedidoComUsuario, Requer } from "./auth.guard";
import {
  type AbertaBruta,
  type EntradaBruta,
  type MovimentoBruto,
  type RepositorioPainel,
  ServicoPainel,
} from "./painel";
import { ErroEscrita } from "./reclamacoes-escrita";

export class RepositorioPainelPrisma implements RepositorioPainel {
  constructor(private readonly prisma: PrismaClient) {}

  async abertas(args: {
    where: Parameters<RepositorioPainel["abertas"]>[0]["where"];
    take: number;
  }): Promise<AbertaBruta[]> {
    const linhas = await this.prisma.reclamacao.findMany({
      where: args.where,
      take: args.take,
      orderBy: [{ dataAbertura: "asc" }, { numero: "asc" }],
      select: {
        id: true,
        numero: true,
        dataAbertura: true,
        dataAcao: true,
        estado: true,
        estadoDesde: true,
        devolucao: true,
        prazoMarketplace: true,
        setorResp: { select: { nome: true } },
        historicoEstados: {
          orderBy: { quando: "asc" },
          select: { para: true, quando: true },
        },
      },
    });
    return linhas.map((r) => ({
      id: r.id,
      numero: r.numero,
      dataAbertura: r.dataAbertura,
      dataAcao: r.dataAcao,
      estado: r.estado,
      estadoDesde: r.estadoDesde,
      devolucao: r.devolucao,
      prazoMarketplace: r.prazoMarketplace,
      setor: r.setorResp?.nome ?? null,
      historico: r.historicoEstados,
    }));
  }

  async movimentos(args: {
    where: Parameters<RepositorioPainel["movimentos"]>[0]["where"];
    take: number;
  }): Promise<MovimentoBruto[]> {
    const linhas = await this.prisma.estadoHistorico.findMany({
      where: args.where,
      take: args.take,
      orderBy: { quando: "desc" },
      select: {
        id: true,
        reclamacaoId: true,
        quando: true,
        de: true,
        para: true,
        reabertura: true,
        reclamacao: {
          select: { numero: true, setorResp: { select: { nome: true } } },
        },
      },
    });
    return linhas.map((m) => ({
      id: m.id,
      reclamacaoId: m.reclamacaoId,
      numero: m.reclamacao.numero,
      quando: m.quando,
      de: m.de,
      para: m.para,
      setor: m.reclamacao.setorResp?.nome ?? null,
      reabertura: m.reabertura,
    }));
  }

  async entradas(args: {
    where: Parameters<RepositorioPainel["entradas"]>[0]["where"];
    take: number;
  }): Promise<EntradaBruta[]> {
    const linhas = await this.prisma.reclamacao.findMany({
      where: args.where,
      take: args.take,
      orderBy: { dataAbertura: "desc" },
      select: {
        id: true,
        dataAbertura: true,
        setorResp: { select: { nome: true } },
      },
    });
    return linhas.map((r) => ({
      id: r.id,
      quando: r.dataAbertura,
      setor: r.setorResp?.nome ?? null,
    }));
  }
}

@Controller("painel")
export class ControladorPainel {
  private readonly servico: ServicoPainel;

  constructor(@Inject(PrismaClient) prisma: PrismaClient) {
    this.servico = new ServicoPainel(new RepositorioPainelPrisma(prisma));
  }

  @Requer("reclamacoes.ver")
  @Get()
  async ver(
    @Query("marca") marca: string | undefined,
    @Req() req: PedidoComUsuario,
  ) {
    if (!req.usuario) throw new ForbiddenException("Sessão ausente.");
    const marcaId = marca?.trim() || undefined;
    try {
      return await this.servico.gerar(req.usuario, marcaId);
    } catch (e) {
      if (e instanceof ErroEscrita && e.status === 403) {
        throw new ForbiddenException(e.message);
      }
      throw e;
    }
  }
}
