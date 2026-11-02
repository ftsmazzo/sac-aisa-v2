"use client";

import { useState } from "react";
import { Botao, Cartao, Selo } from "@/components/ui";
import {
  chamarAdminIa,
  mensagemAdminIa,
  type ResumoConhecimento,
} from "@/lib/ia";
import "../../reclamacoes/ia.css";

type Props = { inicial: ResumoConhecimento | null; carregou: boolean };

export function ConhecimentoPainel({ inicial, carregou }: Props) {
  const [resumo, setResumo] = useState(inicial);
  const [url, setUrl] = useState("https://aisadobrasil.com.br/");
  const [acervoUrl, setAcervoUrl] = useState("produtos-site");
  const [maxPaginas, setMaxPaginas] = useState(40);
  const [syncing, setSyncing] = useState(false);
  const [importando, setImportando] = useState(false);
  const [crawlando, setCrawlando] = useState(false);
  const [aviso, setAviso] = useState<{
    tom: "ok" | "erro";
    texto: string;
  } | null>(null);

  async function recarregar() {
    const r = await chamarAdminIa("/conhecimento", "GET");
    if (r.ok) {
      setResumo(r.dados as unknown as ResumoConhecimento);
    }
  }

  async function sincronizar() {
    setSyncing(true);
    setAviso(null);
    const r = await chamarAdminIa("/conhecimento/sincronizar", "POST");
    setSyncing(false);
    if (!r.ok) {
      setAviso({
        tom: "erro",
        texto: mensagemAdminIa(
          r,
          "Falha ao sincronizar. Confira a chave OpenRouter.",
        ),
      });
      return;
    }
    const gravados = Number(r.dados.gravados ?? 0);
    const erros = Number(r.dados.erros ?? 0);
    const total = Number(r.dados.total_ativos ?? 0);
    setAviso({
      tom: erros > 0 && gravados === 0 ? "erro" : "ok",
      texto: `Sincronizado: ${gravados} trechos gravados${erros ? `, ${erros} erro(s)` : ""}. Total ativo: ${total}.`,
    });
    await recarregar();
  }

  async function importar() {
    setImportando(true);
    setAviso(null);
    const r = await chamarAdminIa("/conhecimento/importar-url", "POST", {
      url: url.trim(),
      acervo: acervoUrl,
    });
    setImportando(false);
    if (!r.ok) {
      setAviso({
        tom: "erro",
        texto: mensagemAdminIa(r, "Não foi possível importar a URL."),
      });
      return;
    }
    if (r.dados.ok === false) {
      setAviso({
        tom: "erro",
        texto:
          typeof r.dados.mensagem === "string"
            ? r.dados.mensagem
            : "Importação recusada.",
      });
      return;
    }
    setAviso({
      tom: "ok",
      texto: `Importado: ${String(r.dados.chunks ?? 0)} trecho(s) no acervo ${String(r.dados.acervo ?? acervoUrl)}.`,
    });
    await recarregar();
  }

  async function importarSite() {
    setCrawlando(true);
    setAviso(null);
    const r = await chamarAdminIa("/conhecimento/importar-site", "POST", {
      url: url.trim(),
      maxPaginas,
    });
    setCrawlando(false);
    if (!r.ok) {
      setAviso({
        tom: "erro",
        texto: mensagemAdminIa(
          r,
          "Crawl falhou (timeout ou allowlist). Tente de novo.",
        ),
      });
      return;
    }
    if (r.dados.ok === false) {
      setAviso({
        tom: "erro",
        texto:
          typeof r.dados.mensagem === "string"
            ? r.dados.mensagem
            : "Crawl recusado.",
      });
      return;
    }
    const paginas = Number(r.dados.paginas_ok ?? 0);
    const chunks = Number(r.dados.chunks ?? 0);
    const erros = Array.isArray(r.dados.erros) ? r.dados.erros.length : 0;
    setAviso({
      tom: paginas === 0 ? "erro" : "ok",
      texto: `Site indexado: ${paginas} página(s), ${chunks} trecho(s)${erros ? `, ${erros} falha(s)` : ""}. Contato/sobre vão para institucional; catálogo para produtos-site.`,
    });
    await recarregar();
  }

  if (!carregou) {
    return (
      <Cartao>
        <h2 className="ficha__subtitulo">Base de conhecimento (RAG)</h2>
        <p className="aviso aviso--erro" role="alert">
          Não foi possível carregar a base de conhecimento.
        </p>
      </Cartao>
    );
  }

  const acervos = resumo?.acervos ?? [];
  const porAcervo = resumo?.porAcervo ?? {};
  const allowlist = resumo?.allowlist ?? [];
  const ocupado = syncing || importando || crawlando;

  return (
    <Cartao>
      <h2 className="ficha__subtitulo">
        Base de conhecimento (RAG)
        <Selo tom={resumo && resumo.total > 0 ? "ok" : "info"}>
          {resumo?.total ?? 0} trechos
        </Selo>
      </h2>
      <p className="pagina__apoio">
        O agente gestor mistura SDR (empresa, site, política) com consulta
        operacional (KPI, planos, fila). Use <strong>Importar site</strong> para
        varrer o domínio allowlist a partir da URL raiz (não precisa página a
        página).
      </p>

      <p className="ia-admin__grupo">Acervos</p>
      <ul className="ia-admin__lista">
        {acervos.map((a) => (
          <li key={a.id} className="ia-admin__item">
            <div>
              <strong>{a.rotulo}</strong>
              <p className="pagina__apoio" style={{ marginTop: 4 }}>
                {a.descricao}
              </p>
            </div>
            <Selo tom={porAcervo[a.id] ? "ok" : "info"}>
              {porAcervo[a.id] ?? 0}
            </Selo>
          </li>
        ))}
      </ul>

      <div className="ia-admin__linha" style={{ marginTop: 8 }}>
        <Botao
          variante="primario"
          disabled={ocupado}
          onClick={() => void sincronizar()}
        >
          {syncing ? "Sincronizando…" : "Sincronizar base interna"}
        </Botao>
        <p className="pagina__apoio" style={{ margin: 0 }}>
          Modelo: {resumo?.modelo || "—"}. Fontes: perfil, perguntas, causas,
          amostra de casos.
        </p>
      </div>

      <p className="ia-admin__grupo">Importar site (crawl)</p>
      {allowlist.length === 0 ? (
        <p className="aviso" role="status">
          Defina <code>CONHECIMENTO_URL_ALLOWLIST</code> no EasyPanel (ex.:{" "}
          <code>aisadobrasil.com.br</code>) para liberar importação.
        </p>
      ) : (
        <p className="pagina__apoio">
          Domínios permitidos: {allowlist.join(", ")}. O crawl segue links
          internos, prioriza contato/sobre/garantia e ignora carrinho/login.
        </p>
      )}

      <div className="ia-admin__grade">
        <div className="ia-admin__campo">
          <label htmlFor="conhecimento-url">URL semente (HTTPS)</label>
          <input
            id="conhecimento-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://aisadobrasil.com.br/"
            autoComplete="off"
          />
        </div>
        <div className="ia-admin__campo">
          <label htmlFor="conhecimento-max">Máx. páginas</label>
          <input
            id="conhecimento-max"
            type="number"
            min={1}
            max={80}
            value={maxPaginas}
            onChange={(e) => setMaxPaginas(Number(e.target.value) || 40)}
          />
        </div>
        <div className="ia-admin__linha">
          <Botao
            variante="primario"
            disabled={ocupado || !url.trim() || allowlist.length === 0}
            onClick={() => void importarSite()}
          >
            {crawlando
              ? "Varrendo site… (pode levar alguns minutos)"
              : "Importar site"}
          </Botao>
        </div>
      </div>

      <p className="ia-admin__grupo">Uma página só (opcional)</p>
      <div className="ia-admin__grade">
        <div className="ia-admin__campo">
          <label htmlFor="conhecimento-acervo">Acervo</label>
          <select
            id="conhecimento-acervo"
            value={acervoUrl}
            onChange={(e) => setAcervoUrl(e.target.value)}
          >
            {acervos.map((a) => (
              <option key={a.id} value={a.id}>
                {a.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="ia-admin__linha">
          <Botao
            variante="secundario"
            disabled={ocupado || !url.trim() || allowlist.length === 0}
            onClick={() => void importar()}
          >
            {importando ? "Importando…" : "Importar só esta URL"}
          </Botao>
        </div>
      </div>

      {aviso ? (
        <p
          className={
            aviso.tom === "ok" ? "aviso aviso--ok" : "aviso aviso--erro"
          }
          role="status"
        >
          {aviso.texto}
        </p>
      ) : null}
    </Cartao>
  );
}
