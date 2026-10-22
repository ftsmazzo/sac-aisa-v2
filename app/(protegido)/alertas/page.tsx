import Link from "next/link";
import { redirect } from "next/navigation";
import { Selo } from "@/components/ui";
import { type RespostaAlertas, ROTULO_ALERTA } from "@/lib/fila-alertas";
import { consultaDeMarca } from "@/lib/marca-escolhida";
import { marcaAtiva } from "@/lib/marca-servidor";
import { buscarNaApi } from "@/lib/reclamacoes";
import { moeda, ROTULO_ESTADO, tomDoEstado } from "@/lib/reclamacoes-formato";
import { obterUsuario } from "@/lib/sessao";

/** Alertas calculados na hora pelas regras de demora e custo, sobre o que está em aberto. */
export default async function Alertas() {
  const usuario = await obterUsuario();
  if (!usuario) redirect("/login");

  if (!usuario.permissoes.includes("alertas.ver")) {
    return (
      <section className="vazio">
        <h1 className="vazio__titulo">Sem acesso aos alertas</h1>
        <p className="vazio__texto">
          Seu perfil não tem permissão para ver esta tela. Fale com o
          administrador se precisar dela.
        </p>
      </section>
    );
  }

  const marca = await marcaAtiva();
  const r = await buscarNaApi<RespostaAlertas>(
    `/alertas${consultaDeMarca(marca.idNoCadastro)}`,
  );
  if (!r.ok && r.status === 401) redirect("/login");

  return (
    <>
      <div className="pagina__cab">
        <h1 className="pagina__titulo">Alertas</h1>
        <p className="pagina__apoio">
          {r.ok
            ? `${r.dados.total} ${r.dados.total === 1 ? "alerta" : "alertas"} em aberto`
            : "Não foi possível carregar os alertas."}
          {usuario.perfil === "responsavel_setor" &&
            usuario.setores.length > 0 &&
            ` · só do seu setor (${usuario.setores.join(", ")})`}
        </p>
      </div>

      {r.ok && r.dados.itens.length === 0 && (
        <section className="vazio">
          <h2 className="vazio__titulo">Nenhum alerta</h2>
          <p className="vazio__texto">
            Nada em aberto passou dos limites de demora ou de custo.
          </p>
        </section>
      )}

      {r.ok && r.dados.itens.length > 0 && (
        <div className="cartao tabela-caixa">
          <table className="tabela">
            <caption className="sr-only">Alertas em aberto</caption>
            <thead>
              <tr>
                <th scope="col">Nº</th>
                <th scope="col">Alerta</th>
                <th scope="col">Estado</th>
                <th scope="col">Em aberto</th>
                <th scope="col" className="tabela__oculta">
                  Produto
                </th>
                <th scope="col" className="tabela__oculta">
                  Setor
                </th>
                <th scope="col" className="tabela__num">
                  Custo
                </th>
              </tr>
            </thead>
            <tbody>
              {r.dados.itens.map((i) => (
                <tr key={`${i.reclamacaoId}-${i.tipo}`}>
                  <td>
                    <Link
                      href={`/reclamacoes?ficha=${encodeURIComponent(i.reclamacaoId)}`}
                      className="tabela__abrir"
                      aria-label={`Abrir a reclamação ${i.numero}`}
                    >
                      #{i.numero}
                    </Link>
                  </td>
                  <td>
                    <Selo tom={i.tipo === "CUSTO_ALTO" ? "perigo" : "atencao"}>
                      {ROTULO_ALERTA[i.tipo]}
                    </Selo>
                  </td>
                  <td>
                    <Selo tom={tomDoEstado(i.estado)}>
                      {ROTULO_ESTADO[i.estado]}
                    </Selo>
                  </td>
                  <td>
                    {i.diasEmAberto} {i.diasEmAberto === 1 ? "dia" : "dias"}
                  </td>
                  <td className="tabela__oculta">{i.produto ?? "—"}</td>
                  <td className="tabela__oculta">{i.setor ?? "—"}</td>
                  <td className="tabela__num">{moeda(i.custoTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!r.ok && r.status !== 401 && (
        <section className="vazio">
          <h2 className="vazio__titulo">
            Não foi possível carregar os alertas
          </h2>
          <p className="vazio__texto">Tente de novo em instantes.</p>
        </section>
      )}
    </>
  );
}
