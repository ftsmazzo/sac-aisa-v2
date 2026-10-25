import { describe, expect, it } from "vitest";
import {
  FILTRO_INICIAL,
  fraseDoPainel,
  type ItemAberto,
  type PainelBruto,
  textoDuracao,
  vistaDoPainel,
} from "./painel-vista";

const GERADO = "2026-10-25T15:00:00.000Z";

function item(sobrescrever: Partial<ItemAberto> = {}): ItemAberto {
  return {
    id: "r1",
    numero: 1,
    abertura: "2026-10-20",
    estado: "em_tratativa",
    estadoDesde: "2026-10-22T12:00:00.000Z",
    setor: "Montagem",
    motivos: ["TRATATIVA_META"],
    horasAteAndamento: 24,
    dias: 5,
    faixa: "ate7",
    ...sobrescrever,
  };
}

function bruto(sobrescrever: Partial<PainelBruto> = {}): PainelBruto {
  return {
    hoje: "2026-10-25",
    geradoEm: GERADO,
    cortado: false,
    abertos: [item()],
    movimentos: [],
    entradas: [],
    ...sobrescrever,
  };
}

describe("vista do painel", () => {
  it("aponta volume e quem demora, pela mediana", () => {
    const v = vistaDoPainel(
      bruto({
        abertos: [
          item({ id: "a", setor: "Montagem", horasAteAndamento: 10 }),
          item({
            id: "b",
            numero: 2,
            setor: "Montagem",
            horasAteAndamento: 30,
            motivos: [],
            faixa: "ate2",
            dias: 1,
          }),
          item({
            id: "c",
            numero: 3,
            setor: "Solda",
            horasAteAndamento: 4,
            motivos: [],
          }),
          item({
            id: "d",
            numero: 4,
            setor: "Solda",
            horasAteAndamento: 6,
            motivos: [],
          }),
          item({
            id: "e",
            numero: 5,
            setor: "Solda",
            horasAteAndamento: 80,
            motivos: [],
          }),
        ],
      }),
      FILTRO_INICIAL,
    );
    expect(v.setorComMais?.setor).toBe("Solda");
    expect(v.setorComMais?.abertas).toBe(3);
    expect(v.setorMaisLento).toMatchObject({
      setor: "Montagem",
      medianaHoras: 20,
      amostra: 2,
    });
    expect(v.foraDoPrazo).toBe(1);
  });

  it("clicar no setor e no motivo recorta tudo, inclusive o fluxo", () => {
    const base = bruto({
      abertos: [
        item({ id: "a", setor: "Montagem" }),
        item({
          id: "b",
          numero: 2,
          setor: "Solda",
          motivos: ["SEM_RECEBIMENTO_SETOR"],
          estado: "encaminhada",
        }),
      ],
      movimentos: [
        {
          id: "m1",
          reclamacaoId: "a",
          numero: 1,
          quando: "2026-10-24T12:00:00.000Z",
          de: "recebida",
          para: "em_tratativa",
          setor: "Montagem",
          reabertura: false,
        },
        {
          id: "m2",
          reclamacaoId: "b",
          numero: 2,
          quando: "2026-10-24T13:00:00.000Z",
          de: "triagem",
          para: "finalizada",
          setor: "Solda",
          reabertura: false,
        },
        {
          id: "m3",
          reclamacaoId: "antiga",
          numero: 9,
          quando: "2026-08-01T13:00:00.000Z",
          de: null,
          para: "finalizada",
          setor: "Solda",
          reabertura: false,
        },
      ],
      entradas: [
        { id: "a", quando: "2026-10-20T00:00:00.000Z", setor: "Montagem" },
        { id: "b", quando: "2026-10-21T00:00:00.000Z", setor: "Solda" },
      ],
    });
    const porSetor = vistaDoPainel(base, { ...FILTRO_INICIAL, setor: "Solda" });
    expect(porSetor.abertos).toBe(1);
    expect(porSetor.movimentos.map((m) => m.id)).toEqual(["m2"]);
    expect(porSetor.entraram).toBe(1);
    expect(porSetor.fecharam).toBe(1);

    const porMotivo = vistaDoPainel(base, {
      ...FILTRO_INICIAL,
      motivo: "TRATATIVA_META",
    });
    expect(porMotivo.abertos).toBe(1);
    expect(porMotivo.movimentos.map((m) => m.id)).toEqual(["m1"]);
    expect(porMotivo.foraDoPrazo).toBe(1);
  });

  it("a frase diz o que fazer com o recorte", () => {
    const v = vistaDoPainel(bruto(), FILTRO_INICIAL);
    expect(fraseDoPainel(v, 30)).toContain("1 aberta está fora do prazo");
    expect(fraseDoPainel(v, 30)).toContain("Montagem concentra 1 aberta");
    expect(textoDuracao(26)).toBe("1,1 dias");
    expect(textoDuracao(3)).toBe("3 horas");
  });
});
