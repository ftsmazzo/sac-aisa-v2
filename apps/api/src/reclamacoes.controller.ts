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
  Query,
  Req,
} from "@nestjs/common";
import { type Prisma, PrismaClient } from "@prisma/client";
import type { Situacao } from "@sac-aisa/domain";
import { type PedidoComUsuario, Requer } from "./auth.guard";
import { ServicoClickup } from "./clickup";
import {
  type DadosDaLinha,
  type RepositorioLinha,
  ServicoLinhaDoTempo,
} from "./linha-do-tempo";
import {
  type Escopo,
  lerConsulta,
  type OpcoesFiltro,
  type RepositorioReclamacoes,
  ServicoReclamacoes,
} from "./reclamacoes";
import {
  type AuditoriaNova,
  ErroEscrita,
  type EstadoReclamacao,
  lerEntrada,
  type Referencias,
  type RegistroAtual,
  type RepositorioEscrita,
  ServicoEscrita,
} from "./reclamacoes-escrita";

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
  causa: {
    select: {
      id: true,
      nome: true,
      categoria: true,
      setor: { select: { id: true, nome: true } },
      regra: { select: { setor: { select: { id: true, nome: true } } } },
    },
  },
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
  historicoEstados: {
    orderBy: { quando: "asc" },
    select: { para: true, quando: true },
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
    const [marcas, canais, setores, causas, bancadas] = await Promise.all([
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
      this.prisma.bancada.findMany({
        where: { ativa: true },
        orderBy: { codigo: "asc" },
        select: { id: true, codigo: true, nome: true },
      }),
    ]);
    return { marcas, canais, setores, causas, bancadas };
  }
}

const DIA = (s: string | null) => (s ? new Date(`${s}T00:00:00.000Z`) : null);
const ISO = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

function dadosEscalares(e: EstadoReclamacao, situacao: Situacao) {
  return {
    canalId: e.canalId,
    marcaId: e.marcaId,
    produtoId: e.produtoId,
    bancadaId: e.bancadaId,
    causaId: e.causaId,
    causaManual: e.causaManual,
    setorRespId: e.setorRespId,
    setorRespManual: e.setorRespManual,
    situacao,
    estado: e.estado,
    devolucao: e.devolucao,
    dataAbertura: DIA(e.dataAbertura) as Date,
    dataAcao: DIA(e.dataAcao),
    dataRecebimento: DIA(e.dataRecebimento),
    prazoMarketplace: DIA(e.prazoMarketplace),
    protocoloExterno: e.protocoloExterno,
    descricao: e.descricao,
    laudo: e.laudo,
    procedencia: e.procedencia,
    solucao: e.solucao,
    observacao: e.observacao,
    garantia: e.garantia,
    pedido: e.pedido,
    clienteNome: e.clienteNome,
    cidade: e.cidade,
    uf: e.uf,
    transportadora: e.transportadora,
    peca: e.peca,
  };
}

