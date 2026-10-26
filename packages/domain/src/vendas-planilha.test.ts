import { describe, expect, it } from "vitest";
import { lerPlanilhaVendas } from "./vendas-planilha";

describe("lerPlanilhaVendas", () => {
  it("lê código, descrição, data DD/MM/AAAA e quantidade", () => {
    const r = lerPlanilhaVendas(
      "Código\tDescrição\tData\tQuantidade\nG48\tGuincho\t26/10/2026\t12\n",
    );
    expect(r.erros).toEqual([]);
    expect(r.linhas).toEqual([
      {
        sku: "G48",
        descricao: "Guincho",
        data: "2026-10-26",
        quantidade: 12,
      },
    ]);
  });

  it("soma o mesmo SKU e dia na cola e deixa uma quantidade para gravar", () => {
    const r = lerPlanilhaVendas("a1;Peca;01/02/2026;2\nA1;Peça;01/02/2026;3");
    expect(r.somadas).toBe(1);
    expect(r.linhas).toEqual([
      {
        sku: "A1",
        descricao: "Peça",
        data: "2026-02-01",
        quantidade: 5,
      },
    ]);
  });

  it("recusa data impossível e quantidade negativa", () => {
    const r = lerPlanilhaVendas("A\tP\t31/02/2026\t1\nB\tP\t01/03/2026\t-1");
    expect(r.linhas).toEqual([]);
    expect(r.erros.map((e) => e.mensagem)).toEqual([
      "Data inválida. Use DD/MM/AAAA.",
      "Quantidade inválida.",
    ]);
  });

  it("entende milhar com ponto", () => {
    const r = lerPlanilhaVendas("A,Peca,02/03/2026,1.000");
    expect(r.linhas[0]?.quantidade).toBe(1000);
  });
});
