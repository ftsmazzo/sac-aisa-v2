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

/** O aviso do Mercado Livre (formato simplificado: HMAC do corpo cru com a Secret Key). */
export function avisoMLValido(
  segredo: string,
  corpoCru: string,
  assinatura: string | undefined,
): boolean {
  if (!assinatura) return false;
  return iguais(assinatura.trim(), hmacHex(segredo, corpoCru));
}
