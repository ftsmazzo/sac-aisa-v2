import { describe, expect, it } from "vitest";
import {
  type FichaDoSetor,
  montarCorpoSolucao,
  paraNumero,
  valoresDaSolucao,
} from "./solucao-form";

const FICHA: FichaDoSetor = {
  causa: { id: "avaria" },
  causaManual: false,
  laudo: "",
  solucao: "",
  procedencia: "",
  garantia: "",
  peca: "",
  dataAcao: null,
  custos: {
    freteEnvio: 10,
    freteRetorno: 0,
    valorPeca: 0,
    estorno: 0,
    desconto: 0,
    guia: 0,
  },
};

describe("paraNumero", () => {
  it("entende vírgula, ponto de milhar e vazio", () => {
    expect(paraNumero("12,5")).toBe(12.5);
    expect(paraNumero("1.234,56")).toBe(1234.56);
    expect(paraNumero("R$ 30")).toBe(30);
    expect(paraNumero("12.5")).toBe(12.5);
    expect(paraNumero("")).toBe(0);
  });

  it("recusa lixo, negativo e mais de duas casas", () => {
    expect(paraNumero("abc")).toBeNull();
    expect(paraNumero("-5")).toBeNull();
    expect(paraNumero("1,234")).toBeNull();
  });
});

describe("montarCorpoSolucao", () => {
  it("sem mexer em nada, não há o que salvar", () => {
    const v = valoresDaSolucao(FICHA);
    expect(montarCorpoSolucao(v, v).ok).toBe(false);
  });

  it("causa automática aparece vazia e só vai quando o setor escolhe", () => {
    const v = valoresDaSolucao(FICHA);
    expect(v.causaId).toBe("");
    expect(montarCorpoSolucao({ ...v, solucao: "Reenvio." }, v)).toEqual({
      ok: true,
      corpo: { solucao: "Reenvio." },
    });
    expect(montarCorpoSolucao({ ...v, causaId: "solda" }, v)).toEqual({
      ok: true,
      corpo: { causaId: "solda" },
    });
  });

  it("causa definida à mão aparece escolhida e voltar para vazio manda null", () => {
    const manual = valoresDaSolucao({ ...FICHA, causaManual: true });
    expect(manual.causaId).toBe("avaria");
    expect(montarCorpoSolucao({ ...manual, causaId: "" }, manual)).toEqual({
      ok: true,
      corpo: { causaId: null },
    });
  });

  it("a data de ação resolve; limpar a data manda null e reabre", () => {
    const v = valoresDaSolucao(FICHA);
    expect(montarCorpoSolucao({ ...v, dataAcao: "2026-10-20" }, v)).toEqual({
      ok: true,
      corpo: { dataAcao: "2026-10-20" },
    });
    const resolvida = valoresDaSolucao({ ...FICHA, dataAcao: "2026-10-05" });
    expect(
      montarCorpoSolucao({ ...resolvida, dataAcao: "" }, resolvida),
    ).toEqual({ ok: true, corpo: { dataAcao: null } });
  });

  it("custo alterado vai em número e inválido volta com o nome do campo", () => {
    const v = valoresDaSolucao(FICHA);
    expect(v.custos.freteEnvio).toBe("10");
    expect(v.custos.guia).toBe("");
    expect(
      montarCorpoSolucao(
        { ...v, custos: { ...v.custos, freteEnvio: "15,5" } },
        v,
      ),
    ).toEqual({ ok: true, corpo: { custos: { freteEnvio: 15.5 } } });
    expect(
      montarCorpoSolucao({ ...v, custos: { ...v.custos, estorno: "xx" } }, v),
    ).toEqual({ ok: false, mensagem: "Valor inválido em Estorno." });
    expect(
      montarCorpoSolucao({ ...v, custos: { ...v.custos, freteEnvio: "" } }, v),
    ).toEqual({ ok: true, corpo: { custos: { freteEnvio: 0 } } });
  });
});
