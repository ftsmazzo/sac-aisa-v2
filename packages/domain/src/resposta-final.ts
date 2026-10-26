/**
 * A sugestão só pode citar prazo que já está na solução, e não traz link.
 * Quem grava a resposta é a pessoa.
 */
export function respostaPermitida(
  texto: string,
  solucao: string,
): string | null {
  if (/https?:\/\//i.test(texto)) {
    return "A sugestão trouxe um link. Escreva a resposta na ficha.";
  }
  const base = solucao.toLowerCase();
  for (const prazo of texto.match(/\b\d{1,3}\s*dias?\b/gi) ?? []) {
    if (!base.includes(prazo.toLowerCase())) {
      return "A sugestão trouxe um prazo que a solução não cita.";
    }
  }
  return null;
}
