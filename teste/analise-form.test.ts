import { describe, expect, it } from "vitest";
import { montarCorpoAnalise, valoresDaAnalise } from "../lib/analise-form";
import { lerEstado } from "../lib/reclamacoes-formato";

const VAZIO = valoresDaAnalise(null);

describe("formulário de análise", () => {
  it("cadastro exige a decisão de retorno", () => {
    const r = montarCorpoAnalise(VAZIO, VAZIO, true);
    expect(r.ok).toBe(false);
  });

  it("cadastro sem retorno leva só a decisão e o texto preenchido", () => {
    const r = montarCorpoAnalise(
      { ...VAZIO, voltar: "nao", conclusao: "Uso incorreto." },
      VAZIO,
      true,
    );
    expect(r).toEqual({
      ok: true,
      corpo: { produtoPrecisaVoltar: false, conclusao: "Uso incorreto." },
    });
  });

  it("com retorno e data, leva a data de recebimento", () => {
    const r = montarCorpoAnalise(
      { ...VAZIO, voltar: "sim", recebidoEm: "2026-10-15" },
      VAZIO,
      true,
    );
    expect(r).toEqual({
      ok: true,
      corpo: { produtoPrecisaVoltar: true, produtoRecebidoEm: "2026-10-15" },
    });
  });

  it("sem retorno não aceita data de recebimento", () => {
    const r = montarCorpoAnalise(
      { ...VAZIO, voltar: "nao", recebidoEm: "2026-10-15" },
      VAZIO,
      true,
    );
    expect(r.ok).toBe(false);
  });

  it("edição leva só o que mudou, e limpar a data envia null", () => {
    const inicial = valoresDaAnalise({
      produtoPrecisaVoltar: true,
      produtoRecebidoEm: "2026-10-15",
      conclusao: "A.",
      resultado: "",
    });
    expect(
      montarCorpoAnalise({ ...inicial, conclusao: "B." }, inicial, false),
    ).toEqual({ ok: true, corpo: { conclusao: "B." } });
    expect(
      montarCorpoAnalise({ ...inicial, recebidoEm: "" }, inicial, false),
    ).toEqual({ ok: true, corpo: { produtoRecebidoEm: null } });
  });

  it("a ação de análise vem da URL da ficha", () => {
    expect(lerEstado({ ficha: "x", acao: "analise" }).acao).toBe("analise");
    expect(lerEstado({ acao: "invalida" }).acao).toBeUndefined();
  });
});
