/** Funções puras da tela de reclamações: filtros na URL e formatação. Sem dependência de servidor. */

export type Situacao = "aguardando" | "tratativa" | "resolvida";

export const ROTULO_SITUACAO: Record<Situacao, string> = {
  aguardando: "Aguardando produto",
  tratativa: "Em tratativa",
  resolvida: "Resolvida",
};

/** Jornada da reclamação: chaves da API e nomes de tela. */
export const ESTADOS = [
  "triagem",
  "aguardando_cliente",
  "encaminhada",
  "recebida",
  "em_tratativa",
  "resolvida_setor",
  "finalizada",
] as const;
export type Estado = (typeof ESTADOS)[number];

export const ROTULO_ESTADO: Record<Estado, string> = {
  triagem: "Triagem",
  aguardando_cliente: "Aguardando cliente",
  encaminhada: "Encaminhada ao setor",
  recebida: "Recebida pelo setor",
  em_tratativa: "Em tratativa",
  resolvida_setor: "Resolvida no setor técnico",
  finalizada: "Finalizada no SAC",
};

export function tomDoEstado(e: Estado): "ok" | "atencao" | "info" {
  if (e === "finalizada" || e === "resolvida_setor") return "ok";
  if (e === "aguardando_cliente") return "atencao";
  return "info";
}

export const ehEstado = (v: unknown): v is Estado =>
  typeof v === "string" && (ESTADOS as readonly string[]).includes(v);

export const ROTULO_DEVOLUCAO: Record<string, string> = {
  NA: "Sem devolução",
  AGUARDANDO: "Aguardando chegada",
  RECEBIDO: "Produto recebido",
};

export function tomDaSituacao(s: Situacao): "ok" | "atencao" | "info" {
  if (s === "resolvida") return "ok";
  if (s === "aguardando") return "atencao";
  return "info";
}

/** Parâmetros de filtro que a lista aceita na URL. `ficha` é a reclamação aberta na frente. */
export const CAMPOS_FILTRO = [
  "de",
  "ate",
  "marca",
  "canal",
  "setor",
  "causa",
  "bancada",
  "categoria",
  "produto",
  "situacao",
  "estado",
  "busca",
] as const;
export type CampoFiltro = (typeof CAMPOS_FILTRO)[number];

const ACOES = ["nova", "editar", "analise"] as const;

export type ParamsUrl = Record<string, string | string[] | undefined>;

const primeiro = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

export interface EstadoLista {
  filtros: Partial<Record<CampoFiltro, string>>;
  pagina: number;
  ficha?: string;
  /** `nova` abre o cadastro em branco; `editar` a edição; `analise` a aba de análise do setor. */
  acao?: "nova" | "editar" | "analise";
}

export function lerEstado(params: ParamsUrl): EstadoLista {
  const filtros: EstadoLista["filtros"] = {};
  for (const c of CAMPOS_FILTRO) {
    const v = primeiro(params[c]);
    if (v) filtros[c] = v;
  }
  const p = Number(primeiro(params.pagina));
  return {
    filtros,
    pagina: Number.isInteger(p) && p >= 1 ? p : 1,
    ficha: primeiro(params.ficha),
    acao: ACOES.find((a) => a === primeiro(params.acao)),
  };
}

type Mudanca = Partial<
  Record<CampoFiltro | "pagina" | "ficha" | "acao", string | null>
>;

/** Monta o link da lista. Mudar um filtro volta para a página 1; `null` remove o campo. */
export function montarHref(estado: EstadoLista, mudar: Mudanca = {}): string {
  const q = new URLSearchParams();
  for (const c of CAMPOS_FILTRO) {
    const v = c in mudar ? mudar[c] : estado.filtros[c];
    if (v) q.set(c, v);
  }
  const mudouFiltro = CAMPOS_FILTRO.some((c) => c in mudar);
  const pagina =
    "pagina" in mudar
      ? mudar.pagina
      : mudouFiltro
        ? "1"
        : String(estado.pagina);
  if (pagina && pagina !== "1") q.set("pagina", pagina);
  const ficha = "ficha" in mudar ? mudar.ficha : estado.ficha;
  if (ficha) q.set("ficha", ficha);
  // Trocar de ficha ou fechá-la também sai do formulário, a menos que a ação venha junto.
  const acao =
    "acao" in mudar ? mudar.acao : "ficha" in mudar ? null : estado.acao;
  if (acao) q.set("acao", acao);
  const s = q.toString();
  return s ? `/reclamacoes?${s}` : "/reclamacoes";
}

/** Query string enviada à API: só filtros e página, nunca a ficha. */
export function consultaParaApi(estado: EstadoLista, porPagina = 25): string {
  const q = new URLSearchParams(estado.filtros as Record<string, string>);
  q.set("pagina", String(estado.pagina));
  q.set("porPagina", String(porPagina));
  return q.toString();
}

/** "2026-10-20" vira "20/10/2026". */
export function data(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

const MOEDA = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
export const moeda = (v: number) => MOEDA.format(v);
