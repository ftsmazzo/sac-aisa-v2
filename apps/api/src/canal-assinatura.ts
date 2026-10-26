import { createHmac, timingSafeEqual } from "node:crypto";

/** HMAC-SHA256 em hexadecimal minúsculo, como o Mercado Livre e a Shopee usam. */
export const hmacHex = (chave: string, texto: string) =>
  createHmac("sha256", chave).update(texto).digest("hex");

/** Comparação em tempo constante. */
export function iguais(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Assinatura de uma chamada à Shopee: partner_id + caminho + timestamp, e, nas chamadas da loja,
 * access_token + shop_id, tudo sem separador. O timestamp vale 5 minutos.
 */
export function assinaturaShopee(
  partnerKey: string,
  base: {
    partnerId: string | number;
    caminho: string;
    timestamp: number;
    accessToken?: string;
    shopId?: string | number;
  },
): string {
  const texto = `${base.partnerId}${base.caminho}${base.timestamp}${base.accessToken ?? ""}${base.shopId ?? ""}`;
  return hmacHex(partnerKey, texto);
}

/** O push da Shopee vem assinado no header Authorization: HMAC de url + "|" + corpo cru. */
export function pushShopeeValido(
  partnerKey: string,
  url: string,
  corpoCru: string,
  authorization: string | undefined,
): boolean {
  if (!authorization) return false;
  return iguais(
    authorization.trim(),
    hmacHex(partnerKey, `${url}|${corpoCru}`),
  );
}

/**
 * Manifesto do aviso do Mercado Livre: `id`, `request-id` e `ts`, separados
 * por `;` e com `;` no fim. Parte vazia fica de fora. A Secret Key assina isso,
 * e o header traz `ts=...,v1=<hex>`.
 */
export function manifestoAvisoML(partes: {
  id?: string;
  requestId?: string;
  ts: string;
}): string {
  const linhas: string[] = [];
  if (partes.id) linhas.push(`id:${partes.id}`);
  if (partes.requestId) linhas.push(`request-id:${partes.requestId}`);
  linhas.push(`ts:${partes.ts}`);
  return `${linhas.join(";")};`;
}

export function cabecalhoAvisoML(
  segredo: string,
  partes: { id?: string; requestId?: string; ts: string },
): string {
  return `ts=${partes.ts},v1=${hmacHex(segredo, manifestoAvisoML(partes))}`;
}

/** Confere o header `x-signature` contra o manifesto. O corpo cru não entra na conta. */
export function avisoMLValido(
  segredo: string,
  assinatura: string | undefined,
  partes: { id?: string; requestId?: string },
): boolean {
  if (!assinatura || !segredo) return false;
  const ts = /(?:^|,)\s*ts=(\d+)/.exec(assinatura)?.[1];
  const v1 = /(?:^|,)\s*v1=([0-9a-f]+)/i.exec(assinatura)?.[1];
  if (!ts || !v1) return false;
  return iguais(
    v1.toLowerCase(),
    hmacHex(segredo, manifestoAvisoML({ ...partes, ts })),
  );
}
