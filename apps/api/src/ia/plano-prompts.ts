/** Prompts do plano de ação em duas etapas. Versão sobe quando o texto muda. */
export const VERSAO_PLANO = "ia-plano-1";

const REGRA =
  "Não invente números, SKUs, causas nem prazos. Não culpe a bancada se a origem for componente, lote ou projeto. Não use nome, telefone, e-mail, endereço nem número de pedido. Responda somente JSON no esquema pedido.";

export interface AncoraPlano {
  sku: string;
  produto: string;
  bancada: string;
  causa: string;
  acaoCausa: string;
  setor: string;
  ppm: number | null;
  reclamacoes: number;
  vendas: number | null;
  periodo: string;
}

export interface CasoPlano {
  /** Texto já redigido (sem PII). */
  texto: string;
  laudo: string;
  solucao: string;
  causa: string;
}

export function sistemaSintesePlano(): string {
  return `Você resume reclamações de pós-venda industrial para um gestor preparar um plano de ação (melhoria de produto/processo, não a resposta ao cliente).
${REGRA}

A partir dos números e dos trechos, produza uma síntese curta e útil para a próxima etapa redigir o plano.

Responda somente JSON:
{"padroes":["<padrão observado>"],"hipoteses":["<hipótese de causa raiz>"],"evidencias":["<fato sustentado pelos trechos>"],"lacunas":["<o que falta investigar>"],"resumo":"<5 a 8 linhas objetivas>"}`;
}

export function usuarioSintesePlano(
  ancora: AncoraPlano,
  casos: CasoPlano[],
): string {
  const lista = casos
    .slice(0, 15)
    .map(
      (c, i) =>
        `${i + 1}. causa=${c.causa || "?"} texto=<caso>${c.texto}</caso> laudo=<caso>${c.laudo}</caso> solucao=<caso>${c.solucao}</caso>`,
    )
    .join("\n");
  return `SKU: ${ancora.sku}
Produto: ${ancora.produto}
Bancada: ${ancora.bancada || "não informada"}
Causa principal: ${ancora.causa || "não classificada"}
Ação sugerida da causa: ${ancora.acaoCausa || "não cadastrada"}
Setor: ${ancora.setor || "não informado"}
PPM: ${ancora.ppm == null ? "sem venda" : Math.round(ancora.ppm)}
Reclamações no período: ${ancora.reclamacoes}
Vendas no período: ${ancora.vendas == null ? "não informado" : ancora.vendas}
Período: ${ancora.periodo}

Casos (já sem dado pessoal):
${lista || "(nenhum trecho)"}`;
}

export function sistemaRedacaoPlano(): string {
  return `Você redige o rascunho de um plano de ação de qualidade industrial (estágio 2: melhorar produto/processo). Não resolve o cliente nesta etapa.
${REGRA}
Use a ação sugerida da causa e a síntese como base. O plano deve ser concreto: o que medir, quem atua no processo, evidência de conclusão.
Prioridade: baixa | media | alta.

Responda somente JSON:
{"titulo":"<até 120 caracteres>","descricao":"<passos numerados, até 2000 caracteres>","prioridade":"baixa|media|alta","avisos":["<risco ou lacuna opcional>"]}`;
}

export function usuarioRedacaoPlano(
  ancora: AncoraPlano,
  sintese: {
    padroes: string[];
    hipoteses: string[];
    evidencias: string[];
    lacunas: string[];
    resumo: string;
  },
): string {
  return `SKU: ${ancora.sku}
Produto: ${ancora.produto}
Bancada: ${ancora.bancada || "não informada"}
Causa: ${ancora.causa || "não classificada"}
Ação sugerida da causa: ${ancora.acaoCausa || "não cadastrada"}
Setor: ${ancora.setor || "não informado"}
PPM: ${ancora.ppm == null ? "sem venda" : Math.round(ancora.ppm)}
Reclamações: ${ancora.reclamacoes}
Período: ${ancora.periodo}

Síntese preparada:
resumo: ${sintese.resumo}
padrões: ${sintese.padroes.join(" | ") || "—"}
hipóteses: ${sintese.hipoteses.join(" | ") || "—"}
evidências: ${sintese.evidencias.join(" | ") || "—"}
lacunas: ${sintese.lacunas.join(" | ") || "—"}`;
}
