import Link from "next/link";
import { redirect } from "next/navigation";
import { BotaoImprimir } from "@/components/botao-imprimir";
import { LogoMarca } from "@/components/ui";
import { comMarcaPadrao, marcaVisual, TODAS } from "@/lib/marca-escolhida";
import { marcaAtiva } from "@/lib/marca-servidor";
import { buscarNaApi, type OpcoesFiltro } from "@/lib/reclamacoes";
import { data, moeda, type ParamsUrl } from "@/lib/reclamacoes-formato";
import {
  consultaRelatorio,
  lerFiltrosUrl,
  type RelatorioApi,
  textoDias,
} from "@/lib/relatorios-formato";
import { obterUsuario } from "@/lib/sessao";
import { VisaoGrafica } from "./visual";

function Seletor({
  nome,
  rotulo,
  valor,
  opcoes,
  semFiltro = "",
}: {
  nome: string;
  rotulo: string;
  valor?: string;
  opcoes: { id: string; nome: string }[];
  /** Valor de "Todos". Na marca é `todas`, para não voltar à marca do cabeçalho. */
  semFiltro?: string;
}) {
  return (
    <label className="filtro">
      <span className="filtro__rotulo">{rotulo}</span>
      <select
        name={nome}
        defaultValue={valor ?? semFiltro}
        className="filtro__campo"
      >
        <option value={semFiltro}>Todos</option>
        {opcoes.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nome}
          </option>
        ))}
      </select>
    </label>
  );
}

const nomeDe = (l: { id: string; nome: string }[] | undefined, id?: string) =>
  id ? (l?.find((x) => x.id === id)?.nome ?? id) : "Todos";

