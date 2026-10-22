import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Segredos das integrações (tokens, chaves de API) nunca vão em texto puro para o banco.
 * AES-256-GCM com a chave `INTEGRACOES_CHAVE` (32 bytes, em base64 ou hexadecimal).
 * O "contexto" (integração + nome do segredo) entra como dado autenticado: um valor
 * cifrado não serve se for copiado para outro campo.
 */

const VERSAO = "v1";

/** Lê a chave do ambiente. Devolve null se faltar ou não tiver exatamente 32 bytes. */
export function lerChave(valor: string | undefined): Buffer | null {
  const v = valor?.trim();
  if (!v) return null;
  if (/^[0-9a-fA-F]{64}$/.test(v)) return Buffer.from(v, "hex");
  if (/^[A-Za-z0-9+/]{43}=$/.test(v)) {
    const b = Buffer.from(v, "base64");
    return b.length === 32 ? b : null;
  }
  return null;
}

export function cifrar(texto: string, chave: Buffer, contexto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave, iv);
  c.setAAD(Buffer.from(contexto, "utf8"));
  const dados = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  const parte = (b: Buffer) => b.toString("base64url");
  return [VERSAO, parte(iv), parte(c.getAuthTag()), parte(dados)].join(".");
}

/** Falha (lança) se a chave estiver errada, o valor adulterado ou o contexto for outro. */
export function decifrar(
  cifrado: string,
  chave: Buffer,
  contexto: string,
): string {
  const [versao, iv, tag, dados] = cifrado.split(".");
  if (versao !== VERSAO || !iv || !tag || !dados) {
    throw new Error("Segredo em formato desconhecido.");
  }
  const d = createDecipheriv(
    "aes-256-gcm",
    chave,
    Buffer.from(iv, "base64url"),
  );
  d.setAAD(Buffer.from(contexto, "utf8"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    d.update(Buffer.from(dados, "base64url")),
    d.final(),
  ]).toString("utf8");
}

/** Os 4 últimos caracteres, guardados à parte para mostrar mascarado. Segredo curto não mostra nada. */
export function fimDoSegredo(texto: string): string {
  return texto.length >= 12 ? texto.slice(-4) : "";
}

export function mascarar(fim: string): string {
  return `••••${fim}`;
}

/** Tira qualquer segredo conhecido de um texto antes de mostrá-lo ou gravá-lo. */
export function removerSegredos(texto: string, segredos: string[]): string {
  let t = texto;
  for (const s of segredos) {
    if (s.length >= 4) t = t.split(s).join("[oculto]");
  }
  return t;
}
