import type { Prisma } from "@prisma/client";
import {
  custoTotal,
  type Devolucao,
  type Perfil,
  type Situacao,
  situacao,
  veTodosOsSetores,
} from "@sac-aisa/domain";

export const POR_PAGINA_PADRAO = 25;
export const POR_PAGINA_MAX = 100;
const BUSCA_MAX = 100;
const ID_MAX = 64;

export const SITUACOES: readonly Situacao[] = [
  "aguardando",
  "tratativa",
  "resolvida",
];

export interface ConsultaLista {
  de?: string;
  ate?: string;
  marcaId?: string;
  canalId?: string;
  setorId?: string;
  causaId?: string;
  situacao?: Situacao;
  busca?: string;
  pagina: number;
  porPagina: number;
}

export type ResultadoConsulta =
  | { ok: true; consulta: ConsultaLista }
  | { ok: false; mensagem: string };

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function dataValida(s: string): boolean {
  if (!DATA_ISO.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function texto(v: unknown): string | undefined {
  if (Array.isArray(v)) return texto(v[0]);
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

function inteiro(v: unknown, padrao: number): number | null {
  const t = texto(v);
  if (t === undefined) return padrao;
  if (!/^\d{1,6}$/.test(t)) return null;
  return Number(t);
}

/** Lê e valida a query string. Valor fora do formato é recusado, nunca ignorado em silêncio. */
export function lerConsulta(query: Record<string, unknown>): ResultadoConsulta {
  const consulta: ConsultaLista = { pagina: 1, porPagina: POR_PAGINA_PADRAO };

  for (const campo of ["de", "ate"] as const) {
    const v = texto(query[campo]);
    if (v === undefined) continue;
    if (!dataValida(v)) {
      return { ok: false, mensagem: `Data inválida em "${campo}".` };
    }
    consulta[campo] = v;
  }
  if (consulta.de && consulta.ate && consulta.de > consulta.ate) {
    return { ok: false, mensagem: "O início do período vem depois do fim." };
  }

  for (const [campo, chave] of [
    ["marca", "marcaId"],
    ["canal", "canalId"],
    ["setor", "setorId"],
    ["causa", "causaId"],
  ] as const) {
    const v = texto(query[campo]);
    if (v === undefined) continue;
    if (v.length > ID_MAX) {
      return { ok: false, mensagem: `Filtro "${campo}" inválido.` };
    }
    consulta[chave] = v;
  }

  const sit = texto(query.situacao);
  if (sit !== undefined) {
    if (!SITUACOES.includes(sit as Situacao)) {
      return { ok: false, mensagem: "Situação inválida." };
    }
    consulta.situacao = sit as Situacao;
  }

  const busca = texto(query.busca);
  if (busca !== undefined) {
    if (busca.length > BUSCA_MAX) {
      return { ok: false, mensagem: "A busca é longa demais." };
    }
    consulta.busca = busca;
  }

  const pagina = inteiro(query.pagina, 1);
  const porPagina = inteiro(query.porPagina, POR_PAGINA_PADRAO);
  if (pagina === null || pagina < 1) {
    return { ok: false, mensagem: "Página inválida." };
  }
  if (porPagina === null || porPagina < 1 || porPagina > POR_PAGINA_MAX) {
    return {
      ok: false,
      mensagem: `Itens por página: de 1 a ${POR_PAGINA_MAX}.`,
    };
  }
  consulta.pagina = pagina;
  consulta.porPagina = porPagina;
  return { ok: true, consulta };
}

export interface Escopo {
  perfil: Perfil;
  setores: string[];
}

/** Quem não vê todos os setores só enxerga reclamação cujo setor responsável é um dos seus. */
export function filtroDeEscopo(
  escopo: Escopo,
): Prisma.ReclamacaoWhereInput | null {
  if (veTodosOsSetores(escopo.perfil)) return null;
  return { setorResp: { nome: { in: escopo.setores } } };
}

/** Mesma regra de `situacao()` do domínio, escrita como filtro de banco. */
function filtroDeSituacao(s: Situacao): Prisma.ReclamacaoWhereInput {
  if (s === "resolvida") return { dataAcao: { not: null } };
  if (s === "aguardando") return { dataAcao: null, devolucao: "AGUARDANDO" };
  return { dataAcao: null, devolucao: { not: "AGUARDANDO" } };
}

function dia(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

/** Monta o filtro. Tudo vai como valor para o Prisma, que parametriza; nada vira SQL à mão. */
export function montarFiltro(
  consulta: ConsultaLista,
  escopo: Escopo,
): Prisma.ReclamacaoWhereInput {
  const e: Prisma.ReclamacaoWhereInput[] = [];

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
  if (consulta.situacao) e.push(filtroDeSituacao(consulta.situacao));

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

// ---------- Formato da resposta ----------

const NUM = (v: unknown) => (v == null ? 0 : Number(v));
const DIA_ISO = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

interface CustoBanco {
  freteEnvio: unknown;
  freteRetorno: unknown;
  valorPeca: unknown;
  estorno: unknown;
  desconto: unknown;
  guia: unknown;
}

export interface LinhaBanco {
  id: string;
  numero: number;
  dataAbertura: Date;
  dataAcao: Date | null;
  devolucao: Devolucao;
  descricao: string;
  cidade: string;
  uf: string;
  marca: { id: string; nome: string } | null;
  canal: { id: string; nome: string };
  produto: { codigo: string; nome: string } | null;
  causa: { id: string; nome: string; categoria: string } | null;
  setorResp: { id: string; nome: string } | null;
  custo: CustoBanco | null;
}

function custosNumericos(c: CustoBanco | null) {
  return {
    freteEnvio: NUM(c?.freteEnvio),
    freteRetorno: NUM(c?.freteRetorno),
    valorPeca: NUM(c?.valorPeca),
    estorno: NUM(c?.estorno),
    desconto: NUM(c?.desconto),
    guia: NUM(c?.guia),
  };
}

/** Situação e custo saem do domínio, não da coluna `situacao` gravada. */
function calculados(l: LinhaBanco) {
  const custos = custosNumericos(l.custo);
  return {
    custos,
    custoTotal: Math.round(custoTotal(custos) * 100) / 100,
    situacao: situacao({
      dataAcao: DIA_ISO(l.dataAcao),
      devolucao: l.devolucao,
    }),
  };
}

export function paraItemLista(l: LinhaBanco) {
  const c = calculados(l);
  return {
    id: l.id,
    numero: l.numero,
    dataAbertura: DIA_ISO(l.dataAbertura),
    dataAcao: DIA_ISO(l.dataAcao),
    situacao: c.situacao,
    devolucao: l.devolucao,
    marca: l.marca,
    canal: l.canal,
    produto: l.produto,
    causa: l.causa,
    setorResp: l.setorResp,
    cidade: l.cidade,
    uf: l.uf,
    resumo:
      l.descricao.length > 160 ? `${l.descricao.slice(0, 157)}…` : l.descricao,
    custoTotal: c.custoTotal,
  };
}

/** A causa da ficha leva o setor que ela direciona, com a troca manual da regra por cima. */
interface CausaDaFicha {
  id: string;
  nome: string;
  categoria: string;
  setor?: { id: string; nome: string };
  regra?: { setor: { id: string; nome: string } | null } | null;
}

export interface FichaBanco extends Omit<LinhaBanco, "causa"> {
  causa: CausaDaFicha | null;
  protocoloExterno: string | null;
  dataRecebimento: Date | null;
  laudo: string;
  procedencia: string;
  solucao: string;
  observacao: string;
  garantia: string;
  pedido: string;
  clienteNome: string;
  transportadora: string;
  peca: string;
  setorRespManual: boolean;
  causaManual: boolean;
  rascunho: boolean;
  origemRegistro: string;
  criadoEm: Date;
  alteradoEm: Date;
  bancada: { id: string; codigo: string; nome: string } | null;
  causas: {
    primaria: boolean;
    causa: { id: string; nome: string; categoria: string };
  }[];
  analises: {
    id: string;
    setor: { nome: string };
    produtoPrecisaVoltar: boolean;
    produtoRecebidoEm: Date | null;
    conclusao: string;
    resultado: string;
    criadoEm: Date;
  }[];
  _count: { fotos: number };
}

export function paraFicha(f: FichaBanco) {
  const c = calculados(f);
  const causa = f.causa
    ? { id: f.causa.id, nome: f.causa.nome, categoria: f.causa.categoria }
    : null;
  return {
    ...paraItemLista({ ...f, causa }),
    /** Setor que a causa atual indica; pode diferir do responsável se alguém o trocou. */
    setorSugerido: f.causa
      ? (f.causa.regra?.setor ?? f.causa.setor ?? null)
      : null,
    descricao: f.descricao,
    protocoloExterno: f.protocoloExterno,
    dataRecebimento: DIA_ISO(f.dataRecebimento),
    laudo: f.laudo,
    procedencia: f.procedencia,
    solucao: f.solucao,
    observacao: f.observacao,
    garantia: f.garantia,
    pedido: f.pedido,
    clienteNome: f.clienteNome,
    transportadora: f.transportadora,
    peca: f.peca,
    setorRespManual: f.setorRespManual,
    causaManual: f.causaManual,
    rascunho: f.rascunho,
    origemRegistro: f.origemRegistro,
    criadoEm: f.criadoEm.toISOString(),
    alteradoEm: f.alteradoEm.toISOString(),
    bancada: f.bancada,
    custos: c.custos,
    causasExtras: f.causas.filter((x) => !x.primaria).map((x) => x.causa),
    analises: f.analises.map((a) => ({
      id: a.id,
      setor: a.setor.nome,
      produtoPrecisaVoltar: a.produtoPrecisaVoltar,
      produtoRecebidoEm: DIA_ISO(a.produtoRecebidoEm),
      conclusao: a.conclusao,
      resultado: a.resultado,
      criadoEm: a.criadoEm.toISOString(),
    })),
    fotos: f._count.fotos,
  };
}

// ---------- Serviço ----------

export interface OpcoesFiltro {
  marcas: { id: string; nome: string }[];
  canais: { id: string; nome: string }[];
  setores: { id: string; nome: string }[];
  causas: { id: string; nome: string; categoria: string }[];
  bancadas: { id: string; codigo: string; nome: string }[];
}

export interface RepositorioReclamacoes {
  listar(args: {
    where: Prisma.ReclamacaoWhereInput;
    skip: number;
    take: number;
  }): Promise<{ linhas: LinhaBanco[]; total: number }>;
  obter(where: Prisma.ReclamacaoWhereInput): Promise<FichaBanco | null>;
  opcoes(): Promise<OpcoesFiltro>;
}

export class ServicoReclamacoes {
  constructor(private readonly repo: RepositorioReclamacoes) {}

  async listar(consulta: ConsultaLista, escopo: Escopo) {
    const { linhas, total } = await this.repo.listar({
      where: montarFiltro(consulta, escopo),
      skip: (consulta.pagina - 1) * consulta.porPagina,
      take: consulta.porPagina,
    });
    return {
      itens: linhas.map(paraItemLista),
      total,
      pagina: consulta.pagina,
      porPagina: consulta.porPagina,
      totalPaginas: Math.max(1, Math.ceil(total / consulta.porPagina)),
    };
  }

  /** Fora do escopo do usuário é igual a não existir: devolve null, sem revelar a diferença. */
  async obter(id: string, escopo: Escopo) {
    const doEscopo = filtroDeEscopo(escopo);
    const where: Prisma.ReclamacaoWhereInput = doEscopo
      ? { AND: [{ id }, doEscopo] }
      : { id };
    const ficha = await this.repo.obter(where);
    return ficha ? paraFicha(ficha) : null;
  }

  /** Quem é restrito a setores só recebe os próprios setores na lista de filtros. */
  async opcoes(escopo: Escopo): Promise<OpcoesFiltro> {
    const o = await this.repo.opcoes();
    if (veTodosOsSetores(escopo.perfil)) return o;
    return {
      ...o,
      setores: o.setores.filter((s) => escopo.setores.includes(s.nome)),
    };
  }
}
