import { describe, expect, it } from "vitest";
import {
  diasEmAberto,
  faixaDeIdade,
  horasAteAndamento,
  mediana,
  motivosDePrazo,
} from "./painel";

const HOJE = "2026-10-25";
const AGORA = new Date("2026-10-25T15:00:00.000Z");

describe("motivos de prazo", () => {
  it("tratativa além de 2 dias está fora da meta", () => {
    expect(
      motivosDePrazo(
        { data: "2026-10-22", devolucao: "NA", estado: "em_tratativa" },
        HOJE,
        AGORA,
      ),
    ).toContain("TRATATIVA_META");
  });

  it("2 dias ainda está dentro da meta", () => {
    expect(
      motivosDePrazo(
        { data: "2026-10-23", devolucao: "NA", estado: "em_tratativa" },
        HOJE,
        AGORA,
      ),
    ).not.toContain("TRATATIVA_META");
  });

  it("produto parado além de 7 dias entra no prazo", () => {
    expect(
      motivosDePrazo(
        { data: "2026-10-17", devolucao: "AGUARDANDO", estado: "recebida" },
        HOJE,
        AGORA,
      ),
    ).toContain("AGUARDANDO_DIAS");
  });

  it("custo alto não conta como fora do prazo", () => {
    expect(
      motivosDePrazo(
        {
          data: HOJE,
          devolucao: "NA",
          estado: "em_tratativa",
          freteEnvio: 800,
        },
        HOJE,
        AGORA,
      ),
    ).not.toContain("CUSTO_ALTO" as never);
  });

  it("setor que não recebe em 24 horas está fora do prazo", () => {
    expect(
      motivosDePrazo(
        {
          data: HOJE,
          devolucao: "NA",
          estado: "encaminhada",
          estadoDesde: "2026-10-24T13:00:00.000Z",
        },
        HOJE,
        AGORA,
      ),
    ).toContain("SEM_RECEBIMENTO_SETOR");
  });
});

describe("andamento do setor", () => {
  it("mede da encaminhada até a recebida", () => {
    expect(
      horasAteAndamento([
        { para: "triagem", quando: "2026-10-20T10:00:00.000Z" },
        { para: "encaminhada", quando: "2026-10-20T12:00:00.000Z" },
        { para: "recebida", quando: "2026-10-21T14:00:00.000Z" },
      ]),
    ).toBe(26);
  });

  it("sem recebimento ainda não houve andamento", () => {
    expect(
      horasAteAndamento([
        { para: "encaminhada", quando: "2026-10-20T12:00:00.000Z" },
      ]),
    ).toBeNull();
  });

  it("marco invertido não vira tempo negativo", () => {
    expect(
      horasAteAndamento([
        { para: "recebida", quando: "2026-10-20T10:00:00.000Z" },
        { para: "encaminhada", quando: "2026-10-21T10:00:00.000Z" },
      ]),
    ).toBeNull();
  });
});

describe("idade e mediana", () => {
  it("faixas seguem 2, 7 e 10 dias", () => {
    expect(faixaDeIdade(2)).toBe("ate2");
    expect(faixaDeIdade(3)).toBe("ate7");
    expect(faixaDeIdade(7)).toBe("ate7");
    expect(faixaDeIdade(8)).toBe("ate10");
    expect(faixaDeIdade(10)).toBe("ate10");
    expect(faixaDeIdade(11)).toBe("alem");
  });

  it("dias em aberto não fica negativo", () => {
    expect(diasEmAberto("2026-10-26", HOJE)).toBe(0);
    expect(diasEmAberto("2026-10-20", HOJE)).toBe(5);
  });

  it("mediana de amostra par e ímpar", () => {
    expect(mediana([1, 100, 3])).toBe(3);
    expect(mediana([10, 30])).toBe(20);
    expect(mediana([])).toBeNull();
  });
});
