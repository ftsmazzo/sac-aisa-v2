"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Botao } from "@/components/ui";
import { criarPlano, medirPlano } from "./acoes";

export type PrefillPlano = {
  titulo: string;
  descricao: string;
  causaId: string;
  produtoId: string;
  bancadaId: string;
  setorRespId: string;
  origem: string;
  baselineInicio: string;
  baselineFim: string;
  reclamacaoIds: string[];
  sku?: string;
  produtoNome?: string;
  bancada?: string | null;
  causaNome?: string | null;
  acao?: string;
  ocorrencias?: number;
};

export function FormularioPlano({
  causas,
  setores,
  bancadas,
  prefill,
}: {
  causas: { id: string; nome: string; acao?: string }[];
  setores: { id: string; nome: string }[];
  bancadas: { id: string; codigo: string; nome: string }[];
  prefill?: PrefillPlano | null;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const [causaId, setCausaId] = useState(prefill?.causaId ?? "");
  const [idsVinculo, setIdsVinculo] = useState(
    (prefill?.reclamacaoIds ?? []).join(","),
  );
  const baselineInicial = prefill?.baselineInicio ?? "";
  const baselineFinal = prefill?.baselineFim ?? "";
  const acaoDaCausa =
    causas.find((c) => c.id === causaId)?.acao?.trim() ||
    prefill?.acao?.trim() ||
    "";

  function periodoMudou(dados: FormData) {
    const de = String(dados.get("baselineInicio") ?? "");
    const ate = String(dados.get("baselineFim") ?? "");
    return (
      (baselineInicial || baselineFinal) &&
      (de !== baselineInicial || ate !== baselineFinal)
    );
  }

  function gravar(dados: FormData) {
    setErro(null);
    iniciar(async () => {
      // Se o período mudou, descarta IDs do prefill: a API religa no KPI pelo novo recorte.
      const idsBrutos = periodoMudou(dados)
        ? ""
        : String(dados.get("reclamacaoIds") ?? "").trim();
      const reclamacaoIds = idsBrutos
        ? idsBrutos.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
      if (periodoMudou(dados)) setIdsVinculo("");
      const r = await criarPlano({
        titulo: String(dados.get("titulo") ?? ""),
        descricao: String(dados.get("descricao") ?? ""),
        causaId: String(dados.get("causaId") ?? ""),
        produtoId: String(dados.get("produtoId") ?? "") || undefined,
        bancadaId: String(dados.get("bancadaId") ?? "") || undefined,
        setorRespId: String(dados.get("setorRespId") ?? "") || undefined,
        origem: String(dados.get("origem") ?? "manual") || "manual",
        prioridade: String(dados.get("prioridade") ?? "media") || "media",
        responsavel: String(dados.get("responsavel") ?? ""),
        prazo: String(dados.get("prazo") ?? "") || undefined,
        baselineInicio: String(dados.get("baselineInicio") ?? "") || undefined,
        baselineFim: String(dados.get("baselineFim") ?? "") || undefined,
        reclamacaoIds: reclamacaoIds.length ? reclamacaoIds : undefined,
      });
      if (!r.ok) {
        setErro(r.mensagem);
        return;
      }
      router.replace("/planos");
      router.refresh();
    });
  }

  return (
    <form action={gravar} className="cartao">
      <h2 className="ficha__subtitulo">
        {prefill?.origem === "kpi" ? "Novo plano a partir do coeficiente" : "Novo plano"}
      </h2>
      {prefill?.sku && (
        <p className="pagina__apoio">
          SKU {prefill.sku}
          {prefill.produtoNome ? ` · ${prefill.produtoNome}` : ""}
          {typeof prefill.ocorrencias === "number"
            ? ` · ${prefill.ocorrencias} ocorrência(s) no período`
            : ""}
          {idsVinculo
            ? ` · ${idsVinculo.split(",").filter(Boolean).length} caso(s) serão vinculados`
            : prefill.origem === "kpi"
              ? " · vínculos pelo período ao gravar"
              : ""}
        </p>
      )}
      <input type="hidden" name="produtoId" value={prefill?.produtoId ?? ""} />
      <input type="hidden" name="origem" value={prefill?.origem ?? "manual"} />
      <input type="hidden" name="reclamacaoIds" value={idsVinculo} />
      <div className="planos__campo">
        <label htmlFor="plano-titulo">Título</label>
        <input
          id="plano-titulo"
          name="titulo"
          required
          maxLength={160}
          defaultValue={prefill?.titulo ?? ""}
        />
      </div>
      <div className="planos__campo">
        <label htmlFor="plano-descricao">O que vai ser feito</label>
        <textarea
          id="plano-descricao"
          name="descricao"
          rows={4}
          defaultValue={prefill?.descricao ?? ""}
        />
        {acaoDaCausa && (
          <p className="campo__ajuda">Ação sugerida da causa: {acaoDaCausa}</p>
        )}
      </div>
      <div className="planos__grade">
        <div className="planos__campo">
          <label htmlFor="plano-causa">Causa que o plano ataca</label>
          <select
            id="plano-causa"
            name="causaId"
            required
            value={causaId}
            onChange={(e) => setCausaId(e.target.value)}
          >
            <option value="">Escolha</option>
            {causas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="planos__campo">
          <label htmlFor="plano-bancada">Bancada</label>
          <select
            id="plano-bancada"
            name="bancadaId"
            defaultValue={prefill?.bancadaId ?? ""}
          >
            <option value="">Não informada</option>
            {bancadas.map((b) => (
              <option key={b.id} value={b.id}>
                {b.codigo}
                {b.nome ? ` · ${b.nome}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="planos__campo">
          <label htmlFor="plano-setor">Setor responsável</label>
          <select
            id="plano-setor"
            name="setorRespId"
            defaultValue={prefill?.setorRespId ?? ""}
          >
            <option value="">Pela causa</option>
            {setores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="planos__campo">
          <label htmlFor="plano-prioridade">Prioridade</label>
          <select
            id="plano-prioridade"
            name="prioridade"
            defaultValue="media"
          >
            <option value="baixa">Baixa</option>
            <option value="media">Média</option>
            <option value="alta">Alta</option>
          </select>
        </div>
        <div className="planos__campo">
          <label htmlFor="plano-responsavel">Responsável</label>
          <input
            id="plano-responsavel"
            name="responsavel"
            maxLength={120}
          />
        </div>
        <div className="planos__campo">
          <label htmlFor="plano-prazo">Prazo</label>
          <input id="plano-prazo" name="prazo" type="date" />
        </div>
        <div className="planos__campo">
          <label htmlFor="plano-de">Período (início)</label>
          <input
            id="plano-de"
            name="baselineInicio"
            type="date"
            defaultValue={prefill?.baselineInicio ?? ""}
            onChange={() => setIdsVinculo("")}
          />
        </div>
        <div className="planos__campo">
          <label htmlFor="plano-ate">Período (fim)</label>
          <input
            id="plano-ate"
            name="baselineFim"
            type="date"
            defaultValue={prefill?.baselineFim ?? ""}
            onChange={() => setIdsVinculo("")}
          />
        </div>
      </div>
      {erro && (
        <p className="aviso aviso--erro" role="alert">
          {erro}
        </p>
      )}
      <div className="planos__acoes">
        <Botao type="submit" disabled={pendente}>
          Gravar plano
        </Botao>
      </div>
    </form>
  );
}

export function BotaoEfeito({ id }: { id: string }) {
  const router = useRouter();
  const [texto, setTexto] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  return (
    <>
      <div className="planos__item-acoes">
        <button
          type="button"
          className="botao botao--secundario"
          disabled={pendente}
          onClick={() => {
            setTexto(null);
            iniciar(async () => {
              const r = await medirPlano(id);
              if (!r.ok) {
                setTexto(r.mensagem);
                return;
              }
              setTexto(
                r.resultado === "caiu"
                  ? "A ocorrência caiu; plano concluído."
                  : "A ocorrência não caiu; plano reaberto.",
              );
              router.refresh();
            });
          }}
        >
          {pendente ? "Medindo…" : "Medir efeito"}
        </button>
      </div>
      {texto && <p className="planos__meta">{texto}</p>}
    </>
  );
}
