import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
  Req,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { type PedidoComUsuario, Requer } from "./auth.guard";
import {
  type Escopo,
  lerConsulta,
  type OpcoesFiltro,
  type RepositorioReclamacoes,
  ServicoReclamacoes,
} from "./reclamacoes";

const LISTA = {
  marca: { select: { id: true, nome: true } },
  canal: { select: { id: true, nome: true } },
  produto: { select: { codigo: true, nome: true } },
  causa: { select: { id: true, nome: true, categoria: true } },
  setorResp: { select: { id: true, nome: true } },
  custo: true,
} as const;

const FICHA = {
  ...LISTA,
  bancada: { select: { id: true, codigo: true, nome: true } },
  causas: {
    orderBy: { ordem: "asc" },
    select: {
      primaria: true,
      causa: { select: { id: true, nome: true, categoria: true } },
    },
  },
  analises: {
    orderBy: { criadoEm: "asc" },
    select: {
      id: true,
      setor: { select: { nome: true } },
      produtoPrecisaVoltar: true,
      produtoRecebidoEm: true,
      conclusao: true,
      resultado: true,
      criadoEm: true,
    },
  },
  _count: { select: { fotos: true } },
} as const;

/** Consultas pelo Prisma, sempre parametrizadas. */
export class RepositorioReclamacoesPrisma implements RepositorioReclamacoes {
  constructor(private readonly prisma: PrismaClient) {}

  async listar(args: Parameters<RepositorioReclamacoes["listar"]>[0]) {
    const [linhas, total] = await this.prisma.$transaction([
      this.prisma.reclamacao.findMany({
        where: args.where,
        include: LISTA,
        orderBy: [{ dataAbertura: "desc" }, { numero: "desc" }],
        skip: args.skip,
        take: args.take,
      }),
      this.prisma.reclamacao.count({ where: args.where }),
    ]);
    return { linhas, total };
  }

  obter(where: Parameters<RepositorioReclamacoes["obter"]>[0]) {
    return this.prisma.reclamacao.findFirst({ where, include: FICHA });
  }

  async opcoes(): Promise<OpcoesFiltro> {
    const [marcas, canais, setores, causas] = await Promise.all([
      this.prisma.marca.findMany({
        where: { ativa: true },
        orderBy: { nome: "asc" },
        select: { id: true, nome: true },
      }),
      this.prisma.canal.findMany({
        where: { ativo: true },
        orderBy: { nome: "asc" },
        select: { id: true, nome: true },
      }),
      this.prisma.setor.findMany({
        where: { ativo: true },
        orderBy: { nome: "asc" },
        select: { id: true, nome: true },
      }),
      this.prisma.causa.findMany({
        orderBy: [{ categoria: "asc" }, { ordem: "asc" }],
        select: { id: true, nome: true, categoria: true },
      }),
    ]);
    return { marcas, canais, setores, causas };
  }
}

function escopoDe(req: PedidoComUsuario): Escopo {
  const u = req.usuario;
  if (!u) throw new BadRequestException("Sessão ausente.");
  return { perfil: u.perfil, setores: u.setores };
}

/** Só leitura nesta fatia. O guarda global já exige login; aqui exige `reclamacoes.ver`. */
@Controller("reclamacoes")
export class ControladorReclamacoes {
  private readonly servico: ServicoReclamacoes;

  constructor(@Inject(PrismaClient) prisma: PrismaClient) {
    this.servico = new ServicoReclamacoes(
      new RepositorioReclamacoesPrisma(prisma),
    );
  }

  @Requer("reclamacoes.ver")
  @Get()
  listar(
    @Query() query: Record<string, unknown>,
    @Req() req: PedidoComUsuario,
  ) {
    const r = lerConsulta(query);
    if (!r.ok) throw new BadRequestException(r.mensagem);
    return this.servico.listar(r.consulta, escopoDe(req));
  }

  /** Opções dos chips de filtro. Declarada antes de `:id` para não ser lida como id. */
  @Requer("reclamacoes.ver")
  @Get("filtros")
  filtros(@Req() req: PedidoComUsuario) {
    return this.servico.opcoes(escopoDe(req));
  }

  @Requer("reclamacoes.ver")
  @Get(":id")
  async ficha(@Param("id") id: string, @Req() req: PedidoComUsuario) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
      throw new NotFoundException("Reclamação não encontrada.");
    }
    const ficha = await this.servico.obter(id, escopoDe(req));
    if (!ficha) throw new NotFoundException("Reclamação não encontrada.");
    return ficha;
  }
}
