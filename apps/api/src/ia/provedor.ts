/** Provedor de IA atrás de uma interface: os testes trocam por um simulado e nunca chamam o OpenRouter. */

export interface PedidoIa {
  sistema: string;
  usuario: string;
  modelo: string;
  timeoutMs: number;
  maxTokens: number;
}

export interface RespostaIa {
  texto: string;
  tokensEntrada: number;
  tokensSaida: number;
  /** Custo em dólar, do próprio provedor ou estimado pela tabela do modelo. */
  custoUsd: number;
  modelo: string;
}

export interface ProvedorIa {
  completar(pedido: PedidoIa): Promise<RespostaIa>;
}

export class ErroProvedor extends Error {
  constructor(
    mensagem: string,
    /** Nova tentativa só vale para rede, tempo, 429 e 5xx. */
    readonly repetivel: boolean,
  ) {
    super(mensagem);
  }
}

export type Fetch = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export const URL_OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";
export const MODELO_PADRAO = "openai/gpt-4o-mini";

/** Dólar por milhão de tokens, só para estimar quando o provedor não devolve o custo. */
const PRECO_POR_MILHAO: Record<string, [number, number]> = {
  "openai/gpt-4o-mini": [0.15, 0.6],
};
const PRECO_DESCONHECIDO: [number, number] = [1, 3];

export function estimarCusto(modelo: string, entrada: number, saida: number) {
  const [pe, ps] = PRECO_POR_MILHAO[modelo] ?? PRECO_DESCONHECIDO;
  return (entrada * pe + saida * ps) / 1_000_000;
}

interface RespostaBruta {
  choices?: { message?: { content?: unknown } }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    cost?: number;
  };
  model?: string;
}

const numero = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;

export class ProvedorOpenRouter implements ProvedorIa {
  constructor(
    private readonly chave: string,
    private readonly http: Fetch = fetch as unknown as Fetch,
    private readonly referer = "https://sac-aisa.local",
  ) {}

  async completar(p: PedidoIa): Promise<RespostaIa> {
    const ctrl = new AbortController();
    const relogio = setTimeout(() => ctrl.abort(), p.timeoutMs);
    try {
      const r = await this.http(URL_OPENROUTER, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.chave}`,
          "Content-Type": "application/json",
          "HTTP-Referer": this.referer,
          "X-Title": "SAC AISA",
        },
        body: JSON.stringify({
          model: p.modelo,
          temperature: 0.1,
          max_tokens: p.maxTokens,
          response_format: { type: "json_object" },
          usage: { include: true },
          messages: [
            { role: "system", content: p.sistema },
            { role: "user", content: p.usuario },
          ],
        }),
        signal: ctrl.signal,
      });
      if (!r.ok) {
        // Só o status: o corpo pode repetir o cabeçalho da requisição.
        throw new ErroProvedor(
          `O OpenRouter respondeu ${r.status}.`,
          r.status === 429 || r.status >= 500,
        );
      }
      const j = (await r.json()) as RespostaBruta;
      const texto = j.choices?.[0]?.message?.content;
      if (typeof texto !== "string" || texto.trim() === "") {
        throw new ErroProvedor(
          "O OpenRouter devolveu uma resposta vazia.",
          true,
        );
      }
      const entrada = numero(j.usage?.prompt_tokens);
      const saida = numero(j.usage?.completion_tokens);
      const modelo =
        typeof j.model === "string" && j.model ? j.model : p.modelo;
      const custo =
        numero(j.usage?.cost) || estimarCusto(p.modelo, entrada, saida);
      return {
        texto,
        tokensEntrada: entrada,
        tokensSaida: saida,
        custoUsd: custo,
        modelo,
      };
    } catch (e) {
      if (e instanceof ErroProvedor) throw e;
      const tempo = e instanceof Error && e.name === "AbortError";
      throw new ErroProvedor(
        tempo
          ? "A IA demorou mais que o limite."
          : "Sem resposta do OpenRouter.",
        true,
      );
    } finally {
      clearTimeout(relogio);
    }
  }
}

/** Uma nova tentativa curta, só quando o erro é de rede, tempo ou servidor. */
export async function comNovaTentativa(
  provedor: ProvedorIa,
  pedido: PedidoIa,
  espera: (ms: number) => Promise<void> = (ms) =>
    new Promise((r) => setTimeout(r, ms)),
): Promise<RespostaIa> {
  try {
    return await provedor.completar(pedido);
  } catch (e) {
    if (!(e instanceof ErroProvedor) || !e.repetivel) throw e;
    await espera(400);
    return provedor.completar(pedido);
  }
}
