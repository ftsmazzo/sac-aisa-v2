"use client";

import { useState } from "react";
import { Botao, Cartao, Selo } from "@/components/ui";
import {
  aoContrario,
  chamarAdminIa,
  listaDeTexto,
  mensagemAdminIa,
  type PerguntaAdmin,
  type RegraPergunta,
  type RespostaPerguntas,
  ROTULO_CATEGORIA,
  TIPOS,
} from "@/lib/ia";
import "../../reclamacoes/ia.css";

const NOVA: PerguntaAdmin = {
  id: "",
  chave: "",
  categoria: "",
  texto: "",
  tipo: "texto",
  opcoes: [],
  obrigatoria: true,
  exemplo: "",
  ordem: 0,
  ativa: true,
  regras: [{ familias: [], causaIds: [], causaCategorias: [] }],
  padrao: false,
};

const resumoRegra = (r: RegraPergunta) =>
  [
    r.familias?.length ? `produto: ${r.familias.join("/")}` : "",
    r.causaIds?.length ? `causa: ${r.causaIds.join("/")}` : "",
    r.causaCategorias?.length
      ? `categoria da causa: ${r.causaCategorias.join("/")}`
      : "",
  ]
    .filter(Boolean)
    .join(" e ");

function Editor({
  inicial,
  novo,
  fechar,
  salvo,
}: {
  inicial: PerguntaAdmin;
  novo: boolean;
  fechar: () => void;
  salvo: () => Promise<void>;
}) {
  const [p, setP] = useState(inicial);
  const [opcoes, setOpcoes] = useState(aoContrario(inicial.opcoes));
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  function regra(i: number, parte: Partial<RegraPergunta>) {
    setP({
      ...p,
      regras: p.regras.map((r, j) => (j === i ? { ...r, ...parte } : r)),
    });
  }

  async function salvar() {
    setOcupado(true);
    setErro(null);
    const r = await chamarAdminIa("/perguntas", "POST", {
      chave: p.chave,
      categoria: p.categoria,
      texto: p.texto,
      tipo: p.tipo,
      opcoes: p.tipo === "escolha" ? listaDeTexto(opcoes) : [],
      obrigatoria: p.obrigatoria,
      exemplo: p.exemplo,
      ordem: Number(p.ordem) || 0,
      ativa: p.ativa,
      regras: p.regras,
    });
    if (r.ok) {
      await salvo();
      fechar();
    } else {
      setErro(mensagemAdminIa(r));
    }
    setOcupado(false);
  }

  return (
    <Cartao>
      <h3 className="ficha__subtitulo">
        {novo ? "Nova pergunta" : `Editar ${p.chave}`}
      </h3>
      <div className="ia-admin__grade">
        <div className="ia-admin__linha">
          <div className="ia-admin__campo">
            <label htmlFor="pg-chave">Chave do campo</label>
            <input
              id="pg-chave"
              value={p.chave}
              disabled={!novo}
              maxLength={60}
              onChange={(e) => setP({ ...p, chave: e.target.value })}
            />
          </div>
          <div className="ia-admin__campo">
            <label htmlFor="pg-cat">Categoria</label>
            <input
              id="pg-cat"
              value={p.categoria}
              maxLength={40}
              placeholder="eletrica, embalagem…"
              onChange={(e) => setP({ ...p, categoria: e.target.value })}
            />
          </div>
          <div className="ia-admin__campo">
            <label htmlFor="pg-tipo">Tipo de resposta</label>
            <select
              id="pg-tipo"
              value={p.tipo}
              onChange={(e) =>
                setP({ ...p, tipo: e.target.value as PerguntaAdmin["tipo"] })
              }
            >
              {TIPOS.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.rotulo}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="ia-admin__campo">
          <label htmlFor="pg-texto">Pergunta</label>
          <input
            id="pg-texto"
            value={p.texto}
            maxLength={300}
            onChange={(e) => setP({ ...p, texto: e.target.value })}
          />
        </div>
        {p.tipo === "escolha" && (
          <div className="ia-admin__campo">
            <label htmlFor="pg-opcoes">Opções, separadas por vírgula</label>
            <input
              id="pg-opcoes"
              value={opcoes}
              onChange={(e) => setOpcoes(e.target.value)}
            />
          </div>
        )}
        <div className="ia-admin__linha">
          <div className="ia-admin__campo">
            <label htmlFor="pg-exemplo">Exemplo de resposta</label>
            <input
              id="pg-exemplo"
              value={p.exemplo}
              maxLength={200}
              onChange={(e) => setP({ ...p, exemplo: e.target.value })}
            />
          </div>
          <div className="ia-admin__campo">
            <label htmlFor="pg-ordem">Ordem</label>
            <input
              id="pg-ordem"
              type="number"
              min={0}
              max={999}
              value={p.ordem}
              onChange={(e) => setP({ ...p, ordem: Number(e.target.value) })}
            />
          </div>
        </div>
        <div className="ia-admin__linha">
          <label>
            <input
              type="checkbox"
              checked={p.obrigatoria}
              onChange={(e) => setP({ ...p, obrigatoria: e.target.checked })}
            />{" "}
            Obrigatória
          </label>
          <label>
            <input
              type="checkbox"
              checked={p.ativa}
              onChange={(e) => setP({ ...p, ativa: e.target.checked })}
            />{" "}
            Ativa
          </label>
        </div>
        <fieldset className="ia-admin__campo">
          <legend>
            Quando vale (basta uma regra bater; dentro da regra, todos os
            filtros preenchidos)
          </legend>
          {p.regras.map((r, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: regras sem id próprio
            <div className="ia-admin__linha" key={i}>
              <div className="ia-admin__campo">
                <label htmlFor={`rg-f-${i}`}>Famílias do produto</label>
                <input
                  id={`rg-f-${i}`}
                  value={aoContrario(r.familias)}
                  placeholder="FRITADEIRA, MESA"
                  onChange={(e) =>
                    regra(i, { familias: listaDeTexto(e.target.value) })
                  }
                />
              </div>
              <div className="ia-admin__campo">
                <label htmlFor={`rg-c-${i}`}>Causas (ids)</label>
                <input
                  id={`rg-c-${i}`}
                  value={aoContrario(r.causaIds)}
                  placeholder="eletrico, voltagem"
                  onChange={(e) =>
                    regra(i, { causaIds: listaDeTexto(e.target.value) })
                  }
                />
              </div>
              <div className="ia-admin__campo">
                <label htmlFor={`rg-k-${i}`}>Categorias da causa</label>
                <input
                  id={`rg-k-${i}`}
                  value={aoContrario(r.causaCategorias)}
                  placeholder="Transporte"
                  onChange={(e) =>
                    regra(i, { causaCategorias: listaDeTexto(e.target.value) })
                  }
                />
              </div>
              <Botao
                variante="secundario"
                onClick={() =>
                  setP({ ...p, regras: p.regras.filter((_, j) => j !== i) })
                }
              >
                Remover regra {i + 1}
              </Botao>
            </div>
          ))}
          <Botao
            variante="secundario"
            onClick={() =>
              setP({
                ...p,
                regras: [
                  ...p.regras,
                  { familias: [], causaIds: [], causaCategorias: [] },
                ],
              })
            }
          >
            Adicionar regra
          </Botao>
        </fieldset>
      </div>
      {erro && (
        <p className="aviso aviso--erro" role="alert">
          {erro}
        </p>
      )}
      <div className="ia-decisao__botoes">
        <Botao disabled={ocupado} onClick={salvar}>
          {ocupado ? "Salvando…" : "Salvar pergunta"}
        </Botao>
        <Botao variante="secundario" onClick={fechar}>
          Cancelar
        </Botao>
      </div>
    </Cartao>
  );
}

