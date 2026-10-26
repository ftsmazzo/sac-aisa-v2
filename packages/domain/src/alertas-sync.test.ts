import { describe, expect, it } from "vitest";
import { chaveDoAlerta, chavesParaResolver } from "./alertas-sync";

describe("chavesParaResolver", () => {
  it("resolve o alerta que saiu e mantém o que continua", () => {
    const prazo = chaveDoAlerta("r1", "PRAZO_MARKETPLACE");
    const custo = chaveDoAlerta("r1", "CUSTO_ALTO");
    const fila = chaveDoAlerta("r2", "RASCUNHO_PENDENTE");
    expect(chavesParaResolver([prazo, custo], [prazo, fila])).toEqual([custo]);
  });
});
