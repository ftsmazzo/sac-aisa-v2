import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { type Prisma, PrismaClient } from "@prisma/client";
import type { UsuarioLogado } from "@sac-aisa/auth";
import {
  type CasoDefeito,
  coeficientesDefeito,
  type LinhaVenda,
  lerPlanilhaVendas,
  limiteDefeitoPpm,
  temPermissao,
  type VendaDefeito,
  vendasDoRecorte,
  veTodosOsSetores,
} from "@sac-aisa/domain";
import { type PedidoComUsuario, Requer } from "./auth.guard";
import type { Escopo } from "./reclamacoes";
import { ErroEscrita } from "./reclamacoes-escrita";
import {
  type FiltrosRelatorio,
  filtroDoRelatorio,
  lerFiltrosRelatorio,
} from "./relatorios";

const CHAVE_LIMITE = "limiteDefeitoPpm";

export interface RepositorioCoeficiente {
  casos(where: Prisma.ReclamacaoWhereInput): Promise<CasoDefeito[]>;
  vendas(de?: string, ate?: string): Promise<VendaDefeito[]>;
  limite(): Promise<number>;
  substituir(linha: LinhaVenda): Promise<void>;
}

function diaUtc(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export class RepositorioCoeficientePrisma implements RepositorioCoeficiente {
  constructor(private readonly prisma: PrismaClient) {}

  async casos(where: Prisma.ReclamacaoWhereInput) {
    const linhas = await this.prisma.reclamacao.findMany({
      where,
      select: {
        procedencia: true,
        produto: { select: { codigo: true, nome: true } },
        bancada: { select: { codigo: true, nome: true } },
        setorResp: { select: { nome: true } },
      },
    });
    return linhas.map((l) => ({
      sku: l.produto?.codigo ?? "",
      procedencia: l.procedencia,
      bancada: l.bancada?.nome || l.bancada?.codigo || "",
      setorResp: l.setorResp?.nome ?? "",
      produto: l.produto?.nome ?? "",
    }));
  }

  async vendas(de?: string, ate?: string) {
    const data: Prisma.DateTimeFilter = {};
    if (de) data.gte = diaUtc(de);
    if (ate) data.lte = diaUtc(ate);
    const linhas = await this.prisma.vendaDia.findMany({
      where: de || ate ? { data } : {},
      select: { sku: true, descricao: true, quantidade: true },
    });
    return linhas;
  }

  async limite() {
    const row = await this.prisma.config.findUnique({
      where: { chave: CHAVE_LIMITE },
    });
    return limiteDefeitoPpm(row?.valor);
  }

  async substituir(linha: LinhaVenda) {
    const data = diaUtc(linha.data);
    await this.prisma.vendaDia.upsert({
      where: { sku_data: { sku: linha.sku, data } },
      create: {
        sku: linha.sku,
        descricao: linha.descricao,
        data,
        quantidade: linha.quantidade,
      },
      update: {
        quantidade: linha.quantidade,
        ...(linha.descricao ? { descricao: linha.descricao } : {}),
      },
    });
  }
}

function escopoDe(usuario: UsuarioLogado): Escopo {
  return {
    perfil: usuario.perfil,
    setores: usuario.setores,
    marcas: usuario.marcas,
    treino: usuario.modoTreino,
  };
}

function recorteEstreito(
  usuario: UsuarioLogado,
  filtros: FiltrosRelatorio,
): boolean {
  return (
    !veTodosOsSetores(usuario.perfil) ||
    Boolean(
      filtros.marcaId ||
        filtros.setorId ||
        filtros.causaId ||
        filtros.bancadaId ||
        filtros.categoria ||
        filtros.produto ||
        filtros.situacao,
    )
  );
}

/** Grava a quantidade da cola. O mesmo SKU e dia substitui o que já estava. */
export async function gravarVendasDia(
  repo: Pick<RepositorioCoeficiente, "substituir">,
  linhas: readonly LinhaVenda[],
): Promise<void> {
  for (const linha of linhas) await repo.substituir(linha);
}

export class ServicoCoeficiente {
  constructor(private readonly repo: RepositorioCoeficiente) {}

  async coeficiente(filtros: FiltrosRelatorio, usuario: UsuarioLogado) {
    if (!temPermissao(usuario.permissoes, "relatorios.ver")) {
      throw new ErroEscrita(403, "Sem permissão para ver relatórios.");
    }
    const casos = await this.repo.casos(
      filtroDoRelatorio(filtros, escopoDe(usuario)),
    );
    const vendas = vendasDoRecorte(
      await this.repo.vendas(filtros.de, filtros.ate),
      casos.map((c) => c.sku),
      { estreito: recorteEstreito(usuario, filtros), produto: filtros.produto },
    );
    return coeficientesDefeito({
      casos,
      vendas,
      limitePpm: await this.repo.limite(),
    });
  }

  async gravar(linhas: readonly LinhaVenda[]) {
    await gravarVendasDia(this.repo, linhas);
  }
}

function usuarioDe(req: PedidoComUsuario): UsuarioLogado {
  if (!req.usuario) throw new BadRequestException("Sessão ausente.");
  return req.usuario;
}

function exigirQuemCola(usuario: UsuarioLogado) {
  if (usuario.perfil !== "administrador" && usuario.perfil !== "gestor") {
    throw new ForbiddenException("Sem permissão para esta ação.");
  }
}

function textoDaCola(body: unknown): string {
  if (
    !body ||
    typeof body !== "object" ||
    !("texto" in body) ||
    typeof body.texto !== "string"
  ) {
    throw new BadRequestException("Envie o texto da planilha.");
  }
  if (body.texto.length > 1_500_000) {
    throw new BadRequestException("A cola é grande demais.");
  }
  return body.texto;
}

@Controller("relatorios")
export class ControladorCoeficiente {
  private readonly servico: ServicoCoeficiente;

  constructor(@Inject(PrismaClient) prisma: PrismaClient) {
    this.servico = new ServicoCoeficiente(
      new RepositorioCoeficientePrisma(prisma),
    );
  }

  @Requer("relatorios.ver")
  @Get("coeficiente")
  async coeficiente(
    @Query() query: Record<string, unknown>,
    @Req() req: PedidoComUsuario,
  ) {
    const f = lerFiltrosRelatorio(query);
    if (!f.ok) throw new BadRequestException(f.mensagem);
    try {
      return await this.servico.coeficiente(f.filtros, usuarioDe(req));
    } catch (e) {
      if (e instanceof ErroEscrita && e.status === 403) {
        throw new ForbiddenException(e.message);
      }
      throw e;
    }
  }

  @Requer("relatorios.ver")
  @Post("vendas/previa")
  previa(@Body() body: unknown, @Req() req: PedidoComUsuario) {
    exigirQuemCola(usuarioDe(req));
    return lerPlanilhaVendas(textoDaCola(body));
  }

  @Requer("relatorios.ver")
  @Post("vendas")
  async gravar(@Body() body: unknown, @Req() req: PedidoComUsuario) {
    exigirQuemCola(usuarioDe(req));
    const previa = lerPlanilhaVendas(textoDaCola(body));
    if (previa.linhas.length === 0) {
      throw new BadRequestException(
        previa.erros[0]?.mensagem ?? "Nenhuma linha válida.",
      );
    }
    await this.servico.gravar(previa.linhas);
    return {
      gravadas: previa.linhas.length,
      somadas: previa.somadas,
      erros: previa.erros,
    };
  }
}
