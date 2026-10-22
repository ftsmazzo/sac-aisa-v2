import { describe, expect, it } from "vitest";
import { formatarDuracao, formatarPrazo } from "./duracao";

const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

describe("formatarDuracao", () => {
  it("minutos, horas e dias, sem unidade zerada sobrando", () => {
    expect(formatarDuracao(45 * MIN)).toBe("45 min");
    expect(formatarDuracao(5 * HORA + 10 * MIN)).toBe("5 h 10 min");
    expect(formatarDuracao(2 * HORA)).toBe("2 h");
    expect(formatarDuracao(2 * DIA + 3 * HORA + 40 * MIN)).toBe("2 d 3 h");
    expect(formatarDuracao(3 * DIA)).toBe("3 d");
  });

  it("zero, negativo e menos de um minuto", () => {
    expect(formatarDuracao(0)).toBe("0 min");
    expect(formatarDuracao(-5000)).toBe("0 min");
    expect(formatarDuracao(Number.NaN)).toBe("0 min");
    expect(formatarDuracao(30_000)).toBe("menos de 1 min");
  });
});

describe("formatarPrazo", () => {
  const base = { prazo: "2026-10-30", vencido: false, encerrado: false };

  it("vence em N dias, hoje e estourou", () => {
    expect(formatarPrazo({ ...base, diasRestantes: 2 })).toBe(
      "vence em 2 dias",
    );
    expect(formatarPrazo({ ...base, diasRestantes: 1 })).toBe("vence em 1 dia");
    expect(formatarPrazo({ ...base, diasRestantes: 0 })).toBe("vence hoje");
    expect(formatarPrazo({ ...base, diasRestantes: -1, vencido: true })).toBe(
      "estourou há 1 dia",
    );
    expect(formatarPrazo({ ...base, diasRestantes: -4, vencido: true })).toBe(
      "estourou há 4 dias",
    );
  });

  it("encerrado vale mesmo com prazo vencido", () => {
    expect(
      formatarPrazo({
        ...base,
        diasRestantes: -3,
        vencido: true,
        encerrado: true,
      }),
    ).toBe("encerrado");
  });
});
