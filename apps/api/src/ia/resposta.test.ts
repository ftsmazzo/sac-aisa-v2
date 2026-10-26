import { consultaSemPessoa } from "@sac-aisa/domain";
import { describe, expect, it } from "vitest";
import { usuarioResposta } from "./prompts";
import { redigir } from "./redacao";

describe("resposta final", () => {
  it("o prompt não leva nome, e-mail, telefone nem pedido", () => {
    const consulta = redigir(
      consultaSemPessoa({
        descricao:
          "Maria Souza, maria@exemplo.invalid, 11988887777, pedido MLB999: a solda rompeu.",
        causa: "Solda",
        solucao: "Repor o braço.",
        clienteNome: "Maria Souza",
        email: "maria@exemplo.invalid",
        telefone: "11988887777",
        pedido: "MLB999",
      }),
      { nomes: ["Maria Souza"], literais: ["MLB999"] },
    );
    const prompt = usuarioResposta({
      produto: "Guincho",
      causa: "Solda",
      solucao: "Repor o braço.",
      texto: consulta,
      casos: [],
    });
    expect(prompt).toContain("solda");
    expect(prompt).not.toContain("Maria");
    expect(prompt).not.toContain("exemplo.invalid");
    expect(prompt).not.toContain("11988887777");
    expect(prompt).not.toContain("MLB999");
  });
});