function registroAuditoria(a: AuditoriaNova) {
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

/** Escrita pelo Prisma: dado e auditoria entram na mesma transação, ou nenhum dos dois. */
export class RepositorioEscritaPrisma implements RepositorioEscrita {
  constructor(private readonly prisma: PrismaClient) {}

  async referencias(): Promise<Referencias> {
    const [canais, marcas, bancadas, setores, causas] = await Promise.all([
      this.prisma.canal.findMany({
        where: { ativo: true },
        select: { id: true },
      }),
      this.prisma.marca.findMany({
        where: { ativa: true },
        select: { id: true },
      }),
      this.prisma.bancada.findMany({
        where: { ativa: true },
        select: { id: true },
      }),
      this.prisma.setor.findMany({
        where: { ativo: true },
        select: { id: true },
      }),
      this.prisma.causa.findMany({
        select: {
          id: true,
          setorId: true,
          regra: { select: { setorId: true } },
        },
      }),
    ]);
    const ids = (l: { id: string }[]) => new Set(l.map((x) => x.id));
    return {
      canais: ids(canais),
      marcas: ids(marcas),
      bancadas: ids(bancadas),
      setores: ids(setores),
      causaSetor: new Map(
        causas.map((c) => [c.id, c.regra?.setorId ?? c.setorId]),
      ),
    };
  }

  async produtoPorCodigo(codigo: string) {
    const p = await this.prisma.produto.findUnique({
      where: { codigo },
      select: { id: true },
    });
    return p?.id ?? null;
  }

  async obterAtual(
    where: Parameters<RepositorioEscrita["obterAtual"]>[0],
  ): Promise<RegistroAtual | null> {
    const r = await this.prisma.reclamacao.findFirst({
      where,
      include: { custo: true },
    });
    if (!r) return null;
    const n = (v: unknown) => (v == null ? 0 : Number(v));
    return {
      id: r.id,
      numero: r.numero,
      estado: {
        canalId: r.canalId,
        marcaId: r.marcaId,
        produtoId: r.produtoId,
        bancadaId: r.bancadaId,
        causaId: r.causaId,
        causaManual: r.causaManual,
        setorRespId: r.setorRespId,
        setorRespManual: r.setorRespManual,
        devolucao: r.devolucao,
        estado: r.estado,
        dataAbertura: ISO(r.dataAbertura) as string,
        dataAcao: ISO(r.dataAcao),
        dataRecebimento: ISO(r.dataRecebimento),
        prazoMarketplace: ISO(r.prazoMarketplace),
        protocoloExterno: r.protocoloExterno,
        descricao: r.descricao,
        laudo: r.laudo,
        procedencia: r.procedencia,
        solucao: r.solucao,
        observacao: r.observacao,
        garantia: r.garantia,
        pedido: r.pedido,
        clienteNome: r.clienteNome,
        cidade: r.cidade,
        uf: r.uf,
        transportadora: r.transportadora,
        peca: r.peca,
        custos: {
          freteEnvio: n(r.custo?.freteEnvio),
          freteRetorno: n(r.custo?.freteRetorno),
          valorPeca: n(r.custo?.valorPeca),
          estorno: n(r.custo?.estorno),
          desconto: n(r.custo?.desconto),
          guia: n(r.custo?.guia),
        },
      },
    };
  }

  criar(args: Parameters<RepositorioEscrita["criar"]>[0]) {
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.reclamacao.create({
        data: {
          ...dadosEscalares(args.estado, args.situacao),
          origemRegistro: "web",
          treino: args.treino,
          criadoPorId: args.usuarioId,
          alteradoPorId: args.usuarioId,
          custo: { create: args.estado.custos },
          // O card do ClickUp nasce pendente junto do registro; a fila cria o card lá.
          card: { create: { proximaTentativaEm: new Date() } },
          causas: args.estado.causaId
            ? { create: { causaId: args.estado.causaId, primaria: true } }
            : undefined,
          historicoEstados: {
            create: {
              de: null,
              para: args.estado.estado,
              autorId: args.usuarioId,
              autorNome: args.usuarioNome,
              origem: "web",
            },
          },
        },
        select: { id: true, numero: true },
      });
      await tx.auditoria.create({ data: registroAuditoria(args.auditar(r)) });
      return r;
    });
  }

  async atualizar(args: Parameters<RepositorioEscrita["atualizar"]>[0]) {
    await this.prisma.$transaction(async (tx) => {
      await tx.reclamacao.update({
        where: { id: args.id },
        data: {
          ...dadosEscalares(args.estado, args.situacao),
          ...(args.transicao ? { estadoDesde: new Date() } : {}),
          alteradoPorId: args.usuarioId,
          custo: {
            upsert: { create: args.estado.custos, update: args.estado.custos },
          },
        },
      });
      if (args.transicao) {
        await tx.estadoHistorico.create({
          data: {
            reclamacaoId: args.id,
            de: args.transicao.de,
            para: args.transicao.para,
            autorId: args.usuarioId,
            autorNome: args.auditoria.usuarioNome,
            motivo: args.transicao.motivo,
            origem: "web",
            reabertura: args.transicao.reabertura,
          },
        });
        await tx.clickupCard.updateMany({
          where: { reclamacaoId: args.id },
          data: { precisaSync: true },
        });
      }
      // A causa principal acompanha `causaId`; os motivos extras ficam como estão.
      await tx.reclamacaoCausa.deleteMany({
        where: { reclamacaoId: args.id, primaria: true },
      });
      if (args.estado.causaId) {
        await tx.reclamacaoCausa.upsert({
          where: {
            reclamacaoId_causaId: {
              reclamacaoId: args.id,
              causaId: args.estado.causaId,
            },
          },
          create: {
            reclamacaoId: args.id,
            causaId: args.estado.causaId,
            primaria: true,
          },
          update: { primaria: true },
        });
      }
      await tx.auditoria.create({ data: registroAuditoria(args.auditoria) });
    });
  }
}

const ACOES_DA_LINHA = [
  "reclamacao.criar",
  "reclamacao.editar",
  "analise.criar",
  "analise.editar",
  "reclamacao.estado",
];

/** Lê a reclamação, a auditoria dela e os nomes de setor e causa para escrever a linha do tempo. */
export class RepositorioLinhaPrisma implements RepositorioLinha {
  constructor(private readonly prisma: PrismaClient) {}

