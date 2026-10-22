import { describe, expect, it } from "vitest";
import {
  formatarData,
  lerArquivoDeImportacao,
  mensagemImportacao,
} from "../lib/importacao";

const arquivo = {
  regs: [
    { reg: 1, data: "2026-10-20" },
    { reg: 2, data: "2026-01-05" },
    { reg: 3, data: "data-ruim" },
  ],
  causasExtras: [{}, {}],
  vendas: [{}, {}, {}],
  usuarios: [{}],
  fotos: 4,
};

describe("leitura do arquivo de importação", () => {
  it("resume o arquivo antes de enviar", () => {
    const r = lerArquivoDeImportacao(JSON.stringify(arquivo));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.resumo).toEqual({
        reclamacoes: 3,
        vendas: 3,
        usuarios: 1,
        causasGravadas: 2,
        fotos: 4,
        primeiraData: "2026-01-05",
        ultimaData: "2026-10-20",
      });
    }
  });

  it("recusa texto que não é JSON", () => {
    const r = lerArquivoDeImportacao("isso não é json");
    expect(r).toMatchObject({
      ok: false,
      mensagem: "O arquivo não é um JSON válido.",
    });
  });

  it("recusa JSON que não é um backup", () => {
    for (const ruim of ["[]", "42", "null", '"texto"', "{}", '{"regs":[]}']) {
      expect(lerArquivoDeImportacao(ruim).ok).toBe(false);
    }
  });

  it("aceita arquivo só com reclamações", () => {
    const r = lerArquivoDeImportacao(
      JSON.stringify({ regs: [{ reg: 1, data: "2026-03-01" }] }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.resumo.vendas).toBe(0);
  });
});

describe("mensagens e formatação", () => {
  it("traduz cada status para uma frase que a pessoa entende", () => {
    expect(mensagemImportacao(401)).toContain("sessão expirou");
    expect(mensagemImportacao(403)).toContain("administrador");
    expect(mensagemImportacao(409)).toContain("em andamento");
    expect(mensagemImportacao(413)).toContain("grande demais");
    expect(mensagemImportacao(500)).toContain("Não foi possível");
  });

  it("usa a mensagem da API quando o arquivo é recusado", () => {
    expect(mensagemImportacao(400, "Há reclamação sem data.")).toBe(
      "Há reclamação sem data.",
    );
    expect(mensagemImportacao(400)).toBe("O arquivo não foi aceito.");
  });

  it("formata a data em dia, mês e ano", () => {
    expect(formatarData("2026-10-20")).toBe("20/10/2026");
    expect(formatarData(null)).toBe("—");
  });
});
