/**
 * Marca escolhida no cabeçalho. Fica na cookie `marca` (preferência de tela, nada sensível,
 * legível pelo navegador para o seletor trocar o tema na hora). O servidor a lê para o HTML
 * já sair com o `data-marca` certo. Funções puras, sem dependência de servidor.
 */
import { MARCA_PADRAO, MARCAS, type MarcaId } from "./marcas";

export const COOKIE_MARCA = "marca";
export const TODAS = "todas";
export type EscolhaMarca = MarcaId | typeof TODAS;

const UM_ANO = 60 * 60 * 24 * 365;

/** Valor da cookie vira escolha. Qualquer coisa fora da lista vira "todas". */
export function lerEscolha(valor: string | null | undefined): EscolhaMarca {
  const v = valor?.trim().toLowerCase();
  return MARCAS.find((m) => m.id === v)?.id ?? TODAS;
}

/** Tema do `<html>`: a marca escolhida; em "todas", o tema padrão. */
export function temaDaEscolha(escolha: EscolhaMarca): MarcaId {
  return escolha === TODAS ? MARCA_PADRAO : escolha;
}

const semAcento = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** A marca do cadastro (id do banco) que corresponde a uma marca visual, pelo nome. */
export function marcaDoCadastro<T extends { id: string; nome: string }>(
  id: MarcaId,
  cadastro: readonly T[],
): T | undefined {
  const nome = MARCAS.find((m) => m.id === id)?.nome;
  if (!nome) return undefined;
  return cadastro.find((c) => semAcento(c.nome) === semAcento(nome));
}

/** Marca visual de uma marca do cadastro, pelo nome. Marca fora das três (ex.: WORK) dá undefined. */
export function marcaVisual(
  nome: string | null | undefined,
): MarcaId | undefined {
  if (!nome) return undefined;
  return MARCAS.find((m) => semAcento(m.nome) === semAcento(nome))?.id;
}

/** Marcas que o seletor oferece: as três com logo que o perfil enxerga no cadastro. */
export function marcasOferecidas(
  cadastro: readonly { id: string; nome: string }[] | null | undefined,
): MarcaId[] {
  if (!cadastro) return [];
  return MARCAS.filter((m) => marcaDoCadastro(m.id, cadastro)).map((m) => m.id);
}

/** Escolha que vale de fato: marca que o perfil não enxerga volta para "todas". */
export function escolhaValida(
  escolha: EscolhaMarca,
  oferecidas: readonly MarcaId[],
): EscolhaMarca {
  return escolha !== TODAS && oferecidas.includes(escolha) ? escolha : TODAS;
}

/** Texto da cookie, para o seletor gravar no navegador. */
export function textoDaCookie(escolha: EscolhaMarca): string {
  return `${COOKIE_MARCA}=${escolha}; Path=/; Max-Age=${UM_ANO}; SameSite=Lax`;
}

/** `?marca=<id>` para chamadas à API da fila e dos alertas; vazio em "todas". */
export function consultaDeMarca(idNoCadastro: string | undefined): string {
  return idNoCadastro ? `?marca=${encodeURIComponent(idNoCadastro)}` : "";
}

/**
 * Filtros da lista com a marca padrão aplicada. Marca na URL manda; `marca=todas` na URL
 * tira o padrão só dessa consulta; sem nada na URL vale a marca escolhida no cabeçalho.
 */
export function comMarcaPadrao(
  filtros: Partial<Record<string, string>>,
  idPadrao: string | undefined,
): Partial<Record<string, string>> {
  const saida = { ...filtros };
  if (saida.marca === TODAS) delete saida.marca;
  else if (!saida.marca && idPadrao) saida.marca = idPadrao;
  return saida;
}
