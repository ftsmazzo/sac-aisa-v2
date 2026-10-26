import { describe, expect, it } from "vitest";
import { efeitoDoPlano, podeEnviarPlano } from "./efeito-plano";

describe("efeitoDoPlano", () => {
  it("ocorrência menor fecha o efeito como queda", () => {
    expect(efeitoDoPlano(10, 4)).toEqual({
      quedaPercentual: 60,
      resultado: "caiu",
      reabrir: false,
    });
  });

  it("ocorrência igual ou maior reabre o plano", () => {
    expect(efeitoDoPlano(10, 10).reabrir).toBe(true);
    expect(efeitoDoPlano(10, 12)).toMatchObject({
      resultado: "nao_caiu",
      reabrir: true,
    });
    expect(efeitoDoPlano(0, 0).reabrir).toBe(true);
  });

  it("recusa contagem quebrada", () => {
    expect(() => efeitoDoPlano(-1, 0)).toThrow(/inválida/);
    expect(() => efeitoDoPlano(1.5, 1)).toThrow(/inválida/);
  });
});

describe("podeEnviarPlano", () => {
  it("treino só chega ao ClickUp com o interruptor ligado", () => {
    expect(podeEnviarPlano([true, true], false)).toBe(false);
    expect(podeEnviarPlano([true, true], true)).toBe(true);
    expect(podeEnviarPlano([true, false], false)).toBe(true);
    expect(podeEnviarPlano([], false)).toBe(true);
  });
});
