import { createHash, randomBytes } from "node:crypto";
import { argon2id, argon2Verify } from "hash-wasm";

/** Parâmetros do Argon2id (recomendação OWASP: 19 MiB, 2 passadas, 1 thread). */
const ARGON2 = {
  parallelism: 1,
  iterations: 2,
  memorySize: 19456,
  hashLength: 32,
} as const;

export async function hashSenha(senha: string): Promise<string> {
  return argon2id({
    password: senha,
    salt: randomBytes(16),
    ...ARGON2,
    outputType: "encoded",
  });
}

export async function verificarSenha(
  senha: string,
  hash: string,
): Promise<boolean> {
  try {
    return await argon2Verify({ password: senha, hash });
  } catch {
    return false;
  }
}

export const SENHA_MIN = 10;
export const SENHA_MAX = 128;

/** Devolve a mensagem de erro, ou null quando a senha serve. */
export function validarSenhaNova(senha: string, login: string): string | null {
  if (senha.length < SENHA_MIN) {
    return `A senha precisa ter ao menos ${SENHA_MIN} caracteres.`;
  }
  if (senha.length > SENHA_MAX) {
    return `A senha pode ter no máximo ${SENHA_MAX} caracteres.`;
  }
  if (/^\d+$/.test(senha)) return "A senha não pode ser só números.";
  if (senha.toLowerCase().includes(login.trim().toLowerCase())) {
    return "A senha não pode conter o nome de usuário.";
  }
  return null;
}

export const COOKIE_SESSAO = "sac_sessao";
export const SESSAO_DURACAO_MS = 12 * 60 * 60 * 1000;

/** Token que vai no cookie. O banco guarda só o hash dele. */
export function novoToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Limite de tentativas de login por chave (IP e usuário), em janela deslizante. */
export class LimiteTentativas {
  private readonly falhas = new Map<string, number[]>();

  constructor(
    private readonly max = 5,
    private readonly janelaMs = 15 * 60 * 1000,
    private readonly agora: () => number = Date.now,
  ) {}

  private recentes(chave: string): number[] {
    const limite = this.agora() - this.janelaMs;
    const lista = (this.falhas.get(chave) ?? []).filter((t) => t > limite);
    if (lista.length) this.falhas.set(chave, lista);
    else this.falhas.delete(chave);
    return lista;
  }

  /** Segundos até poder tentar de novo, ou null quando não está bloqueado. */
  segundosBloqueado(chave: string): number | null {
    const lista = this.recentes(chave);
    if (lista.length < this.max) return null;
    const libera = lista[0] + this.janelaMs;
    return Math.max(1, Math.ceil((libera - this.agora()) / 1000));
  }

  registrarFalha(chave: string): void {
    const lista = this.recentes(chave);
    lista.push(this.agora());
    this.falhas.set(chave, lista);
  }

  limpar(chave: string): void {
    this.falhas.delete(chave);
  }
}
