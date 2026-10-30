import { describe, expect, it } from "vitest";
import {
  captionDaMensagem,
  detectarTipoMidia,
  FRASE_FALHA_MIDIA,
  mimeAceitoParaTipo,
  montarTextoUsuario,
  tamanhoBase64Bytes,
  textoPdfLocalSuficiente,
  truncarTexto,
} from "./midia";

describe("detectarTipoMidia", () => {
  it("detecta áudio, imagem, pdf e docx", () => {
    expect(detectarTipoMidia({ audioMessage: { mimetype: "audio/ogg" } })).toBe(
      "audio",
    );
    expect(
      detectarTipoMidia({ imageMessage: { mimetype: "image/jpeg" } }),
    ).toBe("image");
    expect(
      detectarTipoMidia({
        documentMessage: {
          mimetype: "application/pdf",
          fileName: "x.pdf",
        },
      }),
    ).toBe("pdf");
    expect(
      detectarTipoMidia({
        documentMessage: {
          mimetype:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          fileName: "nota.docx",
        },
      }),
    ).toBe("docx");
  });

  it("usa extensão do arquivo quando mime vem genérico", () => {
    expect(
      detectarTipoMidia({
        documentMessage: {
          mimetype: "application/octet-stream",
          fileName: "laudo.PDF",
        },
      }),
    ).toBe("pdf");
  });

  it("ignora vídeo e texto puro", () => {
    expect(detectarTipoMidia({ conversation: "oi" })).toBeNull();
    expect(
      detectarTipoMidia({ videoMessage: { mimetype: "video/mp4" } }),
    ).toBeNull();
  });
});

describe("caption e montagem", () => {
  it("lê caption de imagem e documento", () => {
    expect(
      captionDaMensagem({ imageMessage: { caption: "  SKU G48  " } }),
    ).toBe("SKU G48");
    expect(captionDaMensagem({ documentMessage: { caption: "anexo" } })).toBe(
      "anexo",
    );
  });

  it("monta texto com rótulo e caption", () => {
    expect(montarTextoUsuario("image", "texto OCR", "foto")).toBe(
      "[imagem] foto\ntexto OCR",
    );
    expect(montarTextoUsuario("audio", "olá gestor")).toBe(
      "[áudio] olá gestor",
    );
    expect(montarTextoUsuario("pdf", "", "")).toBe("");
  });
});

describe("mime e tamanho", () => {
  it("aceita mimes da allowlist", () => {
    expect(mimeAceitoParaTipo("audio", "audio/ogg; codecs=opus")).toBe(true);
    expect(mimeAceitoParaTipo("image", "image/png")).toBe(true);
    expect(mimeAceitoParaTipo("pdf", "application/pdf")).toBe(true);
    expect(mimeAceitoParaTipo("image", "image/gif")).toBe(false);
  });

  it("calcula bytes de base64", () => {
    // "a" = "YQ==" → 1 byte
    expect(tamanhoBase64Bytes("YQ==")).toBe(1);
  });

  it("trunca texto longo", () => {
    const t = truncarTexto("x".repeat(20), 10);
    expect(t.startsWith("xxxxxxxxxx")).toBe(true);
    expect(t.endsWith("…")).toBe(true);
  });
});

describe("fallback", () => {
  it("frase fixa está definida", () => {
    expect(FRASE_FALHA_MIDIA).toMatch(/Não consegui ler/);
  });
});

describe("textoPdfLocalSuficiente", () => {
  it("exige conteúdo mínimo antes de pular o OCR", () => {
    expect(textoPdfLocalSuficiente("")).toBe(false);
    expect(textoPdfLocalSuficiente("   ")).toBe(false);
    expect(textoPdfLocalSuficiente("curto")).toBe(false);
    expect(
      textoPdfLocalSuficiente(
        "Laudo da reclamação 422 com SKU G48 e peça enviada ao cliente.",
      ),
    ).toBe(true);
  });
});
