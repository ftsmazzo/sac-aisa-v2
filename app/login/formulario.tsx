"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";
import { Botao } from "@/components/ui";
import { MENSAGEM_SEM_CONEXAO, mensagemLogin } from "@/lib/login";

export function Formulario() {
  const router = useRouter();
  const idLogin = useId();
  const idSenha = useId();
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (enviando) return;
    setErro(null);
    setEnviando(true);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, senha }),
      });
      if (r.ok) {
        router.replace("/");
        router.refresh();
        return;
      }
      setSenha("");
      setErro(mensagemLogin(r.status, r.headers.get("Retry-After")));
    } catch {
      setErro(MENSAGEM_SEM_CONEXAO);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="login__form" onSubmit={enviar} noValidate>
      <div className="campo">
        <label className="campo__rotulo" htmlFor={idLogin}>
          Usuário
        </label>
        <div className="campo__entrada">
          <input
            id={idLogin}
            name="login"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={login}
            onChange={(e) => setLogin(e.target.value)}
          />
        </div>
      </div>

      <div className="campo">
        <label className="campo__rotulo" htmlFor={idSenha}>
          Senha
        </label>
        <div className="campo__entrada">
          <input
            id={idSenha}
            name="senha"
            type={verSenha ? "text" : "password"}
            autoComplete="current-password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
          <button
            type="button"
            className="campo__acao"
            aria-pressed={verSenha}
            onClick={() => setVerSenha((v) => !v)}
          >
            {verSenha ? "Ocultar" : "Mostrar"}
          </button>
        </div>
      </div>

      {erro && (
        <p className="aviso aviso--erro" role="alert">
          {erro}
        </p>
      )}

      <Botao type="submit" cheio disabled={enviando || !login || !senha}>
        {enviando ? "Entrando…" : "Entrar"}
      </Botao>
    </form>
  );
}
