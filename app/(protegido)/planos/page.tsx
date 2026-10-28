import { redirect } from "next/navigation";
import { Selo } from "@/components/ui";
import type { OpcoesFiltro } from "@/lib/reclamacoes";
import { buscarNaApi } from "@/lib/reclamacoes";
import type { ParamsUrl } from "@/lib/reclamacoes-formato";
import { obterUsuario } from "@/lib/sessao";
import { BotaoEfeito, FormularioPlano, type PrefillPlano } from "./formulario";
import "./planos.css";

interface Plano {
  id: string;
  titulo: string;
  descricao: string;
  status: string;
  origem?: string;
  causa: string | null;
  produto: string | null;
  vinculados?: number;
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

function texto(v: string | string[] | undefined) {
  return typeof v === "string" ? v.trim() : "";
}

export default async function Planos({
  searchParams,
}: {
  searchParams: Promise<ParamsUrl>;
}) {
  const usuario = await obterUsuario();
  if (!usuario) redirect("/login");
  if (!usuario.permissoes.includes("planos.ver")) {
    return (
      <section className="vazio">
        <h1 className="vazio__titulo">Sem acesso aos planos</h1>
      </section>
    );
  }
  const q = await searchParams;
  const sku = texto(q.sku);
  const de = texto(q.de);
  const ate = texto(q.ate);
  const podeGerir = usuario.permissoes.includes("planos.gerir");

  const preencherQs = new URLSearchParams();
  if (sku) preencherQs.set("sku", sku);
  if (de) preencherQs.set("de", de);
  if (ate) preencherQs.set("ate", ate);

  type PrefillApi = {
    sku?: string;
    produtoId?: string | null;
    produtoNome?: string;
    bancadaId?: string | null;
    causaId?: string | null;
    setorRespId?: string | null;
    titulo?: string;
    descricao?: string;
    origem?: string;
    baselineInicio?: string;
    baselineFim?: string;
    reclamacaoIds?: string[];
    acao?: string;
    ocorrencias?: number;
    bancada?: string | null;
    causaNome?: string | null;
  };
  const [lista, opcoes, prefillResp] = await Promise.all([
    buscarNaApi<{ itens: Plano[] }>("/planos"),
    buscarNaApi<OpcoesFiltro>("/reclamacoes/filtros"),
    podeGerir && sku
      ? buscarNaApi<PrefillApi>(`/planos/preencher?${preencherQs}`)
      : Promise.resolve(null),
  ]);
  if (!lista.ok && lista.status === 401) redirect("/login");
  const itens = lista.ok ? lista.dados.itens : [];
  const prefill: PrefillPlano | null = prefillResp?.ok
    ? {
        sku: prefillResp.dados.sku,
        produtoNome: prefillResp.dados.produtoNome,
        bancada: prefillResp.dados.bancada,
        causaNome: prefillResp.dados.causaNome,
        acao: prefillResp.dados.acao,
        ocorrencias: prefillResp.dados.ocorrencias,
        reclamacaoIds: prefillResp.dados.reclamacaoIds ?? [],
        causaId: prefillResp.dados.causaId ?? "",
        produtoId: prefillResp.dados.produtoId ?? "",
        bancadaId: prefillResp.dados.bancadaId ?? "",
        setorRespId: prefillResp.dados.setorRespId ?? "",
        titulo: prefillResp.dados.titulo ?? "",
        descricao: prefillResp.dados.descricao ?? "",
        origem: prefillResp.dados.origem ?? "kpi",
        baselineInicio: prefillResp.dados.baselineInicio ?? "",
        baselineFim: prefillResp.dados.baselineFim ?? "",
      }
    : null;
  const avisoPrefill =
    sku && prefillResp && !prefillResp.ok
      ? prefillResp.mensagem || "Não foi possível pré-preencher pelo SKU."
      : null;

  return (
    <div className="planos">
      <div className="pagina__cab">
        <h1 className="pagina__titulo">Planos de ação</h1>
        <p className="pagina__apoio">
          O efeito compara a ocorrência antes e depois. Se não caiu, o plano
          reabre. O card no ClickUp sai pela lista já gravada.
        </p>
      </div>
      {avisoPrefill && (
        <p className="aviso aviso--erro" role="alert">
          {avisoPrefill}
        </p>
      )}
      {podeGerir && (
        <FormularioPlano
          causas={opcoes.ok ? opcoes.dados.causas : []}
          setores={opcoes.ok ? opcoes.dados.setores : []}
          bancadas={opcoes.ok ? opcoes.dados.bancadas : []}
          prefill={prefill}
        />
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
                <p className="planos__meta">
                  {[
                    p.causa,
                    p.produto,
                    p.origem,
                    p.vinculados ? `${p.vinculados} vinculado(s)` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
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
