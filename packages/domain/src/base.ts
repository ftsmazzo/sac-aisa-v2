export type Devolucao = "NA" | "AGUARDANDO" | "RECEBIDO";
export type Situacao = "aguardando" | "tratativa" | "resolvida";

/** De onde vem a causa. Fica nula quando o cliente ainda não decidiu. */
export type Origem =
  | "montagem"
  | "componente_lote"
  | "projeto"
  | "embalagem"
  | "transporte"
  | "venda";

export interface CustosLike {
  freteEnvio?: number | null;
  freteRetorno?: number | null;
  valorPeca?: number | null;
  estorno?: number | null;
  desconto?: number | null;
  guia?: number | null;
}

export interface ReclamacaoLike extends CustosLike {
  id?: string;
  data?: string | null;
  dataAcao?: string | null;
  dataRecebimento?: string | null;
  devolucao?: Devolucao | string | null;
  laudo?: string | null;
  reclamacao?: string | null;
  solucao?: string | null;
  causaId?: string | null;
  causaManual?: boolean | null;
  setorRespManual?: string | null;
  peca?: string | null;
  sku?: string | null;
  produto?: string | null;
  empresa?: string | null;
  origem?: string | null;
  canal?: string | null;
  setor?: string | null;
  uf?: string | null;
  procedencia?: string | null;
  cliente?: string | null;
  cidade?: string | null;
  protocolo?: string | null;
  familia?: string | null;
  obs?: string | null;
  obsCausa?: string | null;
  reg?: number | null;
}

export interface CausaDef {
  id: string;
  cat: string;
  nome: string;
  setor: string;
  acao: string;
  origem?: Origem | null;
}

export const clean = (s: unknown) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .trim();
export const U = (s: unknown) => clean(s).toUpperCase();
export const stripAcc = (s: unknown) =>
  String(s ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");

export const diasEntre = (a?: string | null, b?: string | null) =>
  a && b ? Math.round((Date.parse(b) - Date.parse(a)) / 864e5) : null;

export const custoTotal = (r: CustosLike) =>
  Number(r.freteEnvio || 0) +
  Number(r.freteRetorno || 0) +
  Number(r.valorPeca || 0) +
  Number(r.estorno || 0) +
  Number(r.desconto || 0) +
  Number(r.guia || 0);

export const tempoDe = (r: ReclamacaoLike) => diasEntre(r.data, r.dataAcao);

export const DEV_LABEL: Record<Devolucao, string> = {
  NA: "Sem devolução",
  AGUARDANDO: "Aguardando chegada",
  RECEBIDO: "Produto recebido",
};

export const devDe = (r: ReclamacaoLike): Devolucao => {
  const d = (r.devolucao || "NA") as Devolucao;
  return d === "AGUARDANDO" || d === "RECEBIDO" ? d : "NA";
};

/** Regra central: dataAcao => resolvida; AGUARDANDO => aguardando; senão tratativa */
export function situacao(r: ReclamacaoLike): Situacao {
  if (r.dataAcao) return "resolvida";
  return devDe(r) === "AGUARDANDO" ? "aguardando" : "tratativa";
}
export const SETORES_RESP = [
  "Embalagem / Expedição",
  "Montagem",
  "Solda",
  "Pintura / Acabamento",
  "Corte e Dobra",
  "Qualidade / Engenharia",
  "Compras",
  "Logística",
  "Comercial / Anúncios",
  "Comercial / Pedidos",
  "PCP",
  "SAC / Pós-venda",
] as const;

/**
 * Defeito de componente, lote, projeto, embalagem, transporte ou venda aparece em qualquer
 * bancada sem ser culpa de quem montou. Só a causa de origem "montagem" conta como da bancada.
 */
export const atribuivelABancada = (origem?: Origem | string | null) =>
  origem === "montagem";
