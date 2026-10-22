"use client";

import { useState } from "react";
import { Botao, Cartao, Selo } from "@/components/ui";
import {
  ESTADO_SELO,
  FILA_SELO,
  type FilaClickup,
  formatarQuando,
  type Integracao,
  mensagemIntegracao,
  montarEntrada,
  oQueFalta,
  type PainelIntegracoes,
  proximaTentativa,
  type RascunhoIntegracao,
  rascunhoInicial,
  SITUACOES,
} from "@/lib/integracoes";

type Aviso = { tom: "ok" | "erro" | "info"; texto: string };

async function chamar(
  caminho: string,
  metodo: "GET" | "PUT" | "POST",
  corpo?: unknown,
): Promise<{ ok: boolean; status: number; dados: Record<string, unknown> }> {
  const r = await fetch(`/api/admin/integracoes${caminho}`, {
    method: metodo,
    headers: corpo ? { "Content-Type": "application/json" } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const dados = ((await r.json().catch(() => null)) ?? {}) as Record<
    string,
    unknown
  >;
  return { ok: r.ok, status: r.status, dados };
}

function CartaoIntegracao({
  inicial,
  gravacaoLiberada,
  recarregar,
}: {
  inicial: Integracao;
  gravacaoLiberada: boolean;
  recarregar: () => Promise<Integracao | null>;
}) {
  const [integracao, setIntegracao] = useState(inicial);
  const [rascunho, setRascunho] = useState<RascunhoIntegracao>(() =>
    rascunhoInicial(inicial),
  );
  const [ocupado, setOcupado] = useState<"salvar" | "testar" | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  const selo = ESTADO_SELO[integracao.estado];
  const idBase = `int-${integracao.chave}`;

  function campo(nome: string, valor: string) {
    setRascunho((r) => ({ ...r, campos: { ...r.campos, [nome]: valor } }));
  }

  async function atualizar(): Promise<void> {
    const nova = await recarregar();
    if (nova) {
      setIntegracao(nova);
      setRascunho(rascunhoInicial(nova));
    }
  }

  async function salvar() {
    if (ocupado) return;
    setOcupado("salvar");
    setAviso(null);
    try {
      const r = await chamar(
        `/${integracao.chave}`,
        "PUT",
        montarEntrada(integracao, rascunho),
      );
      if (!r.ok) {
        setAviso({
          tom: "erro",
          texto: mensagemIntegracao(
            r.status,
            typeof r.dados.message === "string" ? r.dados.message : undefined,
          ),
        });
        return;
      }
      await atualizar();
      setAviso({
        tom: "ok",
        texto: "Gravado. Use “Testar conexão” para conferir.",
      });
    } catch {
      setAviso({ tom: "erro", texto: "Não foi possível conectar." });
    } finally {
      setOcupado(null);
    }
  }

  async function testar() {
    if (ocupado) return;
    setOcupado("testar");
    setAviso(null);
    try {
      const r = await chamar(`/${integracao.chave}/testar`, "POST");
      if (!r.ok) {
        setAviso({
          tom: "erro",
          texto: mensagemIntegracao(
            r.status,
            typeof r.dados.message === "string" ? r.dados.message : undefined,
          ),
        });
        return;
      }
      await atualizar();
      setAviso({
        tom: r.dados.ok === true ? "ok" : "erro",
        texto: String(r.dados.mensagem ?? ""),
      });
    } catch {
      setAviso({ tom: "erro", texto: "Não foi possível conectar." });
    } finally {
      setOcupado(null);
    }
  }

  return (
    <Cartao className="integracao">
      <section aria-labelledby={`${idBase}-titulo`}>
        <header className="integracao__cab">
          <div>
            <h2 className="integracao__titulo" id={`${idBase}-titulo`}>
              {integracao.nome}
            </h2>
            <p className="integracao__resumo">{integracao.resumo}</p>
          </div>
          <div className="integracao__estado">
            <Selo tom={selo.tom}>{selo.rotulo}</Selo>
            <span className="integracao__quando">
              {formatarQuando(integracao.testadoEm)}
            </span>
          </div>
        </header>

        {integracao.estado === "erro" && integracao.ultimoErro && (
          <p className="aviso aviso--erro" role="alert">
            {integracao.ultimoErro}
          </p>
        )}

        <details className="integracao__passos">
          <summary>Como configurar</summary>
          <ol>
            {integracao.passos.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ol>
        </details>

        <div className="integracao__campos">
          {integracao.campos.map((c) => (
            <div className="campo" key={c.nome}>
              <label className="campo__rotulo" htmlFor={`${idBase}-${c.nome}`}>
                {c.rotulo}
              </label>
              <div className="campo__entrada">
                <input
                  id={`${idBase}-${c.nome}`}
                  type={c.tipo === "segredo" ? "password" : "text"}
                  autoComplete="off"
                  spellCheck={false}
                  value={rascunho.campos[c.nome] ?? ""}
                  placeholder={
                    c.tipo === "segredo" && c.preenchido
                      ? `${c.mascara} (deixe vazio para manter)`
                      : ""
                  }
                  onChange={(e) => campo(c.nome, e.target.value)}
                  disabled={!gravacaoLiberada}
                />
              </div>
              <span className="campo__ajuda">
                {c.tipo === "segredo" && c.preenchido
                  ? `Gravado: ${c.mascara}. ${c.ajuda}`
                  : c.ajuda}
              </span>
            </div>
          ))}
        </div>

        {integracao.clickup && (
          <>
            <h3 className="integracao__sub">Lista de cada setor</h3>
            <div className="integracao__campos">
              {integracao.clickup.setores.map((s) => (
                <div className="campo" key={s.id}>
                  <label
                    className="campo__rotulo"
                    htmlFor={`${idBase}-lista-${s.id}`}
                  >
                    {s.nome}
                  </label>
                  <div className="campo__entrada">
                    <input
                      id={`${idBase}-lista-${s.id}`}
                      type="text"
                      autoComplete="off"
                      spellCheck={false}
                      value={rascunho.listas[s.id] ?? ""}
                      placeholder="ID da lista"
                      onChange={(e) =>
                        setRascunho((r) => ({
                          ...r,
                          listas: { ...r.listas, [s.id]: e.target.value },
                        }))
                      }
                      disabled={!gravacaoLiberada}
                    />
                  </div>
                </div>
              ))}
            </div>

            <h3 className="integracao__sub">Status do ClickUp → situação</h3>
            <ul className="integracao__mapa">
              {rascunho.mapa.map((linha, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: linhas editáveis sem id próprio
                <li key={i} className="integracao__mapa-linha">
                  <div className="campo__entrada">
                    <input
                      type="text"
                      aria-label="Status no ClickUp"
                      placeholder="ex.: complete"
                      value={linha.status}
                      onChange={(e) =>
                        setRascunho((r) => ({
                          ...r,
                          mapa: r.mapa.map((l, j) =>
                            j === i ? { ...l, status: e.target.value } : l,
                          ),
                        }))
                      }
                      disabled={!gravacaoLiberada}
                    />
                  </div>
                  <div className="campo__entrada">
                    <select
                      aria-label="Situação no SAC"
                      value={linha.situacao}
                      onChange={(e) =>
                        setRascunho((r) => ({
                          ...r,
                          mapa: r.mapa.map((l, j) =>
                            j === i ? { ...l, situacao: e.target.value } : l,
                          ),
                        }))
                      }
                      disabled={!gravacaoLiberada}
                    >
                      {SITUACOES.map((s) => (
                        <option key={s.valor} value={s.valor}>
                          {s.rotulo}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Botao
                    variante="secundario"
                    onClick={() =>
                      setRascunho((r) => ({
                        ...r,
                        mapa: r.mapa.filter((_, j) => j !== i),
                      }))
                    }
                    disabled={!gravacaoLiberada}
                    aria-label={`Remover o status ${linha.status || "da linha"}`}
                  >
                    Remover
                  </Botao>
                </li>
              ))}
            </ul>
            <div>
              <Botao
                variante="secundario"
                onClick={() =>
                  setRascunho((r) => ({
                    ...r,
                    mapa: [...r.mapa, { status: "", situacao: "tratativa" }],
                  }))
                }
                disabled={!gravacaoLiberada}
              >
                Adicionar status
              </Botao>
            </div>
          </>
        )}

        {aviso && (
          <p
            className={`aviso aviso--${aviso.tom}`}
            role={aviso.tom === "erro" ? "alert" : "status"}
          >
            {aviso.texto}
          </p>
        )}

        <div className="integracao__acoes">
          <Botao
            onClick={salvar}
            disabled={!gravacaoLiberada || ocupado !== null}
          >
            {ocupado === "salvar" ? "Gravando…" : "Gravar"}
          </Botao>
          <Botao
            variante="secundario"
            onClick={testar}
            disabled={ocupado !== null}
          >
            {ocupado === "testar" ? "Testando…" : "Testar conexão"}
          </Botao>
        </div>
      </section>
    </Cartao>
  );
}

function FilaDoClickup({ inicial }: { inicial: FilaClickup }) {
  const [fila, setFila] = useState(inicial);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  async function atualizar() {
    const r = await chamar("/clickup/fila", "GET");
    if (r.ok) setFila(r.dados as unknown as FilaClickup);
    return r.ok;
  }

  async function tentarDeNovo(cardId: string | null) {
    setOcupado(cardId ?? "todos");
    setAviso(null);
    const r = await chamar(
      "/clickup/fila/reenviar",
      "POST",
      cardId ? { cardId } : {},
    );
    if (!r.ok) {
      setAviso({
        tom: "erro",
        texto: mensagemIntegracao(r.status, String(r.dados.message ?? "")),
      });
    } else {
      // Dá um instante para a fila processar antes de reler.
      await new Promise((ok) => setTimeout(ok, 1500));
      await atualizar();
      setAviso({ tom: "ok", texto: "Enviado de novo à fila." });
    }
    setOcupado(null);
  }

  const { pendente, erro, esgotado } = fila.totais;
  return (
    <Cartao>
      <section className="integracao" aria-labelledby="fila-clickup">
        <div className="integracao__cab">
          <div>
            <h2 className="integracao__titulo" id="fila-clickup">
              Fila de envio ao ClickUp
            </h2>
            <p className="integracao__resumo">
              Cards a criar ou atualizar e comentários a postar. Quem falha
              tenta de novo sozinho, com espera crescente; ao esgotar, fica aqui
              até alguém mandar tentar de novo.
            </p>
          </div>
          <div className="integracao__estado">
            <Selo tom="info">{pendente} pendentes</Selo>
            <Selo tom="atencao">{erro} com erro</Selo>
            <Selo tom="perigo">{esgotado} esgotados</Selo>
          </div>
        </div>

        {fila.itens.length === 0 ? (
          <p className="aviso aviso--info" role="status">
            Nada na fila: tudo o que mudou no SAC já está no ClickUp.
          </p>
        ) : (
          <ul className="fila-clickup">
            {fila.itens.map((i) => {
              const selo = FILA_SELO[i.estado];
              return (
                <li className="fila-clickup__item" key={i.cardId}>
                  <div className="fila-clickup__topo">
                    <strong>{i.titulo}</strong>
                    <Selo tom={selo.tom}>{selo.rotulo}</Selo>
                  </div>
                  <span className="campo__ajuda">
                    Falta {oQueFalta(i)} · {i.tentativas} tentativa(s) ·
                    próxima: {proximaTentativa(i)}
                  </span>
                  {i.ultimoErro && (
                    <span className="fila-clickup__erro">{i.ultimoErro}</span>
                  )}
                  {i.ultimoErro && (
                    <Botao
                      variante="secundario"
                      onClick={() => tentarDeNovo(i.cardId)}
                      disabled={ocupado !== null}
                    >
                      {ocupado === i.cardId ? "Enviando…" : "Tentar de novo"}
                    </Botao>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {aviso && (
          <p
            className={`aviso aviso--${aviso.tom}`}
            role={aviso.tom === "erro" ? "alert" : "status"}
          >
            {aviso.texto}
          </p>
        )}

        <div className="integracao__acoes">
          <Botao
            onClick={() => tentarDeNovo(null)}
            disabled={ocupado !== null || erro + esgotado === 0}
          >
            {ocupado === "todos" ? "Enviando…" : "Tentar de novo (todos)"}
          </Botao>
          <Botao
            variante="secundario"
            onClick={atualizar}
            disabled={ocupado !== null}
          >
            Atualizar lista
          </Botao>
        </div>
      </section>
    </Cartao>
  );
}

export function Painel({
  inicial,
  fila,
}: {
  inicial: PainelIntegracoes;
  fila: FilaClickup | null;
}) {
  const [liberada, setLiberada] = useState(inicial.gravacaoLiberada);

  async function recarregar(chave: Integracao["chave"]) {
    const r = await chamar("", "GET");
    if (!r.ok) return null;
    const painel = r.dados as unknown as PainelIntegracoes;
    setLiberada(painel.gravacaoLiberada);
    return painel.integracoes.find((i) => i.chave === chave) ?? null;
  }

  return (
    <div className="integracoes">
      {!liberada && (
        <p className="aviso aviso--info" role="status">
          A variável <code>INTEGRACOES_CHAVE</code> não está definida no
          servidor, então nada pode ser gravado. Defina uma chave de 32 bytes em
          base64 (por exemplo, a saída de <code>openssl rand -base64 32</code>)
          nas variáveis do serviço da API e reinicie.
        </p>
      )}
      {inicial.integracoes.map((i) => (
        <CartaoIntegracao
          key={i.chave}
          inicial={i}
          gravacaoLiberada={liberada}
          recarregar={() => recarregar(i.chave)}
        />
      ))}
      {fila && <FilaDoClickup inicial={fila} />}
    </div>
  );
}
