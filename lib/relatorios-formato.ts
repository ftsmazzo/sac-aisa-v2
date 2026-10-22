/** Relatório como a API devolve, mais a conversão para CSV. Sem dependência de servidor. */

export interface RelatorioApi {
  filtros: {
    de?: string;
    ate?: string;
    marcaId?: string;
    setorId?: string;
    causaId?: string;
  };
  totais: {
    reclamacoes: number;
    resolvidas: number;
    tratativa: number;
    aguardando: number;
    custoTotal: number;
  };
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
  bancadaXTipo: {
    tipos: string[];
    linhas: {
      bancada: string;
      total: number;
      porTipo: Record<string, number>;
      daMontagem: number;
      foraDaMontagem: number;
    }[];
  };
  cortado: boolean;
}

/** Filtros que a tela e o CSV repassam à API. */
export const CAMPOS_RELATORIO = [
  "de",
  "ate",
  "marca",
  "setor",
  "causa",
] as const;
export type CampoRelatorio = (typeof CAMPOS_RELATORIO)[number];

type Params = Record<string, string | string[] | undefined>;

/** Lê os filtros da URL, ignorando o que não é do relatório. */
export function lerFiltrosUrl(
  params: Params,
): Partial<Record<CampoRelatorio, string>> {
  const out: Partial<Record<CampoRelatorio, string>> = {};
  for (const c of CAMPOS_RELATORIO) {
    const bruto = params[c];
    const v = (Array.isArray(bruto) ? bruto[0] : bruto)?.trim();
    if (v) out[c] = v;
  }
  return out;
}

export function consultaRelatorio(
  filtros: Partial<Record<CampoRelatorio, string>>,
): string {
  return new URLSearchParams(filtros as Record<string, string>).toString();
}

/** Texto de uma média: "2,5 dias", ou "—" quando ninguém passou pela etapa. */
export function textoDias(v: number | null): string {
  if (v === null) return "—";
  const t = v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return `${t} ${v === 1 ? "dia" : "dias"}`;
}

type Celula = string | number | null | undefined;

/** Planilha abre texto começado por = + - @ como fórmula; o apóstrofo desarma. */
function celula(v: Celula): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") {
    return Number.isFinite(v)
      ? v.toLocaleString("pt-BR", {
          maximumFractionDigits: 2,
          useGrouping: false,
        })
      : "";
  }
  const t = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[;"\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

const linha = (...c: Celula[]) => c.map(celula).join(";");

/**
 * CSV para Excel em português: separador ";", vírgula decimal, BOM e quebra CRLF.
 * `descricaoFiltros` leva os filtros já com nome legível (marca, setor e causa).
 */
export function relatorioParaCsv(
  r: RelatorioApi,
  descricaoFiltros: [string, string][],
): string {
  const l: string[] = [];
  l.push(linha("Relatório de reclamações"));
  for (const [nome, valor] of descricaoFiltros) l.push(linha(nome, valor));
  if (r.cortado) {
    l.push(linha("Aviso", "Resultado limitado às reclamações mais recentes"));
  }

  l.push("", linha("Totais"));
  l.push(linha("Reclamações", r.totais.reclamacoes));
  l.push(linha("Resolvidas", r.totais.resolvidas));
  l.push(linha("Em tratativa", r.totais.tratativa));
  l.push(linha("Aguardando produto", r.totais.aguardando));
  l.push(linha("Custo total", r.totais.custoTotal));

  l.push("", linha("Tempo médio por etapa"));
  l.push(linha("Etapa", "Reclamações", "Média em dias"));
  for (const e of r.etapas) l.push(linha(e.rotulo, e.n, e.mediaDias));

  l.push("", linha("Ocorrências por setor"));
  l.push(linha("Setor", "Reclamações", "Custo"));
  for (const s of r.porSetor) l.push(linha(s.setor, s.total, s.custo));

  l.push("", linha("Ocorrências por produto"));
  l.push(linha("Código", "Produto", "Reclamações", "Custo"));
  for (const p of r.porProduto) {
    l.push(linha(p.codigo, p.produto, p.total, p.custo));
  }

  l.push("", linha("Bancada de origem × tipo de ocorrência"));
  l.push(
    linha(
      "Bancada",
      ...r.bancadaXTipo.tipos,
      "Total",
      "Causa na montagem",
      "Causa fora da montagem",
    ),
  );
  for (const b of r.bancadaXTipo.linhas) {
    l.push(
      linha(
        b.bancada,
        ...r.bancadaXTipo.tipos.map((t) => b.porTipo[t] ?? 0),
        b.total,
        b.daMontagem,
        b.foraDaMontagem,
      ),
    );
  }

  return `﻿${l.join("\r\n")}\r\n`;
}
