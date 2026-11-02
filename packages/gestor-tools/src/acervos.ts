/** Acervos temáticos da base de conhecimento do gestor. */

export const ACERVOS = [
  {
    id: "institucional",
    rotulo: "Institucional",
    descricao: "Perfil da empresa, tom de voz, quem somos",
  },
  {
    id: "politica-sac",
    rotulo: "Política SAC",
    descricao: "Perguntas obrigatórias e causas com ação sugerida",
  },
  {
    id: "casos",
    rotulo: "Casos resolvidos",
    descricao: "Laudos e soluções redigidas (sem PII)",
  },
  {
    id: "produtos-site",
    rotulo: "Produtos / site",
    descricao: "Páginas do e-commerce e catálogo em prosa",
  },
  {
    id: "manual",
    rotulo: "Manuais",
    descricao: "Manuais e documentação técnica",
  },
] as const;

export type AcervoId = (typeof ACERVOS)[number]["id"];

const IDS = new Set<string>(ACERVOS.map((a) => a.id));

/** Acervo padrão por tipo de fonte interna. */
export function acervoDeFonte(
  fonte: "perfil" | "pergunta" | "causa" | "caso" | "url" | "manual",
): AcervoId {
  switch (fonte) {
    case "perfil":
      return "institucional";
    case "pergunta":
    case "causa":
      return "politica-sac";
    case "caso":
      return "casos";
    case "url":
      return "produtos-site";
    case "manual":
      return "manual";
  }
}

export function acervoValido(v: unknown): v is AcervoId {
  return typeof v === "string" && IDS.has(v);
}
