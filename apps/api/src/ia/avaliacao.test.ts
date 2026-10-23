import { describe, expect, it } from "vitest";
import {
  avaliar,
  type CasoHistorico,
  estimarCustoAvaliacao,
  formatarRelatorio,
  sortear,
} from "./avaliacao";
import { CAUSAS_TESTE, PERGUNTAS_TESTE, provedorFalso } from "./fixtures";

const caso = (
  id: string,
  causaId: string,
  descricao: string,
): CasoHistorico => ({
  id,
  descricao,
  produto: "Fritadeira",
  sku: "F10",
  canal: "Mercado Livre",
  clienteNome: "Maria Souza",
  pedido: "20001234567",
  causaId,
  setorNome: CAUSAS_TESTE.find((c) => c.id === causaId)?.setorNome ?? "",
});

describe("avaliação da triagem", () => {
  it("a amostra é repetível e respeita o tamanho", () => {
    const lista = Array.from({ length: 100 }, (_, i) => i);
    expect(sortear(lista, 30, 7)).toEqual(sortear(lista, 30, 7));
    expect(sortear(lista, 30, 7)).toHaveLength(30);
    expect(sortear(lista, 30, 7)).not.toEqual(sortear(lista, 30, 8));
    expect(sortear([1, 2], 30)).toHaveLength(2);
  });

  it("mede acerto de causa e de setor contra o histórico, soma o custo e não manda dado pessoal", async () => {
    const casos = [
      caso("#1", "eletrico", "Maria Souza (11) 91234-5678: o produto nao liga"),
      caso("#2", "avaria", "chegou amassado, pedido 20001234567"),
      caso("#3", "kit", "faltou parafuso"),
    ];
    const respostas = ["eletrico", "avaria", "eletrico"].map((causaId) =>
      JSON.stringify({
        causaId,
        confianca: 0.8,
        sintese: "x",
        respondidas: [],
      }),
    );
    const { provedor, pedidos } = provedorFalso(respostas);
    const { relatorio, casos: r } = await avaliar({
      casos,
      causas: CAUSAS_TESTE,
      perguntas: PERGUNTAS_TESTE,
      provedor,
      modelo: "openai/gpt-4o-mini",
    });
    expect(relatorio).toMatchObject({
      total: 3,
      comResposta: 3,
      falhas: 0,
      acertoCausaIa: 2,
      acertoSetorIa: 2,
    });
    expect(relatorio.custoUsd).toBeCloseTo(0.0006, 6);
    expect(relatorio.erradas).toEqual([
      { id: "#3", gabarito: "kit", ia: "eletrico" },
    ]);
    expect(r[2].erro).toBeNull();
    const enviado = JSON.stringify(pedidos);
    for (const dado of ["Maria", "91234", "20001234567"])
      expect(enviado).not.toContain(dado);
    const texto = formatarRelatorio(relatorio, "openai/gpt-4o-mini");
    expect(texto).toMatch(/Acerto de causa: IA 66\.7%/);
    expect(texto).not.toMatch(/Maria|parafuso/);
  });

  it("saída inválida conta como falha, sem derrubar a rodada", async () => {
    const { provedor } = provedorFalso(["isto nao e json"]);
    const { relatorio } = await avaliar({
      casos: [caso("#1", "eletrico", "nao liga")],
      causas: CAUSAS_TESTE,
      perguntas: PERGUNTAS_TESTE,
      provedor,
      modelo: "m/m",
    });
    expect(relatorio).toMatchObject({ comResposta: 0, falhas: 1 });
  });

  it("estima o custo antes de gastar", () => {
    expect(estimarCustoAvaliacao(30)).toBeGreaterThan(0);
    expect(estimarCustoAvaliacao(30)).toBeLessThan(0.1);
  });
});
