/** Filtros de reclamação usados pelas tools do gestor (e reexportados pela API). */

import type { Prisma } from "@prisma/client";
import {
  type Estado,
  marcasVisiveis,
  type Perfil,
  type Situacao,
  veTodosOsSetores,
} from "@sac-aisa/domain";

export interface ConsultaLista {
  de?: string;
  ate?: string;
  marcaId?: string;
  canalId?: string;
  setorId?: string;
  causaId?: string;
  bancadaId?: string;
  categoria?: string;
  produto?: string;
  situacao?: Situacao;
  estado?: Estado;
  busca?: string;
  pagina: number;
  porPagina: number;
}

export interface Escopo {
  perfil: Perfil;
  setores: string[];
  /** Marcas do usuário (nomes). Só limita o responsável de setor; vazia = todas. */
  marcas?: string[];
  /** Modo treino: vê só os dados de treino. Ausente ou falso: nunca vê treino. */
  treino?: boolean;
}

/**
 * Quem não vê todos os setores só enxerga reclamação cujo setor responsável é um dos seus.
 * O responsável de setor com marcas na lista só enxerga essas marcas.
 */
export function filtroDeEscopo(
  escopo: Escopo,
): Prisma.ReclamacaoWhereInput | null {
  const e: Prisma.ReclamacaoWhereInput[] = [];
  if (!veTodosOsSetores(escopo.perfil)) {
    e.push({ setorResp: { nome: { in: escopo.setores } } });
  }
  const marcas = marcasVisiveis(escopo.perfil, escopo.marcas ?? []);
  if (marcas) e.push({ marca: { nome: { in: marcas } } });
  if (e.length === 0) return null;
  return e.length === 1 ? e[0] : { AND: e };
}

/**
 * Dado de treino nunca se mistura com o real: a visão normal exclui, o modo treino mostra só ele.
 */
export function filtroDeTreino(escopo: Escopo): Prisma.ReclamacaoWhereInput {
  return { treino: escopo.treino === true };
}

/** Uma reclamação pelo id, já dentro do escopo e da visão (real ou treino). */
export function filtroPorId(
  id: string,
  escopo: Escopo,
): Prisma.ReclamacaoWhereInput {
  const base: Prisma.ReclamacaoWhereInput = { id, ...filtroDeTreino(escopo) };
  const doEscopo = filtroDeEscopo(escopo);
  return doEscopo ? { AND: [base, doEscopo] } : base;
}

function filtroDeSituacao(s: Situacao): Prisma.ReclamacaoWhereInput {
  if (s === "resolvida") return { dataAcao: { not: null } };
  if (s === "aguardando") return { dataAcao: null, devolucao: "AGUARDANDO" };
  return { dataAcao: null, devolucao: { not: "AGUARDANDO" } };
}

function dia(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

/** Monta o filtro. Tudo vai como valor para o Prisma, que parametriza. */
export function montarFiltro(
  consulta: ConsultaLista,
  escopo: Escopo,
): Prisma.ReclamacaoWhereInput {
  const e: Prisma.ReclamacaoWhereInput[] = [];

  e.push(filtroDeTreino(escopo));
  const doEscopo = filtroDeEscopo(escopo);
  if (doEscopo) e.push(doEscopo);

  if (consulta.de || consulta.ate) {
    e.push({
      dataAbertura: {
        ...(consulta.de ? { gte: dia(consulta.de) } : {}),
        ...(consulta.ate ? { lte: dia(consulta.ate) } : {}),
      },
    });
  }
  if (consulta.marcaId) e.push({ marcaId: consulta.marcaId });
  if (consulta.canalId) e.push({ canalId: consulta.canalId });
  if (consulta.setorId) e.push({ setorRespId: consulta.setorId });
  if (consulta.causaId) {
    e.push({
      OR: [
        { causaId: consulta.causaId },
        { causas: { some: { causaId: consulta.causaId } } },
      ],
    });
  }
  if (consulta.bancadaId) e.push({ bancadaId: consulta.bancadaId });
  if (consulta.categoria) {
    e.push({
      OR: [
        { causa: { categoria: consulta.categoria } },
        { causas: { some: { causa: { categoria: consulta.categoria } } } },
      ],
    });
  }
  if (consulta.produto) e.push({ produto: { codigo: consulta.produto } });
  if (consulta.situacao) e.push(filtroDeSituacao(consulta.situacao));
  if (consulta.estado) e.push({ estado: consulta.estado });

  if (consulta.busca) {
    const b = consulta.busca;
    const ou: Prisma.ReclamacaoWhereInput[] = [
      { descricao: { contains: b, mode: "insensitive" } },
      { laudo: { contains: b, mode: "insensitive" } },
      { pedido: { contains: b, mode: "insensitive" } },
      { clienteNome: { contains: b, mode: "insensitive" } },
      { protocoloExterno: { contains: b, mode: "insensitive" } },
      { produto: { nome: { contains: b, mode: "insensitive" } } },
      { produto: { codigo: { contains: b, mode: "insensitive" } } },
    ];
    const numero = b.replace(/^#/, "");
    if (/^\d{1,9}$/.test(numero)) ou.push({ numero: Number(numero) });
    e.push({ OR: ou });
  }

  return e.length ? { AND: e } : {};
}
