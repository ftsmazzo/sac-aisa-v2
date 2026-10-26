import type { LinhaVenda } from "@sac-aisa/domain";
import { describe, expect, it } from "vitest";
import { gravarVendasDia } from "./coeficiente";

describe("gravarVendasDia", () => {
  it("reimportar o mesmo SKU e dia substitui a quantidade", async () => {
    const mem = new Map<string, number>();
    const repo = {
      async substituir(linha: LinhaVenda) {
        mem.set(`${linha.sku}|${linha.data}`, linha.quantidade);
      },
    };
    const linha = (quantidade: number): LinhaVenda => ({
      sku: "G48",
      descricao: "Guincho",
      data: "2026-10-26",
      quantidade,
    });
    await gravarVendasDia(repo, [linha(5)]);
    await gravarVendasDia(repo, [linha(2)]);
    expect(mem.get("G48|2026-10-26")).toBe(2);
  });
});