  async obter(
    where: Prisma.ReclamacaoWhereInput,
  ): Promise<DadosDaLinha | null> {
    const r = await this.prisma.reclamacao.findFirst({
      where,
      select: {
        id: true,
        dataAbertura: true,
        dataAcao: true,
        dataRecebimento: true,
        devolucao: true,
        setorRespId: true,
        canal: { select: { nome: true } },
        setorResp: { select: { nome: true } },
        analises: { select: { setorId: true } },
      },
    });
    if (!r) return null;
    const [auditorias, setores, causas] = await Promise.all([
      this.prisma.auditoria.findMany({
        where: { reclamacaoId: r.id, acao: { in: ACOES_DA_LINHA } },
        orderBy: { quando: "asc" },
        select: {
          id: true,
          quando: true,
          usuarioNome: true,
          acao: true,
          extra: true,
        },
      }),
      this.prisma.setor.findMany({ select: { id: true, nome: true } }),
      this.prisma.causa.findMany({ select: { id: true, nome: true } }),
    ]);
    const nomes = (l: { id: string; nome: string }[]) =>
      Object.fromEntries(l.map((x) => [x.id, x.nome]));
    return {
      id: r.id,
      dataAbertura: ISO(r.dataAbertura) as string,
      canalNome: r.canal.nome,
      devolucao: r.devolucao,
      dataRecebimento: ISO(r.dataRecebimento),
      dataAcao: ISO(r.dataAcao),
      setorRespId: r.setorRespId,
      setorRespNome: r.setorResp?.nome ?? null,
      analiseDoSetor:
        r.setorRespId !== null &&
        r.analises.some((a) => a.setorId === r.setorRespId),
      auditorias,
      setores: nomes(setores),
      causas: nomes(causas),
    };
  }
}

function usuarioDe(req: PedidoComUsuario) {
  if (!req.usuario) throw new BadRequestException("Sessão ausente.");
  return req.usuario;
}

function escopoDe(req: PedidoComUsuario): Escopo {
  const u = usuarioDe(req);
  return {
    perfil: u.perfil,
    setores: u.setores,
    marcas: u.marcas,
    treino: u.modoTreino,
  };
}

/**
 * O guarda global já exige login e confere a origem de toda escrita; cada rota exige a
 * permissão própria. O serviço de escrita confere de novo, porque quem decide é o servidor.
 */
@Controller("reclamacoes")
export class ControladorReclamacoes {
  private readonly servico: ServicoReclamacoes;
  private readonly escrita: ServicoEscrita;
  private readonly linha: ServicoLinhaDoTempo;

  constructor(
    @Inject(PrismaClient) prisma: PrismaClient,
    @Inject(ServicoClickup) private readonly clickup: ServicoClickup,
  ) {
    this.servico = new ServicoReclamacoes(
      new RepositorioReclamacoesPrisma(prisma),
    );
    this.escrita = new ServicoEscrita(new RepositorioEscritaPrisma(prisma));
    this.linha = new ServicoLinhaDoTempo(new RepositorioLinhaPrisma(prisma));
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

  /** A jornada da reclamação, da entrada à resolução. Mesmo escopo da ficha. */
  @Requer("reclamacoes.ver")
  @Get(":id/linha-do-tempo")
  async linhaDoTempo(@Param("id") id: string, @Req() req: PedidoComUsuario) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
      throw new NotFoundException("Reclamação não encontrada.");
    }
    const r = await this.linha.obter(id, escopoDe(req));
    if (!r) throw new NotFoundException("Reclamação não encontrada.");
    return r;
  }

  @Requer("reclamacoes.criar")
  @Post()
  async criar(@Body() corpo: unknown, @Req() req: PedidoComUsuario) {
    const r = lerEntrada(corpo, "criar");
    if (!r.ok) throw new BadRequestException(r.mensagem);
    const criada = await this.comErros(() =>
      this.escrita.criar(r.entrada, usuarioDe(req)),
    );
    // Primeira tentativa já; se falhar ou faltar token, a fila tenta de novo.
    void this.clickup.tentarCard(criada.id).catch(() => undefined);
    return criada;
  }

  @Requer("reclamacoes.editar")
  @Patch(":id")
  async editar(
    @Param("id") id: string,
    @Body() corpo: unknown,
    @Req() req: PedidoComUsuario,
  ) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
      throw new NotFoundException("Reclamação não encontrada.");
    }
    const r = lerEntrada(corpo, "editar");
    if (!r.ok) throw new BadRequestException(r.mensagem);
    const editada = await this.comErros(() =>
      this.escrita.editar(id, r.entrada, usuarioDe(req)),
    );
    // Depois de gravar: o card acompanha a mudança, sem segurar a resposta nem falhar por ela.
    if (editada.alterou) {
      void this.clickup.aposEdicao(editada.id, editada).catch(() => undefined);
    }
    return editada;
  }

  private async comErros<T>(f: () => Promise<T>): Promise<T> {
    try {
      return await f();
    } catch (e) {
      if (!(e instanceof ErroEscrita)) throw e;
      if (e.status === 403) throw new ForbiddenException(e.message);
      if (e.status === 404) throw new NotFoundException(e.message);
      throw new BadRequestException(e.message);
    }
  }
}
