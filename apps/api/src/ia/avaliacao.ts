import { classificar } from "@sac-aisa/domain";
import { esquemaTriagem, lerJson } from "./esquemas";
import type { CausaIa, PerguntaIa } from "./ia";
import { sistemaTriagem, usuarioTriagem } from "./prompts";
import { comNovaTentativa, type ProvedorIa } from "./provedor";
import { redigir } from "./redacao";

/** Uma reclamação histórica com a causa que a pessoa definiu (gabarito). */
export interface CasoHistorico {
  id: string;
  descricao: string;
  produto: string;
  sku: string;
  canal: string;
  clienteNome: string;
  pedido: string;
  causaId: string;
  setorNome: string;
}

export interface ResultadoCaso {
  id: string;
  gabarito: string;
  ia: string | null;
  regras: string;
  erro: string | null;
}

export interface Relatorio {
  total: number;
  comResposta: number;
  falhas: number;
  acertoCausaIa: number;
  acertoSetorIa: number;
  acertoCausaRegras: number;
  acertoSetorRegras: number;
  tokensEntrada: number;
  tokensSaida: number;
  custoUsd: number;
  erradas: { id: string; gabarito: string; ia: string | null }[];
}

/** Amostra repetível: mesma semente, mesma ordem. */
export function sortear<T>(lista: T[], n: number, semente = 1): T[] {
  let x = semente >>> 0 || 1;
  const rnd = () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 0x100000000;
  };
  const c = [...lista];
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c.slice(0, n);
}

export function estimarCustoAvaliacao(
  n: number,
  precoEntrada = 0.15,
  precoSaida = 0.6,
) {
  // Cerca de 1.200 tokens de entrada (causas e perguntas no prompt) e 120 de saída por caso.
  return (n * (1200 * precoEntrada + 120 * precoSaida)) / 1_000_000;
}

export async function avaliar(a: {
  casos: CasoHistorico[];
  causas: CausaIa[];
  perguntas: PerguntaIa[];
  provedor: ProvedorIa;
  modelo: string;
  aoAndar?: (feitos: number, total: number) => void;
}): Promise<{ relatorio: Relatorio; casos: ResultadoCaso[] }> {
  const setorDe = new Map(a.causas.map((c) => [c.id, c.setorNome]));
  const ativas = a.perguntas.filter((p) => p.ativa);
  const esquema = esquemaTriagem(
    a.causas.map((c) => c.id),
    ativas.map((p) => p.chave),
  );
  const sistema = sistemaTriagem(
    a.causas.map((c) => ({ id: c.id, nome: c.nome, categoria: c.categoria })),
    ativas,
  );
  const rel: Relatorio = {
    total: a.casos.length,
    comResposta: 0,
    falhas: 0,
    acertoCausaIa: 0,
    acertoSetorIa: 0,
    acertoCausaRegras: 0,
    acertoSetorRegras: 0,
    tokensEntrada: 0,
    tokensSaida: 0,
    custoUsd: 0,
    erradas: [],
  };
  const out: ResultadoCaso[] = [];
  let feitos = 0;
  for (const c of a.casos) {
    const regras = classificar({
      reclamacao: c.descricao,
      produto: c.produto,
      sku: c.sku,
    });
    if (regras === c.causaId) rel.acertoCausaRegras++;
    if (setorDe.get(regras) === c.setorNome) rel.acertoSetorRegras++;
    const texto = redigir(c.descricao.slice(0, 4000), {
      nomes: [c.clienteNome],
      literais: [c.pedido],
    });
    let ia: string | null = null;
    let erro: string | null = null;
    try {
      const r = await comNovaTentativa(a.provedor, {
        sistema,
        usuario: usuarioTriagem({
          produto: c.produto,
          sku: c.sku,
          canal: c.canal,
          texto,
        }),
        modelo: a.modelo,
        timeoutMs: 20_000,
        maxTokens: 500,
      });
      rel.tokensEntrada += r.tokensEntrada;
      rel.tokensSaida += r.tokensSaida;
      rel.custoUsd += r.custoUsd;
      ia = esquema.parse(lerJson(r.texto)).causaId;
    } catch (e) {
      erro = e instanceof Error ? e.message : "falha";
      rel.falhas++;
    }
    if (ia) {
      rel.comResposta++;
      if (ia === c.causaId) rel.acertoCausaIa++;
      else rel.erradas.push({ id: c.id, gabarito: c.causaId, ia });
      if (setorDe.get(ia) === c.setorNome) rel.acertoSetorIa++;
    }
    out.push({ id: c.id, gabarito: c.causaId, ia, regras, erro });
    a.aoAndar?.(++feitos, a.casos.length);
  }
  return { relatorio: rel, casos: out };
}

const pct = (n: number, d: number) =>
  d === 0 ? "—" : `${((100 * n) / d).toFixed(1)}%`;

/** Texto do relatório. Só ids e nomes de causa: nada do texto do comprador. */
export function formatarRelatorio(r: Relatorio, modelo: string): string {
  return [
    `Modelo: ${modelo}`,
    `Casos: ${r.total} (${r.comResposta} com resposta da IA, ${r.falhas} falhas)`,
    `Acerto de causa: IA ${pct(r.acertoCausaIa, r.comResposta)} · regras ${pct(r.acertoCausaRegras, r.total)}`,
    `Acerto de setor: IA ${pct(r.acertoSetorIa, r.comResposta)} · regras ${pct(r.acertoSetorRegras, r.total)}`,
    `Tokens: ${r.tokensEntrada} entrada, ${r.tokensSaida} saída`,
    `Custo: US$ ${r.custoUsd.toFixed(4)}${r.comResposta > 0 ? ` (US$ ${(r.custoUsd / r.comResposta).toFixed(5)} por caso)` : ""}`,
    r.erradas.length
      ? `Causas erradas (id da reclamação: gabarito → IA):\n${r.erradas.map((e) => `  ${e.id}: ${e.gabarito} → ${e.ia}`).join("\n")}`
      : "Nenhuma causa errada.",
  ].join("\n");
}
