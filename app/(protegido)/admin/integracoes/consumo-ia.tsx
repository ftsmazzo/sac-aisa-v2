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
  const selo = !c.configurada
    ? { tom: "atencao" as const, rotulo: "IA não configurada" }
    : c.limiteAtingido
      ? { tom: "perigo" as const, rotulo: "Limite atingido" }
      : { tom: "ok" as const, rotulo: "Dentro do limite" };

  return (
    <div className="ia-painel">
      <Cartao className="ia-medida">
        <header className="ia-medida__cab">
          <h2>Consumo da IA hoje</h2>
          <Selo tom={selo.tom}>{selo.rotulo}</Selo>
        </header>
        <dl className="ia-medida__numeros">
          <div>
            <dt>Chamadas</dt>
            <dd>
              {c.chamadas}
              <small>de {c.limiteChamadas}</small>
            </dd>
          </div>
          <div>
            <dt>Custo</dt>
            <dd>
              {dolar(c.custoUsd)}
              <small>de {dolar(c.limiteCustoUsd)}</small>
            </dd>
          </div>
          <div>
            <dt>Modelo</dt>
            <dd className="ia-medida__modelo">{c.modelo}</dd>
          </div>
        </dl>
        <p className="ia-medida__nota">
          O custo é o informado pelo OpenRouter, ou uma estimativa pela tabela
          do modelo. Passou do limite, a ficha segue sem IA até amanhã.
        </p>
      </Cartao>
      {q.ok && (
        <Cartao className="ia-medida">
          <header className="ia-medida__cab">
            <h2>Qualidade do registro</h2>
            <Selo tom={q.dados.pctAutomatico === null ? "atencao" : "info"}>
              {q.dados.pctAutomatico === null
                ? "Sem dados ainda"
                : `${q.dados.pctAutomatico}% sem digitação`}
            </Selo>
          </header>
          <dl className="ia-medida__numeros">
            <div>
              <dt>Campos registrados</dt>
              <dd>{q.dados.camposRegistrados}</dd>
            </div>
            <div>
              <dt>Reclamações</dt>
              <dd>{q.dados.reclamacoes}</dd>
            </div>
            <div>
              <dt>Tempo médio em triagem</dt>
              <dd>
                {q.dados.tempoMedioTriagemMin === null
                  ? "—"
                  : `${q.dados.tempoMedioTriagemMin} min`}
              </dd>
            </div>
          </dl>
          <p className="ia-medida__nota">
            {q.dados.pctAutomatico === null
              ? "A origem de cada campo começa a ser guardada quando a pessoa decide a sugestão da IA."
              : "Canal, IA e importação entram sem digitação. Pessoa é o que alguém preencheu. Correções são sugestões da IA que foram trocadas."}
          </p>
          {q.dados.porCampo.length > 0 && (
            <div className="ia-rolagem">
              <table className="ia-tabela">
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
                      <th scope="row">{ROTULO_CAMPO[f.campo] ?? f.campo}</th>
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
            </div>
          )}
        </Cartao>
      )}
    </div>
  );
}
