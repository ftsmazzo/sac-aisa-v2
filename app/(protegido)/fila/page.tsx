import Link from "next/link";
import { redirect } from "next/navigation";
import { Selo } from "@/components/ui";
import { type RespostaFila, ROTULO_ALERTA } from "@/lib/fila-alertas";
import { consultaDeMarca } from "@/lib/marca-escolhida";
import { marcaAtiva } from "@/lib/marca-servidor";
import { buscarNaApi } from "@/lib/reclamacoes";
import {
  data,
  moeda,
  ROTULO_DEVOLUCAO,
  ROTULO_ESTADO,
  tomDoEstado,
} from "@/lib/reclamacoes-formato";
import { obterUsuario } from "@/lib/sessao";
import { BotaoAssumir } from "./botao-assumir";

/** Fila do setor: o que está com o setor (encaminhada, recebida, em tratativa), as mais urgentes primeiro. */
export default async function Fila() {
  const usuario = await obterUsuario();
  if (!usuario) redirect("/login");

  if (!usuario.permissoes.includes("reclamacoes.analisar")) {
    return (
      <section className="vazio">
        <h1 className="vazio__titulo">Sem acesso à fila do setor</h1>
        <p className="vazio__texto">
          Seu perfil não registra análise do setor. Fale com o administrador se
          precisar dela.
        </p>
      </section>
    );
  }

  const marca = await marcaAtiva();
  const fila = await buscarNaApi<RespostaFila>(
    `/fila${consultaDeMarca(marca.idNoCadastro)}`,
  );
  if (!fila.ok && fila.status === 401) redirect("/login");

  return (
    <>
      <div className="pagina__cab">
        <h1 className="pagina__titulo">Fila do setor</h1>
        <p className="pagina__apoio">
          {fila.ok
            ? `${fila.dados.total} ${fila.dados.total === 1 ? "reclamação está" : "reclamações estão"} com o setor`
            : "Não foi possível carregar a fila."}
          {usuario.perfil === "responsavel_setor" &&
            usuario.setores.length > 0 &&
            ` · só do seu setor (${usuario.setores.join(", ")})`}
        </p>
      </div>

      {fila.ok && fila.dados.itens.length === 0 && (
        <section className="vazio">
          <h2 className="vazio__titulo">Nada na fila</h2>
          <p className="vazio__texto">
            Nenhuma reclamação está com o setor agora.
          </p>
        </section>
      )}

      {fila.ok && fila.dados.itens.length > 0 && (
        <div className="cartao tabela-caixa">
          <table className="tabela">
            <caption className="sr-only">
              Reclamações com o setor, por urgência
            </caption>
            <thead>
              <tr>
                <th scope="col">Nº</th>
                <th scope="col">Estado</th>
                <th scope="col">Em aberto</th>
                <th scope="col">Produto</th>
                <th scope="col" className="tabela__oculta">
                  Setor
                </th>
                <th scope="col" className="tabela__oculta">
                  Devolução
                </th>
                <th scope="col">Alertas</th>
                <th scope="col" className="tabela__num">
                  Custo
                </th>
                <th scope="col">
                  <span className="sr-only">Ação</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {fila.dados.itens.map((i) => (
                <tr key={i.id}>
                  <td>
                    <Link
                      href={`/reclamacoes?ficha=${encodeURIComponent(i.id)}&acao=analise`}
                      className="tabela__abrir"
                      aria-label={`Analisar a reclamação ${i.numero}`}
                    >
                      #{i.numero}
                    </Link>
                  </td>
                  <td>
                    <Selo tom={tomDoEstado(i.estado)}>
                      {ROTULO_ESTADO[i.estado]}
                    </Selo>
                    {i.analisada && (
                      <span className="tabela__apoio">Análise registrada</span>
                    )}
                  </td>
                  <td>
                    {i.diasEmAberto} {i.diasEmAberto === 1 ? "dia" : "dias"}
                    <span className="tabela__apoio">
                      desde {data(i.dataAbertura)}
                    </span>
                  </td>
                  <td className="tabela__produto">
                    <span className="tabela__principal">
                      {i.produto?.nome ?? "—"}
                    </span>
                    {i.causa && (
                      <span className="tabela__apoio">{i.causa}</span>
                    )}
                  </td>
                  <td className="tabela__oculta">{i.setorResp?.nome ?? "—"}</td>
                  <td className="tabela__oculta">
                    {ROTULO_DEVOLUCAO[i.devolucao]}
                  </td>
                  <td>
                    {i.alertas.length === 0
                      ? "—"
                      : i.alertas.map((t) => (
                          <Selo key={t} tom="atencao">
                            {ROTULO_ALERTA[t]}
                          </Selo>
                        ))}
                  </td>
                  <td className="tabela__num">{moeda(i.custoTotal)}</td>
                  <td>
                    {i.podeAssumir && (
                      <BotaoAssumir id={i.id} numero={i.numero} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!fila.ok && fila.status !== 401 && (
        <section className="vazio">
          <h2 className="vazio__titulo">Não foi possível carregar a fila</h2>
          <p className="vazio__texto">Tente de novo em instantes.</p>
        </section>
      )}
    </>
  );
}
