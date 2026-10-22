import { Cartao, Selo } from "@/components/ui";
import { dolar, type QualidadeIa, ROTULO_CAMPO } from "@/lib/ia";
import { buscarNaApi } from "@/lib/reclamacoes";

interface Consumo {
  configurada: boolean;
  modelo: string;
  chamadas: number;
  custoUsd: number;
  limiteChamadas: number;
  limiteCustoUsd: number;
  limiteAtingido: boolean;
}

/** Consumo de hoje da IA, ao lado do cartão do OpenRouter. Se a API falhar, a tela segue sem ele. */
export async function ConsumoIa() {
  const r = await buscarNaApi<Consumo>("/admin/ia/consumo");
  if (!r.ok) return null;
  const c = r.dados;
  const q = await buscarNaApi<QualidadeIa>("/admin/ia/qualidade");
  return (
    <>
      <Cartao>
        <h2 className="ficha__subtitulo">
          Consumo da IA hoje{" "}
          {!c.configurada ? (
            <Selo tom="atencao">IA não configurada</Selo>
          ) : c.limiteAtingido ? (
            <Selo tom="perigo">Limite atingido</Selo>
          ) : (
            <Selo tom="ok">Dentro do limite</Selo>
          )}
        </h2>
        <p className="pagina__apoio">
          {c.chamadas} de {c.limiteChamadas} chamadas · {dolar(c.custoUsd)} de{" "}
          {dolar(c.limiteCustoUsd)} · modelo {c.modelo}. O custo é o informado
          pelo OpenRouter (ou uma estimativa pela tabela do modelo). Passou do
          limite, a ficha segue sem IA até amanhã.
        </p>
      </Cartao>
      {q.ok && (
        <Cartao>
          <h2 className="ficha__subtitulo">Qualidade do registro</h2>
          <p className="pagina__apoio">
            {q.dados.pctAutomatico === null
              ? "Ainda sem dados: a origem de cada campo começa a ser guardada quando a pessoa decide a sugestão da IA."
              : `${q.dados.pctAutomatico}% dos campos registrados vieram sem digitação (canal, IA ou importação).`}{" "}
            Tempo médio em triagem:{" "}
            {q.dados.tempoMedioTriagemMin === null
              ? "—"
              : `${q.dados.tempoMedioTriagemMin} min`}
            .
          </p>
          {q.dados.porCampo.length > 0 && (
            <table className="tabela-simples">
              <thead>
                <tr>
                  <th>Campo</th>
                  <th>Canal</th>
                  <th>IA</th>
                  <th>Pessoa</th>
                  <th>Importado</th>
                  <th>Aceite da IA</th>
                  <th>Correções</th>
                </tr>
              </thead>
              <tbody>
                {q.dados.porCampo.map((f) => (
                  <tr key={f.campo}>
                    <td>{ROTULO_CAMPO[f.campo] ?? f.campo}</td>
                    <td>{f.canal}</td>
                    <td>{f.ia}</td>
                    <td>{f.pessoa}</td>
                    <td>{f.importado}</td>
                    <td>
                      {f.taxaAceiteIa === null ? "—" : `${f.taxaAceiteIa}%`}
                    </td>
                    <td>{f.corrigidasIa}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Cartao>
      )}
    </>
  );
}
