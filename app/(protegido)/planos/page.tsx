import { redirect } from "next/navigation";
import { Selo } from "@/components/ui";
import type { OpcoesFiltro } from "@/lib/reclamacoes";
import { buscarNaApi } from "@/lib/reclamacoes";
import { obterUsuario } from "@/lib/sessao";
import { BotaoEfeito, FormularioPlano } from "./formulario";
import "./planos.css";

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

const TOM: Record<string, "ok" | "atencao" | "perigo" | "info"> = {
  aberto: "info",
  em_andamento: "atencao",
  concluido: "ok",
  cancelado: "perigo",
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
    <div className="planos">
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
        <section className="vazio">
          <h2 className="vazio__titulo">Nenhum plano gravado</h2>
          <p className="vazio__texto">
            O plano novo aparece aqui, com o efeito e o card do ClickUp.
          </p>
        </section>
      ) : (
        <ul className="planos__lista">
          {itens.map((p) => (
            <li key={p.id} className="planos__item">
              <div className="planos__item-corpo">
                <div className="planos__item-cab">
                  <strong>{p.titulo}</strong>
                  <Selo tom={TOM[p.status] ?? "info"}>
                    {STATUS[p.status] ?? p.status}
                  </Selo>
                </div>
                {p.causa && <p className="planos__meta">{p.causa}</p>}
                {p.descricao && <p className="planos__texto">{p.descricao}</p>}
                {p.efeito && (
                  <p className="planos__efeito">
                    <span>{p.efeito.antes} antes</span>
                    <span>{p.efeito.depois} depois</span>
                    <span>{p.efeito.quedaPercentual}%</span>
                    <span>
                      {p.efeito.resultado === "caiu"
                        ? "A ocorrência caiu"
                        : "A ocorrência não caiu"}
                    </span>
                  </p>
                )}
                {p.card === "criado" && (
                  <p className="planos__meta">Card no ClickUp criado.</p>
                )}
                {p.card && p.card !== "criado" && (
                  <p className="planos__meta">{p.card}</p>
                )}
              </div>
              {podeGerir && <BotaoEfeito id={p.id} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
