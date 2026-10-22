import { cookies } from "next/headers";
import {
  COOKIE_MARCA,
  type EscolhaMarca,
  escolhaValida,
  lerEscolha,
  marcaDoCadastro,
  marcasOferecidas,
  TODAS,
} from "./marca-escolhida";
import type { MarcaId } from "./marcas";
import { buscarNaApi, type OpcoesFiltro } from "./reclamacoes";

/** Escolha gravada na cookie, sem conferir o perfil. Serve ao `<html>`, antes do login. */
export async function escolhaDaCookie(): Promise<EscolhaMarca> {
  return lerEscolha((await cookies()).get(COOKIE_MARCA)?.value);
}

export interface MarcaAtiva {
  /** Marcas que o perfil enxerga e o seletor oferece. */
  oferecidas: MarcaId[];
  /** Escolha que vale: a da cookie, se o perfil enxerga essa marca; senão "todas". */
  escolha: EscolhaMarca;
  /** Id da marca no cadastro, para o parâmetro `marca` da API. Vazio em "todas". */
  idNoCadastro: string | undefined;
}

/** Marca ativa do usuário logado. Só no servidor, em tela protegida. */
export async function marcaAtiva(): Promise<MarcaAtiva> {
  const [daCookie, opcoes] = await Promise.all([
    escolhaDaCookie(),
    buscarNaApi<OpcoesFiltro>("/reclamacoes/filtros"),
  ]);
  const cadastro = opcoes.ok ? opcoes.dados.marcas : [];
  const oferecidas = marcasOferecidas(cadastro);
  const escolha = escolhaValida(daCookie, oferecidas);
  const idNoCadastro =
    escolha === TODAS ? undefined : marcaDoCadastro(escolha, cadastro)?.id;
  return { oferecidas, escolha, idNoCadastro };
}
