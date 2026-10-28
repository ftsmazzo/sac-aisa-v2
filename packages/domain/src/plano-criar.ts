/** Origem do plano de ação (estágio 2). */
export const ORIGENS_PLANO = ["kpi", "manual", "recorrencia"] as const;
export type OrigemPlano = (typeof ORIGENS_PLANO)[number];

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const DIA = /^\d{4}-\d{2}-\d{2}$/;

export interface EntradaPlano {
  titulo: string;
  descricao: string;
  causaId: string | null;
  produtoId: string | null;
  bancadaId: string | null;
  setorRespId: string | null;
  origem: OrigemPlano;
  prioridade: string;
  responsavel: string;
  prazo: string | null;
  baselineInicio: string | null;
  baselineFim: string | null;
  reclamacaoIds: string[];
}

function texto(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function idOpcional(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const s = v.trim();
  return ID.test(s) ? s : null;
}

function diaOpcional(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const s = v.trim().slice(0, 10);
  return DIA.test(s) ? s : null;
}

function idsLista(v: unknown, max: number): string[] | null {
  if (v == null) return [];
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  const visto = new Set<string>();
  for (const item of v) {
    if (typeof item !== "string" || !ID.test(item)) return null;
    if (visto.has(item)) continue;
    visto.add(item);
    out.push(item);
    if (out.length > max) return null;
  }
  return out;
}

/**
 * Lê o corpo do POST /planos. Título obrigatório; pelo menos um de
 * causa/produto/bancada para medir efeito depois. IDs inválidos viram erro.
 */
export function lerEntradaPlano(
  corpo: unknown,
): { ok: true; valor: EntradaPlano } | { ok: false; mensagem: string } {
  const c =
    typeof corpo === "object" && corpo !== null
      ? (corpo as Record<string, unknown>)
      : {};
  const titulo = texto(c.titulo, 160);
  if (titulo.length < 3) {
    return { ok: false, mensagem: "Dê um título ao plano." };
  }
  const causaRaw = c.causaId;
  if (
    causaRaw != null &&
    causaRaw !== "" &&
    (typeof causaRaw !== "string" || !ID.test(causaRaw))
  ) {
    return { ok: false, mensagem: "Causa inválida." };
  }
  const produtoRaw = c.produtoId;
  if (
    produtoRaw != null &&
    produtoRaw !== "" &&
    (typeof produtoRaw !== "string" || !ID.test(produtoRaw))
  ) {
    return { ok: false, mensagem: "Produto inválido." };
  }
  const bancadaRaw = c.bancadaId;
  if (
    bancadaRaw != null &&
    bancadaRaw !== "" &&
    (typeof bancadaRaw !== "string" || !ID.test(bancadaRaw))
  ) {
    return { ok: false, mensagem: "Bancada inválida." };
  }
  const setorRaw = c.setorRespId;
  if (
    setorRaw != null &&
    setorRaw !== "" &&
    (typeof setorRaw !== "string" || !ID.test(setorRaw))
  ) {
    return { ok: false, mensagem: "Setor inválido." };
  }
  const origemBruta = texto(c.origem, 32) || "manual";
  if (!(ORIGENS_PLANO as readonly string[]).includes(origemBruta)) {
    return { ok: false, mensagem: "Origem do plano inválida." };
  }
  const reclamacaoIds = idsLista(c.reclamacaoIds, 30);
  if (reclamacaoIds == null) {
    return { ok: false, mensagem: "Lista de reclamações inválida." };
  }
  const prazo = diaOpcional(c.prazo);
  if (c.prazo != null && String(c.prazo).trim() && !prazo) {
    return { ok: false, mensagem: "Prazo inválido." };
  }
  const baselineInicio = diaOpcional(c.baselineInicio);
  if (
    c.baselineInicio != null &&
    String(c.baselineInicio).trim() &&
    !baselineInicio
  ) {
    return { ok: false, mensagem: "Início do período inválido." };
  }
  const baselineFim = diaOpcional(c.baselineFim);
  if (c.baselineFim != null && String(c.baselineFim).trim() && !baselineFim) {
    return { ok: false, mensagem: "Fim do período inválido." };
  }
  if (baselineInicio && baselineFim && baselineInicio > baselineFim) {
    return { ok: false, mensagem: "O período do plano está invertido." };
  }
  const causaId = idOpcional(causaRaw);
  const produtoId = idOpcional(produtoRaw);
  const bancadaId = idOpcional(bancadaRaw);
  if (!causaId && !produtoId && !bancadaId) {
    return {
      ok: false,
      mensagem: "Informe causa, produto ou bancada para poder medir o efeito.",
    };
  }
  return {
    ok: true,
    valor: {
      titulo,
      descricao: texto(c.descricao, 4000),
      causaId,
      produtoId,
      bancadaId,
      setorRespId: idOpcional(setorRaw),
      origem: origemBruta as OrigemPlano,
      prioridade: texto(c.prioridade, 32) || "media",
      responsavel: texto(c.responsavel, 120),
      prazo,
      baselineInicio,
      baselineFim,
      reclamacaoIds,
    },
  };
}

/** Título padrão ao abrir plano a partir do coeficiente. */
export function tituloPlanoDoSku(sku: string, produtoNome?: string): string {
  const codigo = sku.trim().toUpperCase();
  const nome = (produtoNome ?? "").trim();
  if (!codigo) return "Reduzir recorrência";
  if (nome) return `Reduzir defeitos ${codigo} · ${nome}`.slice(0, 160);
  return `Reduzir defeitos ${codigo}`.slice(0, 160);
}
