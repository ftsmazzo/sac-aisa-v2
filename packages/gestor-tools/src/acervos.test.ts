import { describe, expect, it } from "vitest";
import { ACERVOS, acervoDeFonte, acervoValido } from "./acervos";

describe("acervos", () => {
  it("mapeia fonte → acervo", () => {
    expect(acervoDeFonte("perfil")).toBe("institucional");
    expect(acervoDeFonte("pergunta")).toBe("politica-sac");
    expect(acervoDeFonte("causa")).toBe("politica-sac");
    expect(acervoDeFonte("caso")).toBe("casos");
    expect(acervoDeFonte("url")).toBe("produtos-site");
    expect(acervoDeFonte("manual")).toBe("manual");
  });

  it("valida ids conhecidos", () => {
    expect(acervoValido("institucional")).toBe(true);
    expect(acervoValido("xyz")).toBe(false);
    expect(ACERVOS.length).toBe(5);
  });
});
