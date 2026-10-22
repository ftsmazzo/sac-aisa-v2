import type { Prisma } from "@prisma/client";
import type { UsuarioLogado } from "@sac-aisa/auth";
import {
  atribuivelABancada,
  custoTotal,
  diasEntre,
  situacao,
  temPermissao,
} from "@sac-aisa/domain";
import {
  type ConsultaLista,
  type Escopo,
  lerConsulta,
  montarFiltro,
} from "./reclamacoes";
import { ErroEscrita } from "./reclamacoes-escrita";

/** Teto de reclamações varridas por relatório. Passou disso, o resultado avisa que foi cortado. */
export const LIMITE_RELATORIO = 5000;

export type FiltrosRelatorio = Pick<
  ConsultaLista,
  "de" | "ate" | "marcaId" | "setorId" | "causaId"
>;

export type ResultadoFiltros =
  | { ok: true; filtros: FiltrosRelatorio }
  | { ok: false; mensagem: string };

/** Só período, marca, setor e causa entram no relatório. Valor inválido é recusado. */
export function lerFiltrosRelatorio(
  query: Record<string, unknown>,
): ResultadoFiltros {
  const { de, ate, marca, setor, causa } = query;
  const r = lerConsulta({ de, ate, marca, setor, causa });
  if (!r.ok) return r;
  const { consulta } = r;
  return {
    ok: true,
    filtros: {
      ...(consulta.de ? { de: consulta.de } : {}),
      ...(consulta.ate ? { ate: consulta.ate } : {}),
      ...(consulta.marcaId ? { marcaId: consulta.marcaId } : {}),
      ...(consulta.setorId ? { setorId: consulta.setorId } : {}),
      ...(consulta.causaId ? { causaId: consulta.causaId } : {}),
    },
  };
}

/** Mesmo filtro e mesmo escopo da lista; rascunho ainda não é reclamação e fica de fora. */
export function filtroDoRelatorio(
  filtros: FiltrosRelatorio,
  escopo: Escopo,
): Prisma.ReclamacaoWhereInput {
  const base = montarFiltro({ ...filtros, pagina: 1, porPagina: 1 }, escopo);
  return { AND: [base, { rascunho: false }] };
}

/** O que o relatório precisa de cada reclamação. Nada de dado do cliente. */
export interface LinhaRelatorio {
  dataAbertura: string;
  dataRecebimento: string | null;
  dataAcao: string | null;
  devolucao: "NA" | "AGUARDANDO" | "RECEBIDO";
  /** Data da primeira análise de qualquer setor. */
  primeiraAnalise: string | null;
  produto: { codigo: string; nome: string } | null;
  bancada: { codigo: string; nome: string } | null;
  causa: { nome: string; categoria: string; origem: string | null } | null;
  setorResp: { nome: string } | null;
  custos: {
    freteEnvio: number;
    freteRetorno: number;
    valorPeca: number;
    estorno: number;
    desconto: number;
    guia: number;
  };
}

export interface RepositorioRelatorios {
  linhas(args: {
    where: Prisma.ReclamacaoWhereInput;
    take: number;
  }): Promise<LinhaRelatorio[]>;
}

const arred = (v: number, casas = 2) => {
  const f = 10 ** casas;
  return Math.round(v * f) / f;
};

function media(valores: number[]) {
  return {
    n: valores.length,
    mediaDias: valores.length
      ? arred(valores.reduce((a, b) => a + b, 0) / valores.length, 1)
      : null,
  };
}

/** Dias entre duas datas; datas fora de ordem não entram na média. */
function dias(a: string | null, b: string | null): number | null {
  const d = diasEntre(a, b);
  return d !== null && d >= 0 ? d : null;
}

const SEM_SETOR = "Sem setor";
const SEM_BANCADA = "Sem bancada";
const A_CLASSIFICAR = "A classificar";
const LIMITE_PRODUTOS = 15;

export interface LinhaBancada {
  bancada: string;
  total: number;
  porTipo: Record<string, number>;
  /** Causa de origem "montagem": a bancada responde por ela. */
  daMontagem: number;
  /** Qualquer outra origem, ou ainda sem origem: não é culpa de quem montou. */
  foraDaMontagem: number;
}

export interface Relatorio {
  totais: {
    reclamacoes: number;
    resolvidas: number;
    tratativa: number;
    aguardando: number;
    custoTotal: number;
  };
  /** Tempo médio, em dias, de cada etapa. Só entram as reclamações que passaram pela etapa. */
  etapas: {
    chave: string;
    rotulo: string;
    n: number;
    mediaDias: number | null;
  }[];
  porSetor: { setor: string; total: number; custo: number }[];
  porProduto: {
    codigo: string;
    produto: string;
    total: number;
    custo: number;
  }[];
  bancadaXTipo: { tipos: string[]; linhas: LinhaBancada[] };
  /** Verdadeiro quando havia mais reclamações que o teto e o relatório usou só as mais recentes. */
  cortado: boolean;
}

const porNome = (a: string, b: string) => a.localeCompare(b, "pt-BR");

