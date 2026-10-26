/** PPM = reclamações / vendas × 1.000.000. Não é consulta ao INMETRO. */
export const LIMITE_PPM_PADRAO = 1000;
export const PROCEDE = "PROCEDE";
export const NAO_PROCEDE = "NÃO PROCEDE";
const SEM_BANCADA = "Sem bancada";
const SEM_SETOR = "Sem setor";

export function normalizarSku(valor: string): string {
  return valor.trim().toUpperCase();
}

/** Config ausente, vazia ou não positiva volta ao limite padrão. */
export function limiteDefeitoPpm(valor: unknown): number {
  const n =
    typeof valor === "number" ? valor : Number(String(valor ?? "").trim());
  return Number.isFinite(n) && n > 0 ? n : LIMITE_PPM_PADRAO;
}

/**
 * Com pelo menos 30% dos casos classificados (PROCEDE ou NÃO PROCEDE),
 * a conta usa só PROCEDE. Abaixo disso, entram todos.
 */
export function contaSoProcedentes(procedencias: readonly string[]): boolean {
  if (procedencias.length === 0) return false;
  const classificadas = procedencias.filter(
    (p) => p === PROCEDE || p === NAO_PROCEDE,
  ).length;
  return classificadas / procedencias.length >= 0.3;
}

export interface CasoDefeito {
  sku: string;
  procedencia: string;
  bancada: string;
  setorResp: string;
  produto: string;
}

export interface VendaDefeito {
  sku: string;
  descricao: string;
  quantidade: number;
}

export interface LinhaSku {
  sku: string;
  produto: string;
  vendas: number;
  reclamacoes: number;
  bancada: string;
  setorResp: string;
  ppm: number | null;
  semVenda: boolean;
  acimaLimite: boolean;
}

export interface LinhaGrupo {
  nome: string;
  skus: number;
  vendas: number;
  reclamacoes: number;
  ppm: number | null;
  acimaLimite: boolean;
}

export interface CoeficienteDefeito {
  limitePpm: number;
  modoContagem: "procedentes" | "todas";
  totais: {
    skus: number;
    vendas: number;
    reclamacoes: number;
    ppm: number | null;
    acimaLimite: number;
    semVenda: number;
  };
  porSku: LinhaSku[];
  porBancada: LinhaGrupo[];
  porSetorResp: LinhaGrupo[];
}

function ppmDe(reclamacoes: number, vendas: number): number | null {
  if (vendas <= 0) return null;
  return (reclamacoes / vendas) * 1_000_000;
}

function maisFrequente(valores: string[], vazio: string): string {
  const ordem: string[] = [];
  const n = new Map<string, number>();
  for (const bruto of valores) {
    const chave = bruto.trim() || vazio;
    if (!n.has(chave)) ordem.push(chave);
    n.set(chave, (n.get(chave) ?? 0) + 1);
  }
  let melhor = ordem[0] ?? vazio;
  for (const chave of ordem) {
    if ((n.get(chave) ?? 0) > (n.get(melhor) ?? 0)) melhor = chave;
  }
  return melhor;
}

/**
 * Vendas fora do recorte das reclamações não entram na conta.
 * Com filtro de produto, fica só aquele SKU, mesmo sem reclamação.
 */
export function vendasDoRecorte(
  vendas: readonly VendaDefeito[],
  skusComCaso: readonly string[],
  opcoes: { estreito: boolean; produto?: string },
): VendaDefeito[] {
  const produto = opcoes.produto ? normalizarSku(opcoes.produto) : "";
  const conjunto = new Set(
    skusComCaso.map(normalizarSku).filter((sku) => sku.length > 0),
  );
  return vendas.filter((v) => {
    const sku = normalizarSku(v.sku);
    if (!sku) return false;
    if (produto) return sku === produto;
    if (opcoes.estreito) return conjunto.has(sku);
    return true;
  });
}

