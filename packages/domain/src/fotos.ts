/** Foto que a operação envia na ficha. O canal continua mandando a URL dele. */

export const FOTO_MAX_BYTES = 5 * 1024 * 1024;

const ASSINATURA: Record<string, (b: Uint8Array) => boolean> = {
  "image/jpeg": (b) =>
    b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) =>
    b.length >= 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47,
  "image/webp": (b) =>
    b.length >= 12 &&
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50,
};

/**
 * Conferência de tipo e tamanho. `inicio` são os primeiros bytes do arquivo:
 * o tipo declarado tem de bater com a assinatura. `null` quando pode gravar.
 */
export function fotoAceita(
  tipo: string,
  bytes: number,
  inicio: Uint8Array,
): string | null {
  const confere = ASSINATURA[tipo];
  if (!confere?.(inicio)) {
    return "A foto precisa ser JPEG, PNG ou WebP.";
  }
  if (!Number.isInteger(bytes) || bytes < 1) return "A foto está vazia.";
  if (bytes > FOTO_MAX_BYTES) return "A foto passa de 5 MB.";
  return null;
}
