import Link from "next/link";
import { redirect } from "next/navigation";
import { BotaoImprimir } from "@/components/botao-imprimir";
import { buscarNaApi, type Ficha, type Pagina } from "@/lib/reclamacoes";
import {
  consultaParaApi,
  lerEstado,
  type ParamsUrl,
} from "@/lib/reclamacoes-formato";
import { obterUsuario } from "@/lib/sessao";
import { FolhaReclamacao, impressoEm } from "../folha";

/** Folhas por impressão: mais que isso trava o navegador e vira pilha de papel. */
const LIMITE = 60;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

const lista = (v: string | string[] | undefined): string[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

/**
 * Impressão em lote: as reclamações marcadas na lista (`id` repetido na URL) ou todas as
 * do filtro (`todas=1` mais os filtros da lista). Uma folha A4 por reclamação. Cada ficha
 * passa pela API, que confere o escopo do perfil.
 */
export default async function ImprimirLote({
  searchParams,
}: {
  searchParams: Promise<ParamsUrl>;
}) {
  const usuario = await obterUsuario();
  if (!usuario) redirect("/login");
  if (!usuario.permissoes.includes("reclamacoes.ver")) redirect("/reclamacoes");

  const params = await searchParams;
  let ids: string[];
  let totalDoFiltro = 0;
  if (params.todas === "1") {
    const estado = lerEstado(params);
    const r = await buscarNaApi<Pagina>(
      `/reclamacoes?${consultaParaApi({ ...estado, pagina: 1 }, 100)}`,
    );
    if (!r.ok && r.status === 401) redirect("/login");
    ids = r.ok ? r.dados.itens.map((i) => i.id) : [];
    totalDoFiltro = r.ok ? r.dados.total : 0;
  } else {
    ids = [...new Set(lista(params.id))].filter((i) => ID.test(i));
  }
  const cortado = ids.length > LIMITE || totalDoFiltro > LIMITE;
  ids = ids.slice(0, LIMITE);

  const fichas: Ficha[] = [];
  for (let i = 0; i < ids.length; i += 10) {
    const lote = await Promise.all(
      ids
        .slice(i, i + 10)
        .map((id) => buscarNaApi<Ficha>(`/reclamacoes/${id}`)),
    );
    for (const r of lote) {
      if (!r.ok && r.status === 401) redirect("/login");
      if (r.ok) fichas.push(r.dados);
    }
  }

  if (fichas.length === 0) {
    return (
      <section className="vazio">
        <h1 className="vazio__titulo">Nenhuma reclamação para imprimir</h1>
        <p className="vazio__texto">
          Marque reclamações na lista ou use “Imprimir todas do filtro”.
        </p>
        <Link href="/reclamacoes" className="botao botao--secundario">
          Voltar para a lista
        </Link>
      </section>
    );
  }

  const agora = new Date();
  const impresso = impressoEm(agora);

  return (
    <>
      <div className="pagina__cab pagina__cab--acao sem-impressao">
        <div className="pagina__cab-texto">
          <h1 className="pagina__titulo">
            {fichas.length} {fichas.length === 1 ? "folha" : "folhas"} para
            imprimir
          </h1>
          <p className="pagina__apoio">
            Uma folha A4 por reclamação.
            {cortado &&
              ` Foram incluídas as primeiras ${LIMITE}; refine o filtro para imprimir as demais.`}
          </p>
        </div>
        <div className="ficha__acoes">
          <BotaoImprimir rotulo="Imprimir tudo" />
          <Link href="/reclamacoes" className="botao botao--secundario">
            Voltar à lista
          </Link>
        </div>
      </div>

      <div className="lote-folhas">
        {fichas.map((f) => (
          <FolhaReclamacao
            key={f.id}
            f={f}
            agora={agora}
            impresso={impresso}
            usuarioNome={usuario.nome}
          />
        ))}
      </div>
    </>
  );
}
