/** Helpers puros do upload de manuais (RAG). */

export function tipoManual(
  mime: string,
  nome: string,
): "pdf" | "docx" | "txt" {
  const n = nome.toLowerCase();
  if (mime === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (mime.includes("wordprocessingml") || n.endsWith(".docx")) return "docx";
  return "txt";
}

export function slugManual(nome: string): string {
  const tipo = tipoManual("", nome);
  const base = nome
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\.(pdf|docx|txt)$/i, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/\.+/g, ".")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");
  const corpo = (base || "manual").slice(0, 72);
  return `${corpo}-${tipo}`;
}

/** Normaliza id já indexado (não acrescenta tipo). */
export function idManual(raw: string): string {
  return String(raw || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

/** Confere assinatura do arquivo com o tipo declarado. */
export function assinaturaBate(tipo: "pdf" | "docx" | "txt", buf: Buffer): boolean {
  if (buf.length < 4) return false;
  if (tipo === "pdf") {
    return buf.subarray(0, 5).toString("ascii") === "%PDF-";
  }
  if (tipo === "docx") {
    // DOCX = ZIP (PK\x03\x04)
    return buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07);
  }
  // TXT: rejeita binário óbvio (NUL no início)
  return !buf.subarray(0, Math.min(buf.length, 512)).includes(0);
}
