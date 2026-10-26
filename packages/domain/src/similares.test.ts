import { describe, expect, it } from "vitest";
import { casosParecidos, consultaSemPessoa } from "./similares";

describe("consultaSemPessoa", () => {
  it("não leva nome, e-mail, telefone nem pedido", () => {
    const texto = consultaSemPessoa({
      descricao: "A solda do braço rompeu na primeira semana.",
      causa: "Solda",
      solucao: "Repor o braço soldado.",
      clienteNome: "Maria Souza",
      email: "maria@exemplo.invalid",
      telefone: "11999998888",
      pedido: "MLB1234567890",
    });
    expect(texto).toContain("solda");
    expect(texto).not.toContain("Maria");
    expect(texto).not.toContain("exemplo.invalid");
    expect(texto).not.toContain("11999998888");
    expect(texto).not.toContain("MLB1234567890");
  });
});

describe("casosParecidos", () => {
  it("coloca na frente o caso que fala da mesma falha", () => {
    const ordem = casosParecidos("solda do braço rompeu na emenda", [
      {
        id: "pintura",
        texto: "A tinta descascou na lateral da carenagem.",
        solucao: "Repintar a peça.",
      },
      {
        id: "solda",
        texto: "A solda da emenda do braço rompeu com o uso.",
        solucao: "Refazer a solda do braço.",
      },
    ]);
    expect(ordem[0]?.id).toBe("solda");
    expect(ordem[0]?.afinidade).toBeGreaterThan(ordem[1]?.afinidade ?? 0);
  });
});