function Simulador({ causas }: { causas: RespostaPerguntas["causas"] }) {
  const [familia, setFamilia] = useState("");
  const [causaId, setCausaId] = useState("");
  const [lista, setLista] = useState<
    { chave: string; texto: string; obrigatoria: boolean }[] | null
  >(null);
  const [erro, setErro] = useState<string | null>(null);

  async function simular() {
    setErro(null);
    const r = await chamarAdminIa("/perguntas/simular", "POST", {
      ...(familia.trim() ? { familia: familia.trim() } : {}),
      ...(causaId ? { causaId } : {}),
    });
    if (r.ok) setLista(r.dados.perguntas as typeof lista);
    else setErro(mensagemAdminIa(r));
  }

  return (
    <Cartao>
      <h3 className="ficha__subtitulo">Simulador</h3>
      <p className="pagina__apoio">
        Escolha um produto e uma causa e veja quais perguntas apareceriam, em
        ordem, sem esperar uma reclamação real.
      </p>
      <div className="ia-admin__linha">
        <div className="ia-admin__campo">
          <label htmlFor="sim-fam">Família do produto</label>
          <input
            id="sim-fam"
            value={familia}
            placeholder="FRITADEIRA"
            onChange={(e) => setFamilia(e.target.value)}
          />
        </div>
        <div className="ia-admin__campo">
          <label htmlFor="sim-causa">Causa</label>
          <select
            id="sim-causa"
            value={causaId}
            onChange={(e) => setCausaId(e.target.value)}
          >
            <option value="">Ainda sem causa</option>
            {causas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        <Botao variante="secundario" onClick={simular}>
          Ver perguntas
        </Botao>
      </div>
      {erro && (
        <p className="aviso aviso--erro" role="alert">
          {erro}
        </p>
      )}
      {lista && (
        <ol aria-live="polite">
          {lista.length === 0 && (
            <li>Nenhuma pergunta para esta combinação.</li>
          )}
          {lista.map((q) => (
            <li key={q.chave}>
              {q.texto} {!q.obrigatoria && <em>(opcional)</em>}
            </li>
          ))}
        </ol>
      )}
    </Cartao>
  );
}

export function PerguntasPainel({ inicial }: { inicial: RespostaPerguntas }) {
  const [dados, setDados] = useState(inicial);
  const [edicao, setEdicao] = useState<{
    p: PerguntaAdmin;
    novo: boolean;
  } | null>(null);

  async function recarregar() {
    const r = await chamarAdminIa("/perguntas", "GET");
    if (r.ok) setDados(r.dados as unknown as RespostaPerguntas);
  }

  const categorias = [...new Set(dados.perguntas.map((p) => p.categoria))];

  return (
    <>
      <Cartao>
        <h2 className="ficha__subtitulo">Perguntas obrigatórias</h2>
        <p className="pagina__apoio">
          Perguntas marcadas "padrão" são o exemplo de teste inicial: valide com
          o dono antes de depender delas.
        </p>
        {categorias.map((c) => (
          <div key={c}>
            <p className="ia-bloco__grupo">
              {ROTULO_CATEGORIA[c] ?? (c || "Sem categoria")}
            </p>
            <ul className="ia-admin__lista">
              {dados.perguntas
                .filter((p) => p.categoria === c)
                .map((p) => (
                  <li key={p.id} className="ia-admin__item">
                    <span>
                      <strong>{p.texto}</strong>
                      <br />
                      <span className="pagina__apoio">
                        {p.regras.map(resumoRegra).join("  ·  ") || "sem regra"}
                      </span>
                    </span>
                    {p.padrao && <Selo tom="atencao">Padrão</Selo>}
                    {!p.ativa && <Selo tom="info">Desligada</Selo>}
                    {!p.obrigatoria && <Selo tom="info">Opcional</Selo>}
                    <Botao
                      variante="secundario"
                      onClick={() => setEdicao({ p, novo: false })}
                    >
                      Editar
                    </Botao>
                  </li>
                ))}
            </ul>
          </div>
        ))}
        <div className="ia-decisao__botoes">
          <Botao onClick={() => setEdicao({ p: NOVA, novo: true })}>
            Nova pergunta
          </Botao>
        </div>
      </Cartao>
      {edicao && (
        <Editor
          key={edicao.p.chave || "nova"}
          inicial={edicao.p}
          novo={edicao.novo}
          fechar={() => setEdicao(null)}
          salvo={recarregar}
        />
      )}
      <Simulador causas={dados.causas} />
    </>
  );
}
