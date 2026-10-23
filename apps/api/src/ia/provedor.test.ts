import { describe, expect, it } from "vitest";
import {
  comNovaTentativa,
  ErroProvedor,
  type Fetch,
  ProvedorOpenRouter,
} from "./provedor";

const PEDIDO = {
  sistema: "s",
  usuario: "u",
  modelo: "openai/gpt-4o-mini",
  timeoutMs: 50,
  maxTokens: 100,
};
const CHAVE = "sk-or-chave-secreta-de-teste-0001";

function http(r: { ok?: boolean; status?: number; corpo?: unknown } | Error) {
  const chamadas: {
    url: string;
    headers: Record<string, string>;
    body: string;
  }[] = [];
  const f: Fetch = async (url, init) => {
    chamadas.push({ url, headers: init.headers, body: init.body });
    if (r instanceof Error) throw r;
    return {
      ok: r.ok ?? true,
      status: r.status ?? 200,
      json: async () => r.corpo ?? {},
    };
  };
  return { f, chamadas };
}

const OK = {
  choices: [{ message: { content: "{}" } }],
  usage: { prompt_tokens: 120, completion_tokens: 30, cost: 0.00042 },
  model: "openai/gpt-4o-mini",
};

describe("provedor OpenRouter", () => {
  it("manda a chave só no cabeçalho e lê tokens e custo do provedor", async () => {
    const { f, chamadas } = http({ corpo: OK });
    const r = await new ProvedorOpenRouter(CHAVE, f).completar(PEDIDO);
    expect(r).toMatchObject({
      texto: "{}",
      tokensEntrada: 120,
      tokensSaida: 30,
      custoUsd: 0.00042,
    });
    expect(chamadas[0].headers.Authorization).toBe(`Bearer ${CHAVE}`);
    expect(chamadas[0].body).not.toContain(CHAVE);
    expect(JSON.parse(chamadas[0].body)).toMatchObject({
      response_format: { type: "json_object" },
      max_tokens: 100,
    });
  });

  it("sem custo do provedor, estima pela tabela do modelo", async () => {
    const { f } = http({
      corpo: {
        ...OK,
        usage: { prompt_tokens: 1_000_000, completion_tokens: 0 },
      },
    });
    const r = await new ProvedorOpenRouter(CHAVE, f).completar(PEDIDO);
    expect(r.custoUsd).toBeCloseTo(0.15, 5);
  });

  it("a mensagem de erro nunca leva a chave", async () => {
    for (const r of [
      { ok: false, status: 401 },
      { ok: false, status: 503 },
      new Error(`falhou com ${CHAVE}`),
    ]) {
      const { f } = http(r);
      const erro = await new ProvedorOpenRouter(CHAVE, f)
        .completar(PEDIDO)
        .catch((e) => e);
      expect(erro).toBeInstanceOf(ErroProvedor);
      expect(String(erro.message)).not.toContain(CHAVE);
    }
  });

  it("4xx não repete; 429, 5xx, rede e tempo repetem", async () => {
    const rep = async (r: Parameters<typeof http>[0]) =>
      (
        await new ProvedorOpenRouter(CHAVE, http(r).f)
          .completar(PEDIDO)
          .catch((e) => e)
      ).repetivel;
    expect(await rep({ ok: false, status: 401 })).toBe(false);
    expect(await rep({ ok: false, status: 429 })).toBe(true);
    expect(await rep({ ok: false, status: 502 })).toBe(true);
    expect(await rep(new Error("rede"))).toBe(true);
    expect(await rep({ corpo: { choices: [] } })).toBe(true);
  });

  it("estoura o tempo e aborta", async () => {
    const lento: Fetch = (_u, init) =>
      new Promise((_res, rej) => {
        init.signal.addEventListener("abort", () =>
          rej(Object.assign(new Error("abort"), { name: "AbortError" })),
        );
      });
    const erro = await new ProvedorOpenRouter(CHAVE, lento)
      .completar(PEDIDO)
      .catch((e) => e);
    expect(erro.message).toMatch(/demorou/);
  });

  it("nova tentativa curta: só uma", async () => {
    let n = 0;
    const p = {
      async completar(): Promise<never> {
        n++;
        throw new ErroProvedor("x", true);
      },
    };
    await expect(
      comNovaTentativa(p, PEDIDO, async () => {}),
    ).rejects.toBeInstanceOf(ErroProvedor);
    expect(n).toBe(2);
  });
});
