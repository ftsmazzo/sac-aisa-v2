import { describe, expect, it } from "vitest";
import { lerEntradaPlano, tituloPlanoDoSku } from "./plano-criar";

describe("lerEntradaPlano", () => {
  it("aceita o mínimo com causa", () => {
    const r = lerEntradaPlano({
      titulo: "Reduzir solda",
      causaId: "solda",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor).toMatchObject({
      titulo: "Reduzir solda",
      causaId: "solda",
      origem: "manual",
      reclamacaoIds: [],
    });
  });

  it("aceita origem kpi com produto e vínculos", () => {
    const r = lerEntradaPlano({
      titulo: "Reduzir defeitos M08",
      produtoId: "prod-m08",
      bancadaId: "bancada-0",
      causaId: "solda",
      origem: "kpi",
      reclamacaoIds: ["r1", "r2", "r1"],
      baselineInicio: "2026-09-01",
      baselineFim: "2026-09-30",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.origem).toBe("kpi");
    expect(r.valor.reclamacaoIds).toEqual(["r1", "r2"]);
    expect(r.valor.baselineInicio).toBe("2026-09-01");
  });

  it("recusa sem filtro para medir efeito", () => {
    expect(lerEntradaPlano({ titulo: "Plano solto" }).ok).toBe(false);
  });

  it("recusa origem e período inválidos", () => {
    expect(
      lerEntradaPlano({ titulo: "Xpto", causaId: "a", origem: "whatsapp" }).ok,
    ).toBe(false);
    expect(
      lerEntradaPlano({
        titulo: "Xpto",
        causaId: "a",
        baselineInicio: "2026-10-01",
        baselineFim: "2026-09-01",
      }).ok,
    ).toBe(false);
  });
});

describe("tituloPlanoDoSku", () => {
  it("monta título curto com SKU e nome", () => {
    expect(tituloPlanoDoSku("m08", "ALICATE")).toBe(
      "Reduzir defeitos M08 · ALICATE",
    );
  });
});
