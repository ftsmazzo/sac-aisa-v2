import type { AlertTipo } from "./alertas";

export const chaveDoAlerta = (reclamacaoId: string, tipo: AlertTipo) =>
  `${reclamacaoId}:${tipo}`;

/** Chaves que estavam abertas e a regra desta hora já não confirma. */
export function chavesParaResolver(
  abertas: string[],
  atuais: string[],
): string[] {
  const agora = new Set(atuais);
  return abertas.filter((c) => !agora.has(c));
}
