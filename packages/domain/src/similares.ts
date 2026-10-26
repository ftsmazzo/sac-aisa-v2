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
  "seus",
  "suas",
]);

export interface CasoLimpo {
  id: string;
  texto: string;
  solucao: string;
}

export interface CasoParecido extends CasoLimpo {
  afinidade: number;
}

function tokens(texto: string): Set<string> {
  const normal = texto.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  const vistos = new Set<string>();
  for (const parte of normal.split(/[^\p{L}\p{N}]+/u)) {
    if (parte.length >= 4 && !PARADA.has(parte)) vistos.add(parte);
  }
  return vistos;
}

/**
 * Busca por sobreposição de palavras, sem extensão no banco.
 * Os textos já chegam sem nome, e-mail, telefone e pedido.
 */
export function casosParecidos(
  consulta: string,
  casos: CasoLimpo[],
  limite = 5,
): CasoParecido[] {
  const pedido = tokens(consulta);
  if (pedido.size === 0) return [];
  return casos
    .map((caso) => {
      const dele = tokens(`${caso.texto} ${caso.solucao}`);
      let iguais = 0;
      for (const t of pedido) if (dele.has(t)) iguais += 1;
      const uniao = pedido.size + dele.size - iguais;
      return {
        ...caso,
        afinidade: uniao === 0 ? 0 : iguais / uniao,
      };
    })
    .filter((c) => c.afinidade > 0)
    .sort((a, b) => b.afinidade - a.afinidade || a.id.localeCompare(b.id))
    .slice(0, limite);
}

/**
 * Só descrição, causa e solução. Nome, e-mail, telefone e pedido ficam de fora
 * mesmo se vierem no objeto de origem.
 */
export function consultaSemPessoa(origem: Record<string, string>): string {
  return [origem.descricao, origem.causa, origem.solucao]
    .map((p) => p?.trim() ?? "")
    .filter(Boolean)
    .join("\n");
}
