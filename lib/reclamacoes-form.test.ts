import { describe, expect, it } from "vitest";
import {
  type FichaEditavel,
  montarCorpo,
  valoresDaFicha,
  valoresVazios,
} from "./reclamacoes-form";

const HOJE = "2026-10-22";

describe("montarCorpo ao criar (triagem)", () => {
  it("exige canal e descrição", () => {
    const v = valoresVazios(HOJE);
    expect(montarCorpo(v, valoresVazios(HOJE), true).ok).toBe(false);
    expect(montarCorpo({ ...v, canalId: "c1" }, v, true).ok).toBe(false);
  });

  it("manda só o que foi preenchido, sem situação, causa nem campo do setor", () => {
    const v = {
      ...valoresVazios(HOJE),
      canalId: "c1",
      descricao: "Quebrou.",
      clienteNome: "Maria",
    };
    const r = montarCorpo(v, valoresVazios(HOJE), true);
    expect(r).toEqual({
      ok: true,
      corpo: {
        canalId: "c1",
        dataAbertura: HOJE,
        descricao: "Quebrou.",
        clienteNome: "Maria",
      },
    });
  });

  it("o corpo da triagem nunca leva laudo, solução, causa, devolução nem custo", () => {
    const v = {
      ...valoresVazios(HOJE),
      canalId: "c1",
      descricao: "x",
      pedido: "123",
      observacao: "ligar de manhã",
    };
    const r = montarCorpo(v, valoresVazios(HOJE), true);
    if (!r.ok) throw new Error("era esperado ok");
    for (const k of [
      "laudo",
      "solucao",
      "causaId",
      "devolucao",
      "dataAcao",
      "dataRecebimento",
      "custos",
      "peca",
      "garantia",
      "procedencia",
    ]) {
      expect(r.corpo).not.toHaveProperty(k);
    }
  });
});

const FICHA: FichaEditavel = {
  canal: { id: "c1" },
  marca: { id: "m1" },
  produto: { codigo: "P1" },
  bancada: null,
  setorResp: { id: "s-log" },
  setorRespManual: false,
  dataAbertura: "2026-10-01",
  descricao: "Amassada.",
  observacao: "",
  pedido: "123",
  clienteNome: "Maria",
  cidade: "",
  uf: "",
  transportadora: "",
  protocoloExterno: null,
};

describe("montarCorpo ao editar (triagem)", () => {
  it("sem mexer em nada, não há o que salvar", () => {
    const v = valoresDaFicha(FICHA);
    expect(montarCorpo(v, v, false).ok).toBe(false);
  });

  it("setor automático aparece como vazio e não vai se ninguém mexeu", () => {
    const v = valoresDaFicha(FICHA);
    expect(v.setorRespId).toBe("");
    const r = montarCorpo({ ...v, cidade: "Campinas" }, v, false);
    expect(r).toEqual({ ok: true, corpo: { cidade: "Campinas" } });
  });

  it("escolher setor manda o id e o motivo; limpar manda null para voltar ao automático", () => {
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
      montarCorpo(
        { ...auto, setorRespId: "s-solda", motivoTroca: " Era solda. " },
        auto,
        false,
      ),
    ).toEqual({
      ok: true,
      corpo: { setorRespId: "s-solda", motivoTroca: "Era solda." },
    });
  });

  it("motivo sem troca de setor não vai", () => {
    const v = valoresDaFicha(FICHA);
    const r = montarCorpo(
      { ...v, motivoTroca: "solto", cidade: "X" },
      v,
      false,
    );
    expect(r).toEqual({ ok: true, corpo: { cidade: "X" } });
  });

  it("voltar ao automático não leva motivo", () => {
    const manual = valoresDaFicha({
      ...FICHA,
      setorRespManual: true,
      setorResp: { id: "s-sac" },
    });
    expect(
      montarCorpo(
        { ...manual, setorRespId: "", motivoTroca: "texto" },
        manual,
        false,
      ),
    ).toEqual({ ok: true, corpo: { setorRespId: null } });
  });
});
