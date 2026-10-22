import type { CSSProperties } from "react";
import { moeda } from "@/lib/reclamacoes-formato";
import { type RelatorioApi, textoDias } from "@/lib/relatorios-formato";

interface ItemBarra {
  rotulo: string;
  valor: number;
  texto: string;
  apoio?: string;
}

/** Barras horizontais em HTML puro: o número fica escrito ao lado, a barra só reforça. */
function Barras({ itens, vazio }: { itens: ItemBarra[]; vazio: string }) {
  if (itens.length === 0) return <p className="pagina__apoio">{vazio}</p>;
  const max = Math.max(...itens.map((i) => i.valor), 1);
  return (
    <ol className="barras">
      {itens.map((i) => (
        <li key={i.rotulo} className="barras__item">
          <span className="barras__rotulo">{i.rotulo}</span>
          <span className="barras__trilho" aria-hidden="true">
            <span
              className="barras__barra"
              style={{ width: `${Math.max(2, (i.valor / max) * 100)}%` }}
            />
          </span>
          <span className="barras__valor">
            {i.texto}
            {i.apoio && <small>{i.apoio}</small>}
          </span>
        </li>
      ))}
    </ol>
  );
}

const TOP_PRODUTOS = 8;

/** Visão de tela do relatório: gráficos e mapa de calor. No papel sai a versão numérica. */
export function VisaoGrafica({ r }: { r: RelatorioApi }) {
  const t = r.totais;
  const situacao = [
    { chave: "resolvida", rotulo: "Resolvidas", n: t.resolvidas },
    { chave: "tratativa", rotulo: "Em tratativa", n: t.tratativa },
    { chave: "aguardando", rotulo: "Aguardando produto", n: t.aguardando },
  ];
  const mapa = r.bancadaXTipo;
  const maxCelula = Math.max(
    1,
    ...mapa.linhas.flatMap((l) => mapa.tipos.map((x) => l.porTipo[x] ?? 0)),
  );

  return (
    <div className="relatorio__visual sem-impressao">
      <dl className="relatorio__kpis">
        <div>
          <dt>Reclamações</dt>
          <dd>{t.reclamacoes}</dd>
        </div>
        <div>
          <dt>Custo total</dt>
          <dd>{moeda(t.custoTotal)}</dd>
        </div>
        <div>
          <dt>Custo médio</dt>
          <dd>{moeda(t.reclamacoes > 0 ? t.custoTotal / t.reclamacoes : 0)}</dd>
        </div>
        <div>
          <dt>Taxa de resolução</dt>
          <dd>
            {t.reclamacoes > 0
              ? `${Math.round((t.resolvidas / t.reclamacoes) * 100)}%`
              : "—"}
          </dd>
        </div>
      </dl>

      <div className="relatorio__grade">
        <section className="cartao relatorio__painel">
          <h3 className="ficha__subtitulo">Situação</h3>
          {t.reclamacoes > 0 ? (
            <>
              <div
                className="situacao-barra"
                role="img"
                aria-label={situacao
                  .map((s) => `${s.rotulo}: ${s.n}`)
                  .join("; ")}
              >
                {situacao.map((s) => (
                  <span
                    key={s.chave}
                    className={`situacao-barra__parte situacao-barra__parte--${s.chave}`}
                    style={{ flexGrow: s.n }}
                  />
                ))}
              </div>
              <ul className="situacao-legenda">
                {situacao.map((s) => (
                  <li key={s.chave}>
                    <span
                      className={`situacao-legenda__ponto situacao-barra__parte--${s.chave}`}
                      aria-hidden="true"
                    />
                    {s.rotulo} <strong>{s.n}</strong>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="pagina__apoio">Nenhuma reclamação no filtro.</p>
          )}
        </section>

        <section className="cartao relatorio__painel">
          <h3 className="ficha__subtitulo">Tempo médio por etapa</h3>
          <Barras
            vazio="Sem dados de etapa."
            itens={r.etapas
              .filter((e) => e.mediaDias !== null)
              .map((e) => ({
                rotulo: e.rotulo,
                valor: e.mediaDias ?? 0,
                texto: textoDias(e.mediaDias),
                apoio: `${e.n} rec.`,
              }))}
          />
        </section>

        <section className="cartao relatorio__painel">
          <h3 className="ficha__subtitulo">Ocorrências por setor</h3>
          <Barras
            vazio="Nenhuma reclamação no filtro."
            itens={r.porSetor.map((s) => ({
              rotulo: s.setor,
              valor: s.total,
              texto: String(s.total),
              apoio: moeda(s.custo),
            }))}
          />
        </section>

        <section className="cartao relatorio__painel">
          <h3 className="ficha__subtitulo">
            Produtos com mais ocorrências
            {r.porProduto.length > TOP_PRODUTOS && (
              <small> (top {TOP_PRODUTOS})</small>
            )}
          </h3>
          <Barras
            vazio="Nenhuma reclamação no filtro."
            itens={r.porProduto.slice(0, TOP_PRODUTOS).map((p) => ({
              rotulo: p.codigo ? `${p.codigo} · ${p.produto}` : p.produto,
              valor: p.total,
              texto: String(p.total),
              apoio: moeda(p.custo),
            }))}
          />
        </section>
      </div>

      <section className="cartao relatorio__painel">
        <h3 className="ficha__subtitulo">
          Bancada de origem × tipo de ocorrência
        </h3>
        {mapa.linhas.length === 0 ? (
          <p className="pagina__apoio">Nenhuma reclamação no filtro.</p>
        ) : (
          <div className="tabela-caixa">
            <table className="tabela-simples calor">
              <caption className="sr-only">
                Quantidade de ocorrências por bancada e tipo, mais escuro é mais
                ocorrência
              </caption>
              <thead>
                <tr>
                  <th scope="col">Bancada</th>
                  {mapa.tipos.map((x) => (
                    <th key={x} scope="col">
                      {x}
                    </th>
                  ))}
                  <th scope="col">Total</th>
                </tr>
              </thead>
              <tbody>
                {mapa.linhas.map((l) => (
                  <tr key={l.bancada}>
                    <th scope="row">{l.bancada}</th>
                    {mapa.tipos.map((x) => {
                      const n = l.porTipo[x] ?? 0;
                      return (
                        <td
                          key={x}
                          className={n > 0 ? "calor__celula" : "calor__zero"}
                          style={
                            {
                              "--forca": `${Math.round((n / maxCelula) * 55)}%`,
                            } as CSSProperties
                          }
                        >
                          {n}
                        </td>
                      );
                    })}
                    <td>
                      <strong>{l.total}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
