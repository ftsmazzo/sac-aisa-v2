import { describe, expect, it } from "vitest";
import { rascunhoDeResposta } from "./resposta-fechamento";

describe("rascunho da resposta de fechamento", () => {
  it("junta solução, diagnóstico e custo em reais", () => {
    const texto = rascunhoDeResposta({
      solucao: "Troca da argola.",
      conclusoes: ["A peça veio torta.", ""],
      custoTotal: 1234.5,
    });
    expect(texto).toContain("{{nome_cliente}}");
    expect(texto).toContain("Troca da argola.");
    expect(texto).toContain("A peça veio torta.");
    expect(texto).toContain("R$ 1.234,50");
  });

  it("sem solução e sem custo, fecha com o texto genérico", () => {
    const texto = rascunhoDeResposta({
      solucao: "  ",
      conclusoes: [],
      custoTotal: 0,
    });
    expect(texto).toContain("Concluímos o atendimento da sua reclamação.");
    expect(texto).not.toContain("R$");
    expect(texto).not.toContain("O que o setor verificou");
  });
});
