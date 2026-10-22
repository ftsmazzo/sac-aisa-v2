"use client";

import { useState } from "react";
import { Botao, Cartao, Selo } from "@/components/ui";
import {
  mensagemUsuarios,
  montarCorpo,
  type PainelUsuarios,
  type RascunhoUsuario,
  rascunhoDe,
  rascunhoNovo,
  type UsuarioAdmin,
  usaSetoresEMarcas,
  validarRascunho,
} from "@/lib/usuarios";
import "./usuarios.css";

type Aviso = { tom: "ok" | "erro"; texto: string };

async function chamar(
  caminho: string,
  metodo: "GET" | "POST" | "PATCH",
  corpo?: unknown,
): Promise<{ ok: boolean; status: number; dados: Record<string, unknown> }> {
  const r = await fetch(`/api/admin/usuarios${caminho}`, {
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

function alternar(lista: string[], id: string, marcado: boolean): string[] {
  const sem = lista.filter((x) => x !== id);
  return marcado ? [...sem, id] : sem;
}

function Caixas({
  legenda,
  dica,
  itens,
  marcados,
  aoMudar,
}: {
  legenda: string;
  dica: string;
  itens: { id: string; nome: string }[];
  marcados: string[];
  aoMudar: (ids: string[]) => void;
}) {
  return (
    <fieldset className="usuario__caixas">
      <legend className="campo__rotulo">{legenda}</legend>
      <div className="usuario__caixas-lista">
        {itens.map((i) => (
          <label key={i.id} className="usuario__caixa">
            <input
              type="checkbox"
              checked={marcados.includes(i.id)}
              onChange={(e) =>
                aoMudar(alternar(marcados, i.id, e.target.checked))
              }
            />
            <span>{i.nome}</span>
          </label>
        ))}
      </div>
      <span className="campo__ajuda">{dica}</span>
    </fieldset>
  );
}

function Formulario({
  modo,
  inicial,
  opcoes,
  ocupado,
  aviso,
  aoSalvar,
  aoCancelar,
}: {
  modo: "criar" | "editar";
  inicial: RascunhoUsuario;
  opcoes: PainelUsuarios["opcoes"];
  ocupado: boolean;
  aviso: Aviso | null;
  aoSalvar: (r: RascunhoUsuario) => void;
  aoCancelar: () => void;
}) {
  const [r, setR] = useState(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const resp = usaSetoresEMarcas(r.perfil);
  const id = `usr-${modo}-${inicial.login || "novo"}`;

  return (
    <form
      className="usuario__form"
      onSubmit={(e) => {
        e.preventDefault();
        const msg = validarRascunho(r, modo);
        setErro(msg);
        if (!msg) aoSalvar(r);
      }}
    >
      <div className="usuario__grade">
        <div className="campo">
          <label className="campo__rotulo" htmlFor={`${id}-login`}>
            Login
          </label>
          <div className="campo__entrada">
            <input
              id={`${id}-login`}
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={r.login}
              onChange={(e) => setR({ ...r, login: e.target.value })}
              disabled={modo === "editar" || ocupado}
            />
          </div>
          {modo === "editar" && (
            <span className="campo__ajuda">
              O login não muda depois de criado.
            </span>
          )}
        </div>
        <div className="campo">
          <label className="campo__rotulo" htmlFor={`${id}-nome`}>
            Nome
          </label>
          <div className="campo__entrada">
            <input
              id={`${id}-nome`}
              type="text"
              maxLength={120}
              value={r.nome}
              onChange={(e) => setR({ ...r, nome: e.target.value })}
              disabled={ocupado}
            />
          </div>
        </div>
        <div className="campo">
          <label className="campo__rotulo" htmlFor={`${id}-perfil`}>
            Perfil
          </label>
          <div className="campo__entrada">
            <select
              id={`${id}-perfil`}
              value={r.perfil}
              onChange={(e) =>
                setR({
                  ...r,
                  perfil: e.target.value as RascunhoUsuario["perfil"],
                })
              }
              disabled={ocupado}
            >
              {opcoes.perfis.map((p) => (
                <option key={p.valor} value={p.valor}>
                  {p.rotulo}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="campo">
          <label className="campo__rotulo" htmlFor={`${id}-tel`}>
            Telefone (opcional)
          </label>
          <div className="campo__entrada">
            <input
              id={`${id}-tel`}
              type="tel"
              autoComplete="off"
              value={r.telefone}
              onChange={(e) => setR({ ...r, telefone: e.target.value })}
              disabled={ocupado}
            />
          </div>
        </div>
        <div className="campo">
          <label className="campo__rotulo" htmlFor={`${id}-senha`}>
            {modo === "criar" ? "Senha" : "Nova senha (opcional)"}
          </label>
          <div className="campo__entrada">
            <input
              id={`${id}-senha`}
              type="password"
              autoComplete="new-password"
              value={r.senha}
              onChange={(e) => setR({ ...r, senha: e.target.value })}
              disabled={ocupado}
            />
          </div>
          <span className="campo__ajuda">
            {modo === "criar"
              ? "Senha inicial do usuário."
              : "Deixe vazio para manter a senha atual."}
          </span>
        </div>
        {modo === "editar" && (
          <label className="usuario__caixa usuario__ativo">
            <input
              type="checkbox"
              checked={r.ativo}
              onChange={(e) => setR({ ...r, ativo: e.target.checked })}
              disabled={ocupado}
            />
            <span>Ativo (pode entrar no sistema)</span>
          </label>
        )}
      </div>

      <Caixas
        legenda="Setores"
        dica="Só tem efeito para o responsável de setor, que precisa de ao menos um."
        itens={opcoes.setores}
        marcados={r.setorIds}
        aoMudar={(ids) => setR({ ...r, setorIds: ids })}
      />
      <Caixas
        legenda="Marcas"
        dica="Vazio = todas as marcas. Só vale para responsável de setor; SAC, gestor e administrador veem tudo."
        itens={opcoes.marcas}
        marcados={r.marcaIds}
        aoMudar={(ids) => setR({ ...r, marcaIds: ids })}
      />
      {!resp && (r.setorIds.length > 0 || r.marcaIds.length > 0) && (
        <p className="aviso aviso--info" role="status">
          Setores e marcas não serão gravados para este perfil.
        </p>
      )}

      {(erro || aviso) && (
        <p
          className={`aviso aviso--${erro ? "erro" : aviso?.tom}`}
          role={erro || aviso?.tom === "erro" ? "alert" : "status"}
        >
          {erro ?? aviso?.texto}
        </p>
      )}

      <div className="usuario__acoes">
        <Botao type="submit" disabled={ocupado}>
          {ocupado
            ? "Gravando…"
            : modo === "criar"
              ? "Criar usuário"
              : "Gravar"}
        </Botao>
        <Botao variante="secundario" onClick={aoCancelar} disabled={ocupado}>
          Cancelar
        </Botao>
      </div>
    </form>
  );
}

export function Painel({ inicial }: { inicial: PainelUsuarios }) {
  const [usuarios, setUsuarios] = useState(inicial.usuarios);
  const [editando, setEditando] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [recado, setRecado] = useState<string | null>(null);

  async function recarregar() {
    const r = await chamar("", "GET");
    if (r.ok) setUsuarios((r.dados as unknown as PainelUsuarios).usuarios);
  }

  async function salvar(u: UsuarioAdmin | null, r: RascunhoUsuario) {
    if (ocupado) return;
    setOcupado(true);
    setAviso(null);
    try {
      const resp = await chamar(
        u ? `/${encodeURIComponent(u.id)}` : "",
        u ? "PATCH" : "POST",
        montarCorpo(r, u ? "editar" : "criar"),
      );
      if (!resp.ok) {
        setAviso({
          tom: "erro",
          texto: mensagemUsuarios(
            resp.status,
            typeof resp.dados.message === "string"
              ? resp.dados.message
              : undefined,
          ),
        });
        return;
      }
      await recarregar();
      setEditando(null);
      setRecado(u ? "Usuário atualizado." : "Usuário criado.");
    } catch {
      setAviso({ tom: "erro", texto: "Não foi possível conectar." });
    } finally {
      setOcupado(false);
    }
  }

  function abrir(qual: string | null) {
    setAviso(null);
    setRecado(null);
    setEditando(qual);
  }

  return (
    <div className="usuarios">
      <div>
        <Botao onClick={() => abrir("novo")} disabled={editando === "novo"}>
          Novo usuário
        </Botao>
      </div>

      {recado && (
        <p className="aviso aviso--ok" role="status">
          {recado}
        </p>
      )}

      {editando === "novo" && (
        <Cartao className="usuario">
          <h2 className="usuario__titulo">Novo usuário</h2>
          <Formulario
            modo="criar"
            inicial={rascunhoNovo()}
            opcoes={inicial.opcoes}
            ocupado={ocupado}
            aviso={aviso}
            aoSalvar={(r) => salvar(null, r)}
            aoCancelar={() => abrir(null)}
          />
        </Cartao>
      )}

      {usuarios.map((u) => (
        <Cartao key={u.id} className="usuario">
          <header className="usuario__cab">
            <div>
              <h2 className="usuario__titulo">{u.nome}</h2>
              <p className="usuario__login">{u.login}</p>
            </div>
            <div className="usuario__selos">
              <Selo>
                {inicial.opcoes.perfis.find((p) => p.valor === u.perfil)
                  ?.rotulo ?? u.perfil}
              </Selo>
              <Selo tom={u.ativo ? "ok" : "perigo"}>
                {u.ativo ? "Ativo" : "Inativo"}
              </Selo>
            </div>
          </header>
          {editando !== u.id ? (
            <>
              <dl className="usuario__resumo">
                <div>
                  <dt>Setores</dt>
                  <dd>{u.setores.map((s) => s.nome).join(", ") || "—"}</dd>
                </div>
                <div>
                  <dt>Marcas</dt>
                  <dd>
                    {u.perfil === "responsavel_setor"
                      ? u.marcas.map((m) => m.nome).join(", ") || "Todas"
                      : "Todas"}
                  </dd>
                </div>
              </dl>
              <div>
                <Botao
                  variante="secundario"
                  onClick={() => abrir(u.id)}
                  aria-label={`Editar ${u.nome}`}
                >
                  Editar
                </Botao>
              </div>
            </>
          ) : (
            <Formulario
              modo="editar"
              inicial={rascunhoDe(u)}
              opcoes={inicial.opcoes}
              ocupado={ocupado}
              aviso={aviso}
              aoSalvar={(r) => salvar(u, r)}
              aoCancelar={() => abrir(null)}
            />
          )}
        </Cartao>
      ))}
    </div>
  );
}
