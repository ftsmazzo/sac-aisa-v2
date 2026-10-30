/** Busca vetorial (cosseno) e lexical para chunks de conhecimento. */

export type ChunkBusca = {
  id: string;
  fonte: string;
  titulo: string;
  texto: string;
  url: string;
  embedding: number[];
};

export type TrechoConhecimento = {
  id: string;
  fonte: string;
  titulo: string;
  trecho: string;
  url: string;
  afinidade: number;
};

export function cosseno(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

const PARADA = new Set([
  "que",
  "com",
  "para",
  "uma",
  "não",
  "nao",
  "dos",
  "das",
  "por",
  "como",
  "mais",
  "sem",
  "foi",
  "são",
  "sao",
  "esta",
  "este",
  "isso",
  "quando",
  "sobre",
  "pela",
  "pelo",
  "entre",
  "depois",
  "antes",
  "também",
  "tambem",
  "muito",
  "pode",
  "ser",
  "tem",
  "ter",
  "seu",
  "sua",
]);

function tokens(texto: string): Set<string> {
  const normal = texto.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  const vistos = new Set<string>();
  for (const parte of normal.split(/[^\p{L}\p{N}]+/u)) {
    if (parte.length >= 4 && !PARADA.has(parte)) vistos.add(parte);
  }
  return vistos;
}

export function afinidadeLexical(consulta: string, texto: string): number {
  const pedido = tokens(consulta);
  if (pedido.size === 0) return 0;
  const dele = tokens(texto);
  let iguais = 0;
  for (const t of pedido) if (dele.has(t)) iguais += 1;
  const uniao = pedido.size + dele.size - iguais;
  return uniao === 0 ? 0 : iguais / uniao;
}

export function buscarChunks(
  consulta: string,
  chunks: ChunkBusca[],
  opts: {
    k?: number;
    queryEmbedding?: number[];
    minAfinidade?: number;
  } = {},
): TrechoConhecimento[] {
  const k = Math.min(Math.max(opts.k ?? 5, 1), 10);
  const min = opts.minAfinidade ?? 0.08;
  const emb = opts.queryEmbedding;

  const ranqueados = chunks
    .map((c) => {
      const cos =
        emb && emb.length && c.embedding.length ? cosseno(emb, c.embedding) : 0;
      const lex = afinidadeLexical(consulta, `${c.titulo} ${c.texto}`);
      // Prefere vetor; lexical reforça SKU/códigos.
      const afinidade = emb?.length ? cos * 0.85 + lex * 0.15 : lex;
      return { c, afinidade };
    })
    .filter((x) => x.afinidade >= min)
    .sort((a, b) => b.afinidade - a.afinidade)
    .slice(0, k);

  return ranqueados.map(({ c, afinidade }) => ({
    id: c.id,
    fonte: c.fonte,
    titulo: c.titulo,
    trecho: c.texto.length > 900 ? `${c.texto.slice(0, 900)}…` : c.texto,
    url: c.url,
    afinidade: Math.round(afinidade * 1000) / 1000,
  }));
}

/** Parte texto longo em pedaços com overlap simples. */
export function fatiarTexto(
  texto: string,
  tamanho = 1500,
  overlap = 150,
): string[] {
  const t = texto.replace(/\s+/g, " ").trim();
  if (!t) return [];
  if (t.length <= tamanho) return [t];
  const out: string[] = [];
  let i = 0;
  while (i < t.length) {
    out.push(t.slice(i, i + tamanho));
    i += Math.max(tamanho - overlap, 1);
  }
  return out;
}