/** Agrupa por SKU, bancada e setor responsável. SKU com caso e sem venda fica sem PPM. */
export function coeficientesDefeito(args: {
  casos: readonly CasoDefeito[];
  vendas: readonly VendaDefeito[];
  limitePpm?: number;
}): CoeficienteDefeito {
  const limite = limiteDefeitoPpm(args.limitePpm ?? LIMITE_PPM_PADRAO);
  const modo = contaSoProcedentes(args.casos.map((c) => c.procedencia))
    ? "procedentes"
    : "todas";
  const contados =
    modo === "procedentes"
      ? args.casos.filter((c) => c.procedencia === PROCEDE)
      : args.casos;

  type Agg = {
    sku: string;
    produto: string;
    vendas: number;
    reclamacoes: number;
    bancadas: string[];
    setores: string[];
  };
  const por = new Map<string, Agg>();
  const garantir = (sku: string): Agg => {
    const atual = por.get(sku);
    if (atual) return atual;
    const criado: Agg = {
      sku,
      produto: "",
      vendas: 0,
      reclamacoes: 0,
      bancadas: [],
      setores: [],
    };
    por.set(sku, criado);
    return criado;
  };

  for (const v of args.vendas) {
    const sku = normalizarSku(v.sku);
    if (!sku || !Number.isInteger(v.quantidade) || v.quantidade < 0) continue;
    const g = garantir(sku);
    g.vendas += v.quantidade;
    if (!g.produto && v.descricao.trim()) g.produto = v.descricao.trim();
  }
  for (const c of contados) {
    const sku = normalizarSku(c.sku);
    if (!sku) continue;
    const g = garantir(sku);
    g.reclamacoes += 1;
    g.bancadas.push(c.bancada);
    g.setores.push(c.setorResp);
    if (c.produto.trim()) g.produto = c.produto.trim();
  }

  const porSku: LinhaSku[] = [];
  for (const g of por.values()) {
    if (g.vendas === 0 && g.reclamacoes === 0) continue;
    const ppm = ppmDe(g.reclamacoes, g.vendas);
    const semVenda = g.vendas === 0 && g.reclamacoes > 0;
    porSku.push({
      sku: g.sku,
      produto: g.produto,
      vendas: g.vendas,
      reclamacoes: g.reclamacoes,
      bancada: g.bancadas.length
        ? maisFrequente(g.bancadas, SEM_BANCADA)
        : SEM_BANCADA,
      setorResp: g.setores.length
        ? maisFrequente(g.setores, SEM_SETOR)
        : SEM_SETOR,
      ppm,
      semVenda,
      acimaLimite: ppm !== null && ppm > limite,
    });
  }
  porSku.sort((a, b) => {
    if (a.semVenda !== b.semVenda) return a.semVenda ? 1 : -1;
    return (
      (b.ppm ?? -1) - (a.ppm ?? -1) ||
      b.reclamacoes - a.reclamacoes ||
      a.sku.localeCompare(b.sku, "pt-BR")
    );
  });

  const agrupar = (chave: "bancada" | "setorResp"): LinhaGrupo[] => {
    const grupos = new Map<string, LinhaGrupo>();
    for (const linha of porSku) {
      const nome = linha[chave];
      const atual = grupos.get(nome) ?? {
        nome,
        skus: 0,
        vendas: 0,
        reclamacoes: 0,
        ppm: null,
        acimaLimite: false,
      };
      atual.skus += 1;
      atual.vendas += linha.vendas;
      atual.reclamacoes += linha.reclamacoes;
      grupos.set(nome, atual);
    }
    return [...grupos.values()]
      .map((g) => {
        const ppm = ppmDe(g.reclamacoes, g.vendas);
        return { ...g, ppm, acimaLimite: ppm !== null && ppm > limite };
      })
      .sort(
        (a, b) =>
          (b.ppm ?? -1) - (a.ppm ?? -1) ||
          b.reclamacoes - a.reclamacoes ||
          a.nome.localeCompare(b.nome, "pt-BR"),
      );
  };

  const vendasTotal = porSku.reduce((a, l) => a + l.vendas, 0);
  const reclamacoesTotal = porSku.reduce((a, l) => a + l.reclamacoes, 0);
  return {
    limitePpm: limite,
    modoContagem: modo,
    totais: {
      skus: porSku.length,
      vendas: vendasTotal,
      reclamacoes: reclamacoesTotal,
      ppm: ppmDe(reclamacoesTotal, vendasTotal),
      acimaLimite: porSku.filter((l) => l.acimaLimite).length,
      semVenda: porSku.filter((l) => l.semVenda).length,
    },
    porSku,
    porBancada: agrupar("bancada"),
    porSetorResp: agrupar("setorResp"),
  };
}
