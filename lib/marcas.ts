/**
 * Marcas do SAC. `cor` é a medida da logo oficial; o destaque da interface usa as
 * versões ajustadas para contraste em `app/globals.css`. Os arquivos ficam em
 * `public/marcas` (PNG com fundo transparente) e `largura` e `altura` são o tamanho deles.
 */
export const MARCAS = [
  {
    id: "aisa",
    nome: "AISA",
    sigla: "AI",
    cor: "#0052f3",
    logo: "/marcas/aisa.png",
    largura: 1200,
    altura: 492,
  },
  {
    id: "artmaq",
    nome: "ARTMAQ",
    sigla: "AR",
    cor: "#da12b6",
    logo: "/marcas/artmaq.png",
    largura: 1422,
    altura: 594,
  },
  {
    id: "arauca",
    nome: "ARAUCA",
    sigla: "AU",
    cor: "#161616",
    logo: "/marcas/arauca.png",
    largura: 1172,
    altura: 372,
  },
] as const;

export type MarcaId = (typeof MARCAS)[number]["id"];

export const MARCA_PADRAO: MarcaId = "aisa";
