import type { Prisma } from "@prisma/client";
import type { UsuarioLogado } from "@sac-aisa/auth";
import {
  diasEmAberto,
  faixaDeIdade,
  horasAteAndamento,
  type MotivoPrazo,
  motivosDePrazo,
  temPermissao,
} from "@sac-aisa/domain";
import { type Escopo, filtroDeEscopo, filtroDeTreino } from "./reclamacoes";
import { ErroEscrita } from "./reclamacoes-escrita";

/** Janela da linha do tempo e das entradas. O aberto não se corta por ela. */
export const JANELA_DIAS = 90;
export const LIMITE_ABERTOS = 2000;
export const LIMITE_MOVIMENTOS = 400;

const DIA_MS = 864e5;

export function hojeEmSaoPaulo(agora: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}

const dataIso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** Escopo, treino e marca. Sem nome de cliente. */
export function whereBase(
  escopo: Escopo,
  marcaId: string | undefined,
): Prisma.ReclamacaoWhereInput {
  const partes: Prisma.ReclamacaoWhereInput[] = [
    filtroDeTreino(escopo),
    { rascunho: false },
  ];
  const doEscopo = filtroDeEscopo(escopo);
  if (doEscopo) partes.push(doEscopo);
  if (marcaId) partes.push({ marcaId });
  return { AND: partes };
}

export interface AbertaBruta {
  id: string;
  numero: number;
  dataAbertura: Date;
  dataAcao: Date | null;
  estado: string;
  estadoDesde: Date;
  devolucao: "NA" | "AGUARDANDO" | "RECEBIDO";
  prazoMarketplace: Date | null;
  setor: string | null;
  historico: { para: string; quando: Date }[];
}

export interface MovimentoBruto {
  id: string;
  reclamacaoId: string;
  numero: number;
  quando: Date;
  de: string | null;
  para: string;
  setor: string | null;
  reabertura: boolean;
}

export interface EntradaBruta {
  id: string;
  quando: Date;
  setor: string | null;
}

export interface RepositorioPainel {
  abertas(args: {
    where: Prisma.ReclamacaoWhereInput;
    take: number;
  }): Promise<AbertaBruta[]>;
  movimentos(args: {
    where: Prisma.EstadoHistoricoWhereInput;
    take: number;
  }): Promise<MovimentoBruto[]>;
  entradas(args: {
    where: Prisma.ReclamacaoWhereInput;
    take: number;
  }): Promise<EntradaBruta[]>;
}

export interface ItemAberto {
  id: string;
  numero: number;
  abertura: string;
  estado: string;
  estadoDesde: string;
  setor: string;
  motivos: MotivoPrazo[];
  horasAteAndamento: number | null;
  dias: number;
  faixa: ReturnType<typeof faixaDeIdade>;
}

export interface MovimentoPainel {
  id: string;
  reclamacaoId: string;
  numero: number;
  quando: string;
  de: string | null;
  para: string;
  setor: string;
  reabertura: boolean;
}

export interface EntradaPainel {
  id: string;
  quando: string;
  setor: string;
}

export interface PainelBruto {
  hoje: string;
  geradoEm: string;
  cortado: boolean;
  abertos: ItemAberto[];
  movimentos: MovimentoPainel[];
  entradas: EntradaPainel[];
}

const setorDe = (nome: string | null) => nome?.trim() || "Sem setor";

function paraItem(r: AbertaBruta, hoje: string, agora: Date): ItemAberto {
  const abertura = dataIso(r.dataAbertura) as string;
  const dias = diasEmAberto(abertura, hoje);
  const motivos = motivosDePrazo(
    {
      data: abertura,
      dataAcao: dataIso(r.dataAcao),
      devolucao: r.devolucao,
      estado: r.estado,
      estadoDesde: r.estadoDesde.toISOString(),
      prazoMarketplace: dataIso(r.prazoMarketplace),
    },
    hoje,
    agora,
  );
  return {
    id: r.id,
    numero: r.numero,
    abertura,
    estado: r.estado,
    estadoDesde: r.estadoDesde.toISOString(),
    setor: setorDe(r.setor),
    motivos,
    horasAteAndamento: horasAteAndamento(
      r.historico.map((h) => ({
        para: h.para,
        quando: h.quando.toISOString(),
      })),
    ),
    dias,
    faixa: faixaDeIdade(dias),
  };
}

export class ServicoPainel {
  constructor(private readonly repo: RepositorioPainel) {}

  async gerar(
    usuario: UsuarioLogado,
    marcaId: string | undefined,
    agora = new Date(),
  ): Promise<PainelBruto> {
    if (!temPermissao(usuario.permissoes, "reclamacoes.ver")) {
      throw new ErroEscrita(403, "Sem permissão para ver o painel.");
    }
    const escopo: Escopo = {
      perfil: usuario.perfil,
      setores: usuario.setores,
      marcas: usuario.marcas,
      treino: usuario.modoTreino,
    };
    const base = whereBase(escopo, marcaId);
    const desde = new Date(agora.getTime() - JANELA_DIAS * DIA_MS);
    const hoje = hojeEmSaoPaulo(agora);
    const [abertas, movimentos, entradas] = await Promise.all([
      this.repo.abertas({
        where: { AND: [base, { estado: { not: "finalizada" } }] },
        take: LIMITE_ABERTOS + 1,
      }),
      this.repo.movimentos({
        where: { quando: { gte: desde }, reclamacao: base },
        take: LIMITE_MOVIMENTOS + 1,
      }),
      this.repo.entradas({
        where: { AND: [base, { dataAbertura: { gte: desde } }] },
        take: LIMITE_ABERTOS + 1,
      }),
    ]);
    const cortado =
      abertas.length > LIMITE_ABERTOS ||
      movimentos.length > LIMITE_MOVIMENTOS ||
      entradas.length > LIMITE_ABERTOS;
    return {
      hoje,
      geradoEm: agora.toISOString(),
      cortado,
      abertos: abertas
        .slice(0, LIMITE_ABERTOS)
        .map((r) => paraItem(r, hoje, agora)),
      movimentos: movimentos.slice(0, LIMITE_MOVIMENTOS).map((m) => ({
        id: m.id,
        reclamacaoId: m.reclamacaoId,
        numero: m.numero,
        quando: m.quando.toISOString(),
        de: m.de,
        para: m.para,
        setor: setorDe(m.setor),
        reabertura: m.reabertura,
      })),
      entradas: entradas.slice(0, LIMITE_ABERTOS).map((e) => ({
        id: e.id,
        quando: e.quando.toISOString(),
        setor: setorDe(e.setor),
      })),
    };
  }
}