/** Relatório por período, marca, setor e causa. Imprime em A4 e baixa em CSV. */
export default async function Relatorios({
  searchParams,
}: {
  searchParams: Promise<ParamsUrl>;
}) {
  const usuario = await obterUsuario();
  if (!usuario) redirect("/login");

  if (!usuario.permissoes.includes("relatorios.ver")) {
    return (
      <section className="vazio">
        <h1 className="vazio__titulo">Sem acesso aos relatórios</h1>
        <p className="vazio__texto">
          Seu perfil não tem permissão para ver esta tela. Fale com o
          administrador se precisar dela.
        </p>
      </section>
    );
  }

  const marcaEscolhida = await marcaAtiva();
  const filtros = comMarcaPadrao(
    lerFiltrosUrl(await searchParams),
    marcaEscolhida.idNoCadastro,
  ) as ReturnType<typeof lerFiltrosUrl>;
  const consulta = consultaRelatorio(filtros);
  const [rel, opcoesResp] = await Promise.all([
    buscarNaApi<RelatorioApi>(`/relatorios?${consulta}`),
    buscarNaApi<OpcoesFiltro>("/reclamacoes/filtros"),
  ]);
  if (!rel.ok && rel.status === 401) redirect("/login");
  const opcoes = opcoesResp.ok ? opcoesResp.dados : null;
  const r = rel.ok ? rel.dados : null;

  const marcaNome = filtros.marca
    ? opcoes?.marcas.find((m) => m.id === filtros.marca)?.nome
    : undefined;
  const logo = marcaVisual(marcaNome);
  const periodo =
    filtros.de || filtros.ate
      ? `${filtros.de ? data(filtros.de) : "início"} a ${filtros.ate ? data(filtros.ate) : "hoje"}`
      : "Todo o período";
  const emitido = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date());

  return (
    <>
      <div className="pagina__cab pagina__cab--acao sem-impressao">
        <div className="pagina__cab-texto">
          <h1 className="pagina__titulo">Relatórios</h1>
          <p className="pagina__apoio">
            Totais, tempo por etapa, ocorrências e bancada × tipo de ocorrência.
            {usuario.perfil === "responsavel_setor" &&
              usuario.setores.length > 0 &&
              ` Só do seu setor (${usuario.setores.join(", ")}).`}
          </p>
        </div>
        {r && (
          <div className="ficha__acoes">
            <BotaoImprimir />
            <a
              href={`/relatorios/csv${consulta ? `?${consulta}` : ""}`}
              className="botao botao--secundario"
              download
            >
              Baixar CSV
            </a>
          </div>
        )}
      </div>

      <section className="cartao filtros sem-impressao" aria-label="Filtros">
        <form method="get" action="/relatorios" className="filtros__form">
          <label className="filtro">
            <span className="filtro__rotulo">De</span>
            <input
              type="date"
              name="de"
              defaultValue={filtros.de ?? ""}
              className="filtro__campo"
            />
          </label>
          <label className="filtro">
            <span className="filtro__rotulo">Até</span>
            <input
              type="date"
              name="ate"
              defaultValue={filtros.ate ?? ""}
              className="filtro__campo"
            />
          </label>
          <Seletor
            nome="marca"
            rotulo="Marca"
            valor={filtros.marca}
            opcoes={opcoes?.marcas ?? []}
            semFiltro={TODAS}
          />
          <Seletor
            nome="setor"
            rotulo="Setor"
            valor={filtros.setor}
            opcoes={opcoes?.setores ?? []}
          />
          <Seletor
            nome="causa"
            rotulo="Causa"
            valor={filtros.causa}
            opcoes={opcoes?.causas ?? []}
          />
          {filtros.bancada && (
            <input type="hidden" name="bancada" value={filtros.bancada} />
          )}
          {filtros.categoria && (
            <input type="hidden" name="categoria" value={filtros.categoria} />
          )}
          {filtros.produto && (
            <input type="hidden" name="produto" value={filtros.produto} />
          )}
          {filtros.situacao && (
            <input type="hidden" name="situacao" value={filtros.situacao} />
          )}
          <button type="submit" className="botao botao--primario">
            Aplicar
          </button>
        </form>
        {consulta && (
          <p>
            <Link href="/relatorios" className="chips__limpar">
              Limpar filtros
            </Link>
          </p>
        )}
      </section>

      {!r && (
        <section className="vazio">
          <h2 className="vazio__titulo">
            {!rel.ok && rel.status === 400
              ? "Filtro inválido"
              : "Não foi possível gerar o relatório"}
          </h2>
          <p className="vazio__texto">
            {!rel.ok && rel.status === 400 && rel.mensagem
              ? rel.mensagem
              : "Tente de novo em instantes."}
          </p>
        </section>
      )}

      {r && (
        <article className="relatorio" aria-label="Relatório de reclamações">
          <header className="relatorio__cab">
            {logo && <LogoMarca marca={logo} altura={36} />}
            <div>
              <h2 className="relatorio__titulo">Relatório de reclamações</h2>
              <p className="relatorio__sub">
                {periodo} · Marca: {nomeDe(opcoes?.marcas, filtros.marca)} ·
                Setor: {nomeDe(opcoes?.setores, filtros.setor)} · Causa:{" "}
                {nomeDe(opcoes?.causas, filtros.causa)}
              </p>
              <p className="relatorio__sub so-impressao">
                Emitido em {emitido} por {usuario.nome}
              </p>
            </div>
          </header>

          {r.cortado && (
            <p className="relatorio__aviso" role="status">
              Há mais reclamações que o limite do relatório. Os números
              consideram só as mais recentes; reduza o período para ver tudo.
            </p>
          )}

          <VisaoGrafica r={r} filtros={filtros} />

          <div className="so-impressao relatorio__papel">
            <section className="relatorio__bloco">
              <h3 className="ficha__subtitulo">Totais</h3>
              <dl className="relatorio__totais">
                <div>
                  <dt>Reclamações</dt>
                  <dd>{r.totais.reclamacoes}</dd>
                </div>
                <div>
                  <dt>Resolvidas</dt>
                  <dd>{r.totais.resolvidas}</dd>
                </div>
                <div>
                  <dt>Em tratativa</dt>
                  <dd>{r.totais.tratativa}</dd>
                </div>
                <div>
                  <dt>Aguardando produto</dt>
                  <dd>{r.totais.aguardando}</dd>
                </div>
                <div>
                  <dt>Custo total</dt>
                  <dd>{moeda(r.totais.custoTotal)}</dd>
                </div>
              </dl>
            </section>

            <section className="relatorio__bloco">
              <h3 className="ficha__subtitulo">Tempo médio por etapa</h3>
              <table className="tabela-simples relatorio__tabela">
                <thead>
                  <tr>
                    <th scope="col">Etapa</th>
                    <th scope="col">Reclamações</th>
                    <th scope="col">Média</th>
                  </tr>
                </thead>
                <tbody>
                  {r.etapas.map((e) => (
                    <tr key={e.chave}>
                      <td>{e.rotulo}</td>
                      <td>{e.n}</td>
                      <td>{textoDias(e.mediaDias)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="relatorio__bloco">
              <h3 className="ficha__subtitulo">Ocorrências por setor</h3>
              {r.porSetor.length === 0 ? (
                <p className="pagina__apoio">Nenhuma reclamação no filtro.</p>
              ) : (
                <table className="tabela-simples relatorio__tabela">
                  <thead>
                    <tr>
                      <th scope="col">Setor responsável</th>
                      <th scope="col">Reclamações</th>
                      <th scope="col">Custo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.porSetor.map((s) => (
                      <tr key={s.setor}>
                        <td>{s.setor}</td>
                        <td>{s.total}</td>
                        <td>{moeda(s.custo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="relatorio__bloco">
              <h3 className="ficha__subtitulo">Ocorrências por produto</h3>
              {r.porProduto.length === 0 ? (
                <p className="pagina__apoio">Nenhuma reclamação no filtro.</p>
              ) : (
                <table className="tabela-simples relatorio__tabela">
                  <thead>
                    <tr>
                      <th scope="col">Produto</th>
                      <th scope="col">Reclamações</th>
                      <th scope="col">Custo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.porProduto.map((p) => (
                      <tr key={p.codigo || p.produto}>
                        <td>
                          {p.codigo ? `${p.codigo} · ` : ""}
                          {p.produto}
                        </td>
                        <td>{p.total}</td>
                        <td>{moeda(p.custo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="relatorio__bloco">
              <h3 className="ficha__subtitulo">
                Bancada de origem × tipo de ocorrência
              </h3>
              {r.bancadaXTipo.linhas.length === 0 ? (
                <p className="pagina__apoio">Nenhuma reclamação no filtro.</p>
              ) : (
                <>
                  <div className="tabela-caixa">
                    <table className="tabela-simples relatorio__tabela">
                      <thead>
                        <tr>
                          <th scope="col">Bancada</th>
                          {r.bancadaXTipo.tipos.map((t) => (
                            <th key={t} scope="col">
                              {t}
                            </th>
                          ))}
                          <th scope="col">Total</th>
                          <th scope="col">Causa na montagem</th>
                          <th scope="col">Causa fora da montagem</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.bancadaXTipo.linhas.map((b) => (
                          <tr key={b.bancada}>
                            <th scope="row">{b.bancada}</th>
                            {r.bancadaXTipo.tipos.map((t) => (
                              <td key={t}>{b.porTipo[t] ?? 0}</td>
                            ))}
                            <td>{b.total}</td>
                            <td>{b.daMontagem}</td>
                            <td>{b.foraDaMontagem}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="relatorio__nota">
                    A bancada só responde pela ocorrência quando a causa vem da
                    montagem. Defeito de componente, lote, projeto, embalagem,
                    transporte ou venda, ou causa ainda sem origem, cai em “fora
                    da montagem”.
                  </p>
                </>
              )}
            </section>
          </div>
        </article>
      )}
    </>
  );
}
