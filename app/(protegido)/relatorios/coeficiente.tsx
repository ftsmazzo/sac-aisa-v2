export interface LinhaSkuApi {
  sku: string;
  produto: string;
  vendas: number;
  reclamacoes: number;
  bancada: string;
  setorResp: string;
  ppm: number | null;
  semVenda: boolean;
  acimaLimite: boolean;
}

export interface LinhaGrupoApi {
  nome: string;
  skus: number;
  vendas: number;
  reclamacoes: number;
  ppm: number | null;
  acimaLimite: boolean;
}

export interface CoeficienteApi {
  limitePpm: number;
  modoContagem: "procedentes" | "todas";
  totais: {
    skus: number;
    vendas: number;
    reclamacoes: number;
    ppm: number | null;
    acimaLimite: number;
    semVenda: number;
  };
  porSku: LinhaSkuApi[];
  porBancada: LinhaGrupoApi[];
  porSetorResp: LinhaGrupoApi[];
}

function ppm(n: number | null) {
  if (n === null) return "—";
  return Math.round(n).toLocaleString("pt-BR");
}

function num(n: number) {
  return n.toLocaleString("pt-BR");
}

function Grupo({
  titulo,
  linhas,
  primeira,
}: {
  titulo: string;
  linhas: LinhaGrupoApi[];
  primeira: string;
}) {
  if (linhas.length === 0) return null;
  return (
    <div className="tabela-caixa">
      <table className="tabela-simples coeficiente">
        <caption className="ficha__subtitulo">{titulo}</caption>
        <thead>
          <tr>
            <th scope="col">{primeira}</th>
            <th scope="col" className="num">
              SKUs
            </th>
            <th scope="col" className="num">
              Vendas
            </th>
            <th scope="col" className="num">
              Reclamações
            </th>
            <th scope="col" className="num">
              PPM
            </th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.nome} className={l.acimaLimite ? "acima" : undefined}>
              <th scope="row">{l.nome}</th>
              <td className="num">{num(l.skus)}</td>
              <td className="num">{num(l.vendas)}</td>
              <td className="num">{num(l.reclamacoes)}</td>
              <td className="num">{ppm(l.ppm)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Coeficiente de defeito no relatório. Não abre plano a partir do SKU. */
export function PainelCoeficiente({ dados }: { dados: CoeficienteApi }) {
  const t = dados.totais;
  const comCaso = dados.porSku.filter((l) => l.reclamacoes > 0);
  const amostra = comCaso.slice(0, 80);
  return (
    <section className="relatorio__bloco" aria-label="Coeficiente de defeito">
      <h3 className="ficha__subtitulo">Coeficiente de defeito</h3>
      <p className="pagina__apoio">
        Reclamações divididas pelas vendas, em peças por milhão. Limite{" "}
        {num(dados.limitePpm)} PPM.
        {dados.modoContagem === "procedentes"
          ? " Pelo menos 30% dos casos do período têm procedência, então a conta usa só PROCEDE."
          : " Menos de 30% dos casos têm procedência PROCEDE ou NÃO PROCEDE, então a conta usa todos."}
      </p>
      <dl className="relatorio__totais">
        <div>
          <dt>PPM</dt>
          <dd>{ppm(t.ppm)}</dd>
        </div>
        <div>
          <dt>Reclamações na conta</dt>
          <dd>{num(t.reclamacoes)}</dd>
        </div>
        <div>
          <dt>Vendas</dt>
          <dd>{num(t.vendas)}</dd>
        </div>
        <div>
          <dt>SKUs acima do limite</dt>
          <dd>{num(t.acimaLimite)}</dd>
        </div>
        <div>
          <dt>SKUs sem venda</dt>
          <dd>{num(t.semVenda)}</dd>
        </div>
      </dl>
      {amostra.length === 0 ? (
        <p className="pagina__apoio">Nenhuma reclamação neste recorte.</p>
      ) : (
        <div className="tabela-caixa">
          <table className="tabela-simples coeficiente">
            <caption className="sr-only">Coeficiente por SKU</caption>
            <thead>
              <tr>
                <th scope="col">Código</th>
                <th scope="col">Produto</th>
                <th scope="col">Bancada</th>
                <th scope="col">Setor responsável</th>
                <th scope="col" className="num">
                  Vendas
                </th>
                <th scope="col" className="num">
                  Reclamações
                </th>
                <th scope="col" className="num">
                  PPM
                </th>
              </tr>
            </thead>
            <tbody>
              {amostra.map((l) => (
                <tr
                  key={l.sku}
                  className={
                    l.acimaLimite
                      ? "acima"
                      : l.semVenda
                        ? "sem-venda"
                        : undefined
                  }
                >
                  <th scope="row">{l.sku}</th>
                  <td>{l.produto || "—"}</td>
                  <td>{l.bancada}</td>
                  <td>{l.setorResp}</td>
                  <td className="num">{num(l.vendas)}</td>
                  <td className="num">{num(l.reclamacoes)}</td>
                  <td className={`num${l.semVenda ? " sem-venda" : ""}`}>
                    {l.semVenda ? "Sem venda" : ppm(l.ppm)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {comCaso.length > amostra.length && (
        <p className="pagina__apoio">
          A tabela mostra {amostra.length} de {num(comCaso.length)} SKUs com
          reclamação. Os totais incluem todos.
        </p>
      )}
      <Grupo
        titulo="Por bancada"
        linhas={dados.porBancada}
        primeira="Bancada"
      />
      <Grupo
        titulo="Por setor responsável"
        linhas={dados.porSetorResp}
        primeira="Setor responsável"
      />
    </section>
  );
}
