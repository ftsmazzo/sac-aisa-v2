import { describe, expect, it } from "vitest";
import { MENSAGEM_SEM_CONEXAO, mensagemLogin } from "../lib/login";

describe("mensagem de login", () => {
  it("usa a mesma frase para qualquer falha de credencial", () => {
    expect(mensagemLogin(401)).toBe("Usuário ou senha inválidos.");
  });

  it("pede para informar os dois campos quando o corpo é inválido", () => {
    expect(mensagemLogin(400)).toBe("Informe usuário e senha.");
  });

  it("avisa do bloqueio e converte os segundos em minutos", () => {
    expect(mensagemLogin(429, "60")).toBe(
      "Muitas tentativas. Tente de novo em 1 minuto.",
    );
    expect(mensagemLogin(429, "890")).toBe(
      "Muitas tentativas. Tente de novo em 15 minutos.",
    );
  });

  it("sem tempo informado, o aviso continua útil", () => {
    expect(mensagemLogin(429)).toBe(
      "Muitas tentativas. Tente de novo em alguns minutos.",
    );
    expect(mensagemLogin(429, "abc")).toContain("alguns minutos");
  });

  it("explica origem recusada e erro do servidor sem expor detalhe", () => {
    expect(mensagemLogin(403)).toContain("não permitido");
    expect(mensagemLogin(500)).toBe(
      "Não foi possível entrar agora. Tente de novo em instantes.",
    );
    expect(mensagemLogin(502)).toBe(mensagemLogin(500));
  });

  it("tem mensagem própria para falta de conexão", () => {
    expect(MENSAGEM_SEM_CONEXAO).toContain("conectar");
  });
});
