/** Rascunho da resposta de fechamento, a partir do que o atendimento já registrou. */

function reais(v: number): string {
  const negativo = v < 0;
  const [inteiro, decimal] = Math.abs(v).toFixed(2).split(".");
  const milhar = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negativo ? "-" : ""}R$ ${milhar},${decimal}`;
}

export function rascunhoDeResposta(dados: {
  solucao: string;
  conclusoes: string[];
  custoTotal: number;
}): string {
  const solucao = dados.solucao.trim();
  const conclusoes = dados.conclusoes.map((s) => s.trim()).filter(Boolean);
  const linhas = [
    "Olá, {{nome_cliente}}.",
    solucao
      ? `Concluímos o atendimento: ${solucao}`
      : "Concluímos o atendimento da sua reclamação.",
  ];
  if (conclusoes.length > 0) {
    linhas.push(`O que o setor verificou: ${conclusoes.join(" ")}`);
  }
  if (dados.custoTotal > 0) {
    linhas.push(
      `Os custos registrados neste atendimento somam ${reais(dados.custoTotal)}. Eles podem ser da fábrica ou do cliente, conforme a solução.`,
    );
  }
  linhas.push("Se algo não ficou resolvido, responda por aqui.");
  return linhas.join("\n\n");
}

export const ROTULO_ACOMPANHAMENTO: Record<string, string> = {
  satisfeito: "Cliente ficou satisfeito",
  reparo: "Confirmou o reparo",
  reenvio: "Confirmou o reenvio",
  insatisfeito: "Não ficou satisfeito",
};
