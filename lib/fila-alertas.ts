/** Tipos e rótulos da fila do setor e dos alertas, como a API devolve. */

export type TipoAlerta =
  | "AGUARDANDO_DIAS"
  | "TRATATIVA_META"
  | "CUSTO_ALTO"
  | "CAUSA_OUTROS"
  | "RASCUNHO_PENDENTE";

export const ROTULO_ALERTA: Record<TipoAlerta, string> = {
  AGUARDANDO_DIAS: "Produto demora a chegar",
  TRATATIVA_META: "Tratativa além da meta",
  CUSTO_ALTO: "Custo alto",
  CAUSA_OUTROS: "Causa sem classificação",
  RASCUNHO_PENDENTE: "Rascunho parado",
};

export interface ItemFila {
  id: string;
  numero: number;
  dataAbertura: string;
  diasEmAberto: number;
  devolucao: "NA" | "AGUARDANDO" | "RECEBIDO";
  produto: { codigo: string; nome: string } | null;
  causa: string | null;
  setorResp: { id: string; nome: string } | null;
  custoTotal: number;
  alertas: TipoAlerta[];
}

export interface RespostaFila {
  itens: ItemFila[];
  total: number;
}

export interface ItemAlerta {
  tipo: TipoAlerta;
  titulo: string;
  reclamacaoId: string;
  numero: number;
  diasEmAberto: number;
  custoTotal: number;
  setor: string | null;
  produto: string | null;
}

export interface RespostaAlertas {
  itens: ItemAlerta[];
  total: number;
  porTipo: Partial<Record<TipoAlerta, number>>;
}
