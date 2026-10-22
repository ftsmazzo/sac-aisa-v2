import { describe, expect, it } from "vitest";
import {
  type FichaEditavel,
  montarCorpo,
  paraNumero,
  valoresDaFicha,
  valoresVazios,
} from "./reclamacoes-form";

const HOJE = "2026-10-22";

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

describe("montarCorpo ao criar", () => {
  it("exige canal e descrição", () => {
    const v = valoresVazios(HOJE);
    expect(montarCorpo(v, valoresVazios(HOJE), true).ok).toBe(false);
    expect(montarCorpo({ ...v, canalId: "c1" }, v, true).ok).toBe(false);
  });

  it("manda só o que foi preenchido, sem situação nem flags", () => {
    const v = {
      ...valoresVazios(HOJE),
      canalId: "c1",
      descricao: "Quebrou.",
      custos: { ...valoresVazios(HOJE).custos, guia: "12,50" },
    };
    const r = montarCorpo(v, valoresVazios(HOJE), true);
    expect(r).toEqual({
      ok: true,
      corpo: {
        canalId: "c1",
        devolucao: "NA",
        dataAbertura: HOJE,
        descricao: "Quebrou.",
        custos: { guia: 12.5 },
      },
    });
  });

  it("custo inválido volta com o nome do campo", () => {
    const v = {
      ...valoresVazios(HOJE),
      canalId: "c1",
      descricao: "x",
      custos: { ...valoresVazios(HOJE).custos, estorno: "xx" },
    };
    expect(montarCorpo(v, valoresVazios(HOJE), true)).toEqual({
      ok: false,
      mensagem: "Valor inválido em Estorno.",
    });
  });
});

const FICHA: FichaEditavel = {
  canal: { id: "c1" },
  marca: { id: "m1" },
  produto: { codigo: "P1" },
  bancada: null,
  causa: { id: "avaria" },
  causaManual: false,
  setorResp: { id: "s-log" },
  setorRespManual: false,
  devolucao: "NA",
  dataAbertura: "2026-10-01",
  dataRecebimento: null,
  dataAcao: null,
  descricao: "Amassada.",
  laudo: "",
  solucao: "",
  observacao: "",
  pedido: "123",
  clienteNome: "Maria",
  cidade: "",
  uf: "",
  transportadora: "",
  peca: "",
  garantia: "",
  procedencia: "",
  protocoloExterno: null,
  custos: {
    freteEnvio: 10,
    freteRetorno: 0,
    valorPeca: 0,
    estorno: 0,
    desconto: 0,
    guia: 0,
  },
};

describe("montarCorpo ao editar", () => {
  it("sem mexer em nada, não há o que salvar", () => {
    const v = valoresDaFicha(FICHA);
    expect(montarCorpo(v, v, false).ok).toBe(false);
  });

  it("causa e setor automáticos aparecem como vazio e não vão se ninguém mexeu", () => {
    const v = valoresDaFicha(FICHA);
    expect(v.causaId).toBe("");
    expect(v.setorRespId).toBe("");
    const r = montarCorpo({ ...v, peca: "Fusível" }, v, false);
    expect(r).toEqual({ ok: true, corpo: { peca: "Fusível" } });
  });

  it("escolher setor manda o id; limpar manda null para voltar ao automático", () => {
    const manual = valoresDaFicha({
      ...FICHA,
      setorRespManual: true,
      setorResp: { id: "s-sac" },
    });
    expect(montarCorpo({ ...manual, setorRespId: "" }, manual, false)).toEqual({
      ok: true,
      corpo: { setorRespId: null },
    });
    const auto = valoresDaFicha(FICHA);
    expect(
      montarCorpo({ ...auto, setorRespId: "s-solda" }, auto, false),
    ).toEqual({ ok: true, corpo: { setorRespId: "s-solda" } });
  });

  it("limpar a data de ação manda null; custo alterado vai em número", () => {
    const base = valoresDaFicha({ ...FICHA, dataAcao: "2026-10-05" });
    const r = montarCorpo(
      {
        ...base,
        dataAcao: "",
        custos: { ...base.custos, freteEnvio: "15,5" },
      },
      base,
      false,
    );
    expect(r).toEqual({
      ok: true,
      corpo: { dataAcao: null, custos: { freteEnvio: 15.5 } },
    });
  });

  it("custo zerado aparece vazio na tela e voltar a zero manda 0", () => {
    const v = valoresDaFicha(FICHA);
    expect(v.custos.freteEnvio).toBe("10");
    expect(v.custos.guia).toBe("");
    const r = montarCorpo(
      { ...v, custos: { ...v.custos, freteEnvio: "" } },
      v,
      false,
    );
    expect(r).toEqual({ ok: true, corpo: { custos: { freteEnvio: 0 } } });
  });
});
