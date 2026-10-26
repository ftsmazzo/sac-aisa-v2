export type ResultadoEfeito = "caiu" | "nao_caiu";

/**
 * A ocorrência caiu quando o período seguinte tem menos casos que o anterior.
 * Igual ou maior reabre o plano: a ação não produziu efeito.
 */
export function efeitoDoPlano(
  antes: number,
  depois: number,
): {
  quedaPercentual: number;
  resultado: ResultadoEfeito;
  reabrir: boolean;
} {
  if (
    !Number.isInteger(antes) ||
    !Number.isInteger(depois) ||
    antes < 0 ||
    depois < 0
  ) {
    throw new Error("Contagem inválida.");
  }
  const queda =
    antes === 0 ? 0 : Math.round(((antes - depois) / antes) * 10000) / 100;
  const caiu = depois < antes;
  return {
    quedaPercentual: queda,
    resultado: caiu ? "caiu" : "nao_caiu",
    reabrir: !caiu,
  };
}

/**
 * Plano ligado só a reclamação de treino não vai ao ClickUp,
 * salvo o interruptor que o administrador já gravou.
 */
export function podeEnviarPlano(
  treinoDasLigadas: boolean[],
  criarCardsTreino: boolean,
): boolean {
  const soTreino =
    treinoDasLigadas.length > 0 && treinoDasLigadas.every(Boolean);
  return !soTreino || criarCardsTreino;
}
