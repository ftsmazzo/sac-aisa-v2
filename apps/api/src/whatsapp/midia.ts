/** Detecção e limites de mídia inbound do agente gestor (Fatia 1). */

import { FOTO_MAX_BYTES } from "@sac-aisa/domain";

export const MIDIA_MAX_BYTES = FOTO_MAX_BYTES; // 5 MB
export const TEXTO_DOC_MAX = 8_000;
/** Abaixo disso o pdf-parse provavelmente falhou (scan) e cai no Mistral OCR. */
export const TEXTO_PDF_LOCAL_MIN = 40;

export const FRASE_FALHA_MIDIA =
  "Não consegui ler o arquivo; descreva o que precisa.";

/** Texto local do PDF é útil o bastante para pular o OCR pago. */
export function textoPdfLocalSuficiente(
  texto: string,
  min = TEXTO_PDF_LOCAL_MIN,
): boolean {
  const limpo = String(texto || "")
    .replace(/\s+/g, " ")
    .trim();
  return limpo.length >= min;
}

export type TipoMidiaGestor = "audio" | "image" | "pdf" | "docx";

const AUDIO_MIME = new Set([
  "audio/ogg",
  "audio/opus",
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/amr",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
]);

const IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/jpg",
]);

const PDF_MIME = new Set(["application/pdf"]);

const DOCX_MIME = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export function normalizarMime(raw: string): string {
  const base = String(raw || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (base === "image/jpg") return "image/jpeg";
  if (base === "audio/ogg; codecs=opus" || base.startsWith("audio/ogg")) {
    return "audio/ogg";
  }
  return base;
}

/** Classifica o tipo a partir do objeto `message` do Baileys/Evolution. */
export function detectarTipoMidia(
  message: Record<string, unknown>,
): TipoMidiaGestor | null {
  if (message.audioMessage) return "audio";
  if (message.imageMessage) return "image";
  const doc = message.documentMessage as
    | { mimetype?: string; fileName?: string }
    | undefined;
  if (!doc) return null;
  const mime = normalizarMime(doc.mimetype || "");
  const nome = String(doc.fileName || "").toLowerCase();
  if (PDF_MIME.has(mime) || nome.endsWith(".pdf")) return "pdf";
  if (DOCX_MIME.has(mime) || nome.endsWith(".docx")) return "docx";
  return null;
}

export function captionDaMensagem(message: Record<string, unknown>): string {
  const img = message.imageMessage as { caption?: string } | undefined;
  const doc = message.documentMessage as { caption?: string } | undefined;
  return String(img?.caption || doc?.caption || "").trim();
}

export function mimeAceitoParaTipo(
  tipo: TipoMidiaGestor,
  mimeRaw: string,
): boolean {
  const mime = normalizarMime(mimeRaw);
  if (tipo === "audio") {
    return AUDIO_MIME.has(mime) || mime.startsWith("audio/");
  }
  if (tipo === "image") return IMAGE_MIME.has(mime);
  if (tipo === "pdf") return PDF_MIME.has(mime) || mime === "";
  if (tipo === "docx") return DOCX_MIME.has(mime) || mime === "";
  return false;
}

export function tamanhoBase64Bytes(base64: string): number {
  const limpo = base64.replace(/\s/g, "");
  const padding = limpo.endsWith("==") ? 2 : limpo.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((limpo.length * 3) / 4) - padding);
}

export function montarTextoUsuario(
  tipo: TipoMidiaGestor,
  corpo: string,
  caption?: string,
): string {
  const cap = (caption || "").trim();
  const body = (corpo || "").trim();
  const rotulo =
    tipo === "audio"
      ? "áudio"
      : tipo === "image"
        ? "imagem"
        : tipo === "pdf"
          ? "pdf"
          : "docx";
  if (cap && body) return `[${rotulo}] ${cap}\n${body}`;
  if (body) return `[${rotulo}] ${body}`;
  if (cap) return `[${rotulo}] ${cap}`;
  return "";
}

export function truncarTexto(texto: string, max = TEXTO_DOC_MAX): string {
  const t = texto.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}\n…`;
}
