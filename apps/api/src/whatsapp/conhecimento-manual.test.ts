import { describe, expect, it } from "vitest";
import { slugManual, tipoManual } from "./conhecimento-manual";

describe("slugManual", () => {
  it("normaliza nome e inclui tipo", () => {
    expect(slugManual("Manual Prateleira AISA.pdf")).toBe(
      "manual-prateleira-aisa-pdf",
    );
    expect(slugManual("Guia_Montagem (v2).docx")).toBe(
      "guia_montagem-v2-docx",
    );
  });

  it("trata vazio e extensão", () => {
    expect(slugManual("")).toBe("manual-txt");
    expect(slugManual("...")).toBe("manual-txt");
    expect(slugManual("notas.txt")).toBe("notas-txt");
  });
});

describe("tipoManual", () => {
  it("prioriza mime e extensão", () => {
    expect(tipoManual("application/pdf", "x.bin")).toBe("pdf");
    expect(
      tipoManual(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "x.bin",
      ),
    ).toBe("docx");
    expect(tipoManual("application/octet-stream", "guia.PDF")).toBe("pdf");
    expect(tipoManual("text/plain", "a.txt")).toBe("txt");
  });
});

describe("assinaturaBate", () => {
  it("aceita PDF e DOCX reais", async () => {
    const { assinaturaBate } = await import("./conhecimento-manual");
    expect(assinaturaBate("pdf", Buffer.from("%PDF-1.4 resto"))).toBe(true);
    expect(assinaturaBate("pdf", Buffer.from("nao-e-pdf"))).toBe(false);
    expect(assinaturaBate("docx", Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBe(
      true,
    );
    expect(assinaturaBate("txt", Buffer.from("olá mundo"))).toBe(true);
    expect(assinaturaBate("txt", Buffer.from([0, 1, 2, 3]))).toBe(false);
  });
});
