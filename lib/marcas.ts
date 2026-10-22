/** Marcas do SAC. Cores e logos são provisórias até o cliente enviar as definitivas. */
export const MARCAS = [
  { id: "aisa", nome: "AISA", sigla: "AI" },
  { id: "artmaq", nome: "ARTMAQ", sigla: "AR" },
  { id: "arauca", nome: "ARAUCA", sigla: "AU" },
] as const;

export type MarcaId = (typeof MARCAS)[number]["id"];

export const MARCA_PADRAO: MarcaId = "aisa";
