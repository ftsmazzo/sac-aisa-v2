"use client";

import { useState } from "react";
import { Botao, Cartao, Selo } from "@/components/ui";
import {
  ERRO_SEM_LISTA,
  ESTADO_SELO,
  FILA_SELO,
  type FilaClickup,
  formatarQuando,
  type Integracao,
  type ListaEmUso,
  mensagemIntegracao,
  montarEntrada,
  oQueFalta,
  type PainelIntegracoes,
  proximaTentativa,
  type RascunhoIntegracao,
  rascunhoInicial,
  textoDaFilaSemLista,
} from "@/lib/integracoes";
import { ESTADOS, ROTULO_ESTADO } from "@/lib/reclamacoes-formato";
import { AssistenteClickup } from "./assistente";

type Aviso = { tom: "ok" | "erro" | "info"; texto: string };

async function chamar(
  caminho: string,
  metodo: "GET" | "PUT" | "POST" | "DELETE",
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

function Escolha({
  id,
  valor,
  vazio,
  opcoes,
  disabled,
  onChange,
}: {
  id: string;
  valor: string;
  vazio: string;
  opcoes: { id: string; rotulo: string }[];
  disabled: boolean;
  onChange: (valor: string) => void;
}) {
  const extra =
    valor && !opcoes.some((o) => o.id === valor)
      ? [{ id: valor, rotulo: `${valor} (já gravado)` }]
      : [];
  return (
    <select
      id={id}
      value={valor}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{vazio}</option>
      {[...extra, ...opcoes].map((o) => (
        <option key={o.id} value={o.id}>
          {o.rotulo}
        </option>
      ))}
    </select>
  );
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
  const [aberto, setAberto] = useState(false);
  const [listasEmUso, setListasEmUso] = useState<ListaEmUso[]>([]);
  const [ocupado, setOcupado] = useState<
    "salvar" | "testar" | "excluir" | null
  >(null);
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

  async function excluir() {
    if (ocupado) return;
    const segue = window.confirm(
      `Excluir a conexão ${integracao.nome}? O token deixa de valer aqui. O que já existe no serviço de fora permanece.`,
    );
    if (!segue) return;
    setOcupado("excluir");
    setAviso(null);
    try {
      const r = await chamar(`/${integracao.chave}`, "DELETE");
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
      setListasEmUso([]);
      await atualizar();
      setAviso({ tom: "ok", texto: "Conexão excluída." });
    } catch {
      setAviso({ tom: "erro", texto: "Não foi possível conectar." });
    } finally {
      setOcupado(null);
    }
  }

  const listasEscolhidas = new Set(
    [
      ...Object.values(rascunho.listas),
      rascunho.campos.listaPadraoId ?? "",
    ].filter(Boolean),
  );
  const baseStatus =
    listasEscolhidas.size === 0
      ? listasEmUso
      : listasEmUso.filter((l) => listasEscolhidas.has(l.id));
  const statuses: string[] = [];
  for (const lista of baseStatus) {
    for (const nome of lista.statuses) {
      if (!statuses.some((s) => s.toLowerCase() === nome.toLowerCase())) {
        statuses.push(nome);
      }
    }
  }

  return (
    <Cartao className="integracao">
      <section aria-labelledby={`${idBase}-titulo`}>
        <h2 className="integracao__titulo" id={`${idBase}-titulo`}>
          <button
            type="button"
            className="integracao__abre"
            aria-expanded={aberto}
            aria-controls={`${idBase}-corpo`}
            onClick={() => setAberto((v) => !v)}
          >
            <span className="integracao__nome">
              <span>{integracao.nome}</span>
              {integracao.chave === "clickup" && (
                <span className="integracao__resumo">
                  Clique para desconectar, colar o token real e trazer as listas
                  que já existem
                </span>
              )}
            </span>
            <Selo tom={selo.tom}>{selo.rotulo}</Selo>
          </button>
        </h2>

        {aberto && (
          <div id={`${idBase}-corpo`} className="integracao__corpo">
            <p className="integracao__resumo">{integracao.resumo}</p>
            {integracao.testadoEm && (
              <p className="integracao__quando">
                Testada {formatarQuando(integracao.testadoEm)}
              </p>
            )}

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
                  <label
                    className="campo__rotulo"
                    htmlFor={`${idBase}-${c.nome}`}
                  >
                    {c.rotulo}
                  </label>
                  <div className="campo__entrada">
                    {c.nome === "listaPadraoId" && listasEmUso.length > 0 ? (
                      <Escolha
                        id={`${idBase}-${c.nome}`}
                        valor={rascunho.campos[c.nome] ?? ""}
                        vazio="Sem lista reserva"
                        opcoes={listasEmUso.map((l) => ({
                          id: l.id,
                          rotulo: `${l.space} · ${l.nome}`,
                        }))}
                        disabled={!gravacaoLiberada}
                        onChange={(valor) => campo(c.nome, valor)}
                      />
                    ) : (
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
                    )}
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
              <AssistenteClickup
                integracao={integracao}
                gravacaoLiberada={gravacaoLiberada}
                atualizar={atualizar}
                aoTrazer={(listas, workspaceId) => {
                  setListasEmUso(listas);
                  const ids = new Set(listas.map((l) => l.id));
                  setRascunho((r) => {
                    const proximas = { ...r.listas };
                    for (const s of integracao.clickup?.setores ?? []) {
                      const atual = proximas[s.id] ?? "";
                      if (atual && ids.has(atual)) continue;
                      const achou = listas.find(
                        (l) =>
                          l.nome.trim().toLowerCase() ===
                          s.nome.trim().toLowerCase(),
                      );
                      proximas[s.id] = achou?.id ?? "";
                    }
                    return {
                      ...r,
                      listas: proximas,
                      campos: { ...r.campos, workspaceId },
                    };
                  });
                }}
              />
            )}

            {integracao.clickup && (
              <>
                <h3 className="integracao__sub">Lista de cada setor</h3>
                <p className="campo__ajuda">
                  {listasEmUso.length > 0
                    ? "Estas são as listas que já existem no ClickUp. Escolha a do setor e grave."
                    : "Traga as listas do ClickUp em uso. Enquanto isso, o envio fica parado."}
                </p>
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
                        {listasEmUso.length > 0 ? (
                          <Escolha
                            id={`${idBase}-lista-${s.id}`}
                            valor={rascunho.listas[s.id] ?? ""}
                            vazio="Sem lista"
                            opcoes={listasEmUso.map((l) => ({
                              id: l.id,
                              rotulo: `${l.space} · ${l.nome}`,
                            }))}
                            disabled={!gravacaoLiberada}
                            onChange={(valor) =>
                              setRascunho((r) => ({
                                ...r,
                                listas: { ...r.listas, [s.id]: valor },
                              }))
                            }
                          />
                        ) : (
                          <input
                            id={`${idBase}-lista-${s.id}`}
                            type="text"
                            autoComplete="off"
                            spellCheck={false}
                            value={rascunho.listas[s.id] ?? ""}
                            placeholder="Traga as listas primeiro"
                            readOnly
                            disabled={!gravacaoLiberada}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <h3 className="integracao__sub">Estado → status do ClickUp</h3>
                <p className="campo__ajuda">
                  Os status precisam existir na lista do ClickUp. O setor só
                  move o card entre Recebida, Em tratativa e Resolvida no setor
                  técnico; “Complete” no ClickUp vale como Resolvida no setor
                  técnico, nunca como Finalizada. Mover o card para um estado do
                  SAC é recusado e o card volta. Vazio usa o padrão.
                </p>
                <div className="integracao__campos">
                  {ESTADOS.map((e) => (
                    <div className="campo" key={e}>
                      <label
                        className="campo__rotulo"
                        htmlFor={`${idBase}-estado-${e}`}
                      >
                        {ROTULO_ESTADO[e]}
                      </label>
                      <div className="campo__entrada">
                        {statuses.length > 0 ? (
                          <Escolha
                            id={`${idBase}-estado-${e}`}
                            valor={rascunho.estados[e] ?? ""}
                            vazio={`Padrão: ${integracao.clickup?.padraoEstados?.[e] ?? ""}`}
                            opcoes={statuses.map((nome) => ({
                              id: nome,
                              rotulo: nome,
                            }))}
                            disabled={!gravacaoLiberada}
                            onChange={(valor) =>
                              setRascunho((r) => ({
                                ...r,
                                estados: { ...r.estados, [e]: valor },
                              }))
                            }
                          />
                        ) : (
                          <input
                            id={`${idBase}-estado-${e}`}
                            type="text"
                            autoComplete="off"
                            spellCheck={false}
                            value={rascunho.estados[e] ?? ""}
                            placeholder={
                              integracao.clickup?.padraoEstados?.[e] ?? ""
                            }
                            onChange={(ev) =>
                              setRascunho((r) => ({
                                ...r,
                                estados: { ...r.estados, [e]: ev.target.value },
                              }))
                            }
                            disabled={!gravacaoLiberada}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <h3 className="integracao__sub">Reclamações de treino</h3>
                <label className="campo__rotulo" htmlFor={`${idBase}-treino`}>
                  <input
                    id={`${idBase}-treino`}
                    type="checkbox"
                    checked={rascunho.criarCardsTreino}
                    onChange={(ev) =>
                      setRascunho((r) => ({
                        ...r,
                        criarCardsTreino: ev.target.checked,
                      }))
                    }
                    disabled={!gravacaoLiberada}
                  />{" "}
                  Criar cards para reclamações de treino
                </label>
                <p className="campo__ajuda">
                  Desligado por padrão: o modo treino não toca no ClickUp.
                  Ligado, as reclamações fictícias de treino viram cards reais
                  no ClickUp configurado aqui e vão aparecer lá.
                </p>
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
              <Botao
                variante="secundario"
                className="integracao__excluir"
                onClick={excluir}
                disabled={!gravacaoLiberada || ocupado !== null}
              >
                {ocupado === "excluir" ? "Excluindo…" : "Excluir conexão"}
              </Botao>
            </div>
          </div>
        )}
        {!aberto && aviso && (
          <p
            className={`aviso aviso--${aviso.tom}`}
            role={aviso.tom === "erro" ? "alert" : "status"}
          >
            {aviso.texto}
          </p>
        )}
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
              até alguém mandar tentar de novo. Reclamação ainda na triagem, ou
              aguardando o cliente, não entra nesta fila.
            </p>
          </div>
          <div className="integracao__estado">
            <Selo tom="info">{pendente} pendentes</Selo>
            <Selo tom="atencao">{erro} com erro</Selo>
            <Selo tom="perigo">{esgotado} esgotados</Selo>
          </div>
        </div>

        {fila.itens.some((i) => i.ultimoErro === ERRO_SEM_LISTA) && (
          <p className="aviso aviso--atencao" role="status">
            {textoDaFilaSemLista(fila.itens)}
          </p>
        )}

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
                  {i.ultimoErro === ERRO_SEM_LISTA ? (
                    <span className="fila-clickup__erro">
                      {i.setorNome
                        ? `Falta gravar a lista do setor ${i.setorNome}.`
                        : "Esta reclamação não tem setor responsável."}
                    </span>
                  ) : (
                    i.ultimoErro && (
                      <span className="fila-clickup__erro">{i.ultimoErro}</span>
                    )
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