/** Contas do relatório. Situação e custo saem do domínio, como na lista. */
export function calcularRelatorio(
  linhas: LinhaRelatorio[],
  cortado = false,
): Relatorio {
  const sits = linhas.map((l) =>
    situacao({ dataAcao: l.dataAcao, devolucao: l.devolucao }),
  );
  const custos = linhas.map((l) => arred(custoTotal(l.custos)));

  const recebimento: number[] = [];
  const analise: number[] = [];
  const tratativa: number[] = [];
  const total: number[] = [];
  for (const l of linhas) {
    const r = dias(l.dataAbertura, l.dataRecebimento);
    if (r !== null && l.devolucao === "RECEBIDO") recebimento.push(r);
    const a = dias(l.dataAbertura, l.primeiraAnalise);
    if (a !== null) analise.push(a);
    // Tratativa conta a partir do recebimento do produto; sem devolução, da abertura.
    const inicio = l.devolucao === "NA" ? l.dataAbertura : l.dataRecebimento;
    const t = dias(inicio, l.dataAcao);
    if (t !== null) tratativa.push(t);
    const tt = dias(l.dataAbertura, l.dataAcao);
    if (tt !== null) total.push(tt);
  }

  const setores = new Map<string, { total: number; custo: number }>();
  const produtos = new Map<
    string,
    { codigo: string; produto: string; total: number; custo: number }
  >();
  const tiposVistos = new Set<string>();
  const bancadas = new Map<string, LinhaBancada>();

  linhas.forEach((l, i) => {
    const nomeSetor = l.setorResp?.nome ?? SEM_SETOR;
    const s = setores.get(nomeSetor) ?? { total: 0, custo: 0 };
    s.total += 1;
    s.custo += custos[i];
    setores.set(nomeSetor, s);

    const chave = l.produto?.codigo ?? "";
    const p = produtos.get(chave) ?? {
      codigo: l.produto?.codigo ?? "",
      produto: l.produto?.nome ?? "Produto não informado",
      total: 0,
      custo: 0,
    };
    p.total += 1;
    p.custo += custos[i];
    produtos.set(chave, p);

    const nomeBancada = l.bancada
      ? `${l.bancada.codigo}${l.bancada.nome ? ` · ${l.bancada.nome}` : ""}`
      : SEM_BANCADA;
    const b = bancadas.get(nomeBancada) ?? {
      bancada: nomeBancada,
      total: 0,
      porTipo: {},
      daMontagem: 0,
      foraDaMontagem: 0,
    };
    const tipo = l.causa?.categoria ?? A_CLASSIFICAR;
    tiposVistos.add(tipo);
    b.total += 1;
    b.porTipo[tipo] = (b.porTipo[tipo] ?? 0) + 1;
    if (atribuivelABancada(l.causa?.origem)) b.daMontagem += 1;
    else b.foraDaMontagem += 1;
    bancadas.set(nomeBancada, b);
  });

  const tipos = [...tiposVistos].sort((a, b) =>
    a === A_CLASSIFICAR ? 1 : b === A_CLASSIFICAR ? -1 : porNome(a, b),
  );

  return {
    totais: {
      reclamacoes: linhas.length,
      resolvidas: sits.filter((s) => s === "resolvida").length,
      tratativa: sits.filter((s) => s === "tratativa").length,
      aguardando: sits.filter((s) => s === "aguardando").length,
      custoTotal: arred(custos.reduce((a, b) => a + b, 0)),
    },
    etapas: [
      {
        chave: "recebimento",
        rotulo: "Abertura até o produto chegar",
        ...media(recebimento),
      },
      {
        chave: "analise",
        rotulo: "Abertura até a análise do setor",
        ...media(analise),
      },
      {
        chave: "tratativa",
        rotulo: "Tratativa, do produto recebido até a ação",
        ...media(tratativa),
      },
      {
        chave: "total",
        rotulo: "Abertura até a resolução",
        ...media(total),
      },
    ],
    porSetor: [...setores.entries()]
      .map(([setor, v]) => ({ setor, total: v.total, custo: arred(v.custo) }))
      .sort((a, b) => b.total - a.total || porNome(a.setor, b.setor)),
    porProduto: [...produtos.values()]
      .map((p) => ({ ...p, custo: arred(p.custo) }))
      .sort((a, b) => b.total - a.total || porNome(a.produto, b.produto))
      .slice(0, LIMITE_PRODUTOS),
    bancadaXTipo: {
      tipos,
      linhas: [...bancadas.values()].sort((a, b) =>
        a.bancada === SEM_BANCADA
          ? 1
          : b.bancada === SEM_BANCADA
            ? -1
            : b.total - a.total || porNome(a.bancada, b.bancada),
      ),
    },
    cortado,
  };
}

export class ServicoRelatorios {
  constructor(private readonly repo: RepositorioRelatorios) {}

  /** O guarda da API já exige a permissão; aqui ela é conferida de novo, com o escopo. */
  async gerar(filtros: FiltrosRelatorio, usuario: UsuarioLogado) {
    if (!temPermissao(usuario.permissoes, "relatorios.ver")) {
      throw new ErroEscrita(403, "Sem permissão para ver relatórios.");
    }
    const escopo: Escopo = {
      perfil: usuario.perfil,
      setores: usuario.setores,
      marcas: usuario.marcas,
      treino: usuario.modoTreino,
    };
    const linhas = await this.repo.linhas({
      where: filtroDoRelatorio(filtros, escopo),
      take: LIMITE_RELATORIO + 1,
    });
    const cortado = linhas.length > LIMITE_RELATORIO;
    return {
      filtros,
      ...calcularRelatorio(linhas.slice(0, LIMITE_RELATORIO), cortado),
    };
  }
}
