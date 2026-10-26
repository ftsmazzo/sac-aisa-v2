import { redirect } from "next/navigation";
import type { OpcoesFiltro } from "@/lib/reclamacoes";
import { buscarNaApi } from "@/lib/reclamacoes";
import { obterUsuario } from "@/lib/sessao";
import { BotaoEfeito, FormularioPlano } from "./formulario";

interface Plano {
  id: string;
  titulo: string;
  descricao: string;
  status: string;
  causa: string | null;
  efeito: {
    resultado: string;
    quedaPercentual: number;
    antes: number;
    depois: number;
  } | null;
  card: string | null;
}

const STATUS: Record<string, string> = {
  aberto: "Aberto",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

export default async function Planos() {
  const usuario = await obterUsuario();
  if (!usuario) redirect("/login");
  if (!usuario.permissoes.includes("planos.ver")) {
    return (
      <section className="vazio">
        <h1 className="vazio__titulo">Sem acesso aos planos</h1>
      </section>
    );
  }
  const [lista, opcoes] = await Promise.all([
    buscarNaApi<{ itens: Plano[] }>("/planos"),
    buscarNaApi<OpcoesFiltro>("/reclamacoes/filtros"),
  ]);
  if (!lista.ok && lista.status === 401) redirect("/login");
  const itens = lista.ok ? lista.dados.itens : [];
  const podeGerir = usuario.permissoes.includes("planos.gerir");

  return (
    <>
      <div className="pagina__cab">
        <h1 className="pagina__titulo">Planos de ação</h1>
        <p className="pagina__apoio">
          O efeito compara a ocorrência antes e depois. Se não caiu, o plano
          reabre. O card no ClickUp sai pela lista já gravada.
        </p>
      </div>
      {podeGerir && (
        <FormularioPlano causas={opcoes.ok ? opcoes.dados.causas : []} />
      )}
      {itens.length === 0 ? (
        <p className="pagina__apoio">Nenhum plano gravado.</p>
      ) : (
        <ul className="ficha__analises">
          {itens.map((p) => (
            <li key={p.id} className="cartao">
              <strong>{p.titulo}</strong>
              <p>
                {STATUS[p.status] ?? p.status}
                {p.causa ? ` · ${p.causa}` : ""}
              </p>
              {p.descricao && <p>{p.descricao}</p>}
              {p.efeito && (
                <p>
                  {p.efeito.antes} antes, {p.efeito.depois} depois (
                  {p.efeito.quedaPercentual}%).{" "}
                  {p.efeito.resultado === "caiu"
                    ? "A ocorrência caiu."
                    : "A ocorrência não caiu."}
                </p>
              )}
              {p.card === "criado" && <p>Card no ClickUp criado.</p>}
              {p.card && p.card !== "criado" && <p>{p.card}</p>}
              {podeGerir && <BotaoEfeito id={p.id} />}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
