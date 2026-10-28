import { describe, expect, it } from "vitest";
import { lerJson } from "./esquemas";
import { esquemaRedacaoPlano, esquemaSintesePlano } from "./plano-esquemas";
import { montarFallbackRegra } from "./plano-sugerir";

describe("esquemas do plano IA", () => {
  it("aceita síntese mínima válida", () => {
    const s = esquemaSintesePlano.parse({
      padroes: ["solda soltando na cuba"],
      hipoteses: ["falha de processo na bancada"],
      evidencias: ["3 laudos citam cordão irregular"],
      lacunas: ["falta foto do lote"],
      resumo:
        "Há recorrência de solda soltando no SKU, com laudos alinhados e pouca evidência de lote.",
    });
    expect(s.resumo.length).toBeGreaterThan(20);
  });

  it("aceita redação e rejeita título curto", () => {
    const r = esquemaRedacaoPlano.parse({
      titulo: "Reduzir solda soltando no G48",
      descricao:
        "1. Auditar cordão na bancada 0.\n2. Treinar operadores.\n3. Medir reincidência em 30 dias.",
      prioridade: "alta",
      avisos: ["Sem foto do lote nos casos"],
    });
    expect(r.prioridade).toBe("alta");
    expect(() =>
      esquemaRedacaoPlano.parse({
        titulo: "ab",
        descricao: "texto longo o suficiente para passar no mínimo",
        prioridade: "media",
      }),
    ).toThrow();
  });

  it("lê JSON com cerca de código", () => {
    const j = lerJson(
      '```json\n{"titulo":"Xpto plano ok","descricao":"123456789012345678901","prioridade":"media","avisos":[]}\n```',
    );
    expect(esquemaRedacaoPlano.parse(j).titulo).toBe("Xpto plano ok");
  });
});

describe("montarFallbackRegra", () => {
  it("usa a ação da causa quando existe", () => {
    const r = montarFallbackRegra({
      sku: "G48",
      produtoNome: "ABAFADOR",
      acaoCausa: "Conferir solda na montagem.",
      aviso: "Sem chave",
    });
    expect(r.fonte).toBe("regra");
    expect(r.descricao).toContain("solda");
    expect(r.titulo).toContain("G48");
  });
});
