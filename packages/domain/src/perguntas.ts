import { stripAcc } from "./base";

export type TipoPergunta =
  | "texto"
  | "escolha"
  | "numero"
  | "sim_nao"
  | "foto"
  | "data";

export const TIPOS_PERGUNTA: readonly TipoPergunta[] = [
  "texto",
  "escolha",
  "numero",
  "sim_nao",
  "foto",
  "data",
];

/** Filtros vazios valem "qualquer". Uma regra precisa de pelo menos um filtro preenchido. */
export interface RegraPergunta {
  familias?: string[];
  causaIds?: string[];
  causaCategorias?: string[];
}

export interface PerguntaDef {
  chave: string;
  texto: string;
  tipo: TipoPergunta;
  obrigatoria: boolean;
  ordem: number;
  ativa: boolean;
  regras: RegraPergunta[];
}

export interface ContextoPergunta {
  familia?: string | null;
  causaId?: string | null;
  causaCategoria?: string | null;
}

export interface RespostaDada {
  chave: string;
  valor: string;
  dispensada?: boolean;
}

const norma = (s: string) => stripAcc(s).trim().toUpperCase();

function bate(filtro: string[] | undefined, valor: string | null | undefined) {
  if (!filtro || filtro.length === 0) return true;
  if (!valor) return false;
  const v = norma(valor);
  return filtro.some((f) => norma(f) === v);
}

/** Todos os filtros preenchidos da regra batem com o contexto. */
export function regraBate(r: RegraPergunta, ctx: ContextoPergunta): boolean {
  const preenchida =
    (r.familias?.length ?? 0) +
      (r.causaIds?.length ?? 0) +
      (r.causaCategorias?.length ?? 0) >
    0;
  if (!preenchida) return false;
  return (
    bate(r.familias, ctx.familia) &&
    bate(r.causaIds, ctx.causaId) &&
    bate(r.causaCategorias, ctx.causaCategoria)
  );
}

/**
 * Perguntas que valem para a reclamação: pergunta ativa em que alguma regra bate.
 * Pergunta sem regra não vale. Volta ordenada por `ordem`.
 */
export function perguntasAplicaveis<T extends PerguntaDef>(
  perguntas: T[],
  ctx: ContextoPergunta,
): T[] {
  return perguntas
    .filter((p) => p.ativa && p.regras.some((r) => regraBate(r, ctx)))
    .sort((a, b) => a.ordem - b.ordem || a.chave.localeCompare(b.chave));
}

/** Obrigatórias sem resposta (ou dispensada). Função pura: o modelo nunca decide o que falta. */
export function perguntasFaltantes<T extends PerguntaDef>(
  aplicaveis: T[],
  respostas: RespostaDada[],
): T[] {
  const dadas = new Set(
    respostas
      .filter((r) => r.dispensada || r.valor.trim() !== "")
      .map((r) => r.chave),
  );
  return aplicaveis.filter((p) => p.obrigatoria && !dadas.has(p.chave));
}
