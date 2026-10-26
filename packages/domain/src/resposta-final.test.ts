import { describe, expect, it } from "vitest";
import { respostaPermitida } from "./resposta-final";

describe("respostaPermitida", () => {
  it("aceita o texto que cabe na solução e recusa link ou prazo novo", () => {
    expect(
      respostaPermitida("Vamos repor a peça.", "Repor a peça."),
    ).toBeNull();
    expect(
      respostaPermitida("Fica pronto em 3 dias.", "O conserto leva 3 dias."),
    ).toBeNull();
    expect(respostaPermitida("Veja https://exemplo.invalid", "")).toMatch(
      /link/,
    );
    expect(
      respostaPermitida("Entregamos em 15 dias.", "Repor a peça."),
    ).toMatch(/prazo/);
  });
});
