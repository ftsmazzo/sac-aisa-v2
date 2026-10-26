import { describe, expect, it } from "vitest";
import { deveVigiar } from "./erros";

describe("deveVigiar", () => {
  it("sem DSN a aplicação não envia erro para fora", () => {
    expect(deveVigiar(undefined)).toBe(false);
    expect(deveVigiar("")).toBe(false);
    expect(deveVigiar("   ")).toBe(false);
  });

  it("com DSN o monitor de erro liga", () => {
    expect(deveVigiar("https://chave@glitchtip.exemplo/1")).toBe(true);
  });
});
