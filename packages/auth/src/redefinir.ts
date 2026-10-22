import { hashSenha, validarSenhaNova } from "./seguranca";

/** Acesso mínimo ao banco. Prisma e PGlite se encaixam aqui. */
export interface AcessoBanco {
  consultar(sql: string, params: unknown[]): Promise<Record<string, unknown>[]>;
  executar(sql: string, params: unknown[]): Promise<unknown>;
}

export type ResultadoRedefinicao =
  | { ok: true; login: string; sessoesEncerradas: number }
  | {
      ok: false;
      motivo: "dados" | "senha_fraca" | "inexistente";
      mensagem: string;
    };

/**
 * Troca a senha de um usuário existente e encerra todas as sessões dele.
 * Não cria usuário e não altera perfil. A nova senha nunca é devolvida nem impressa.
 */
export async function redefinirSenha(
  banco: AcessoBanco,
  loginBruto: string,
  senha: string,
): Promise<ResultadoRedefinicao> {
  const login = loginBruto.trim().toLowerCase();
  if (!login || !senha) {
    return {
      ok: false,
      motivo: "dados",
      mensagem: "Defina RESET_LOGIN e RESET_SENHA no ambiente.",
    };
  }

  const problema = validarSenhaNova(senha, login);
  if (problema) return { ok: false, motivo: "senha_fraca", mensagem: problema };

  const achados = await banco.consultar(
    `SELECT id FROM usuarios WHERE login = $1`,
    [login],
  );
  if (achados.length === 0) {
    return {
      ok: false,
      motivo: "inexistente",
      mensagem: "Usuário não encontrado. Nada foi alterado.",
    };
  }
  const id = String(achados[0].id);

  await banco.executar(
    `UPDATE usuarios SET "senhaHash" = $1, "alteradoEm" = now() WHERE id = $2`,
    [await hashSenha(senha), id],
  );
  const encerradas = await banco.consultar(
    `DELETE FROM sessoes WHERE "usuarioId" = $1 RETURNING id`,
    [id],
  );
  return { ok: true, login, sessoesEncerradas: encerradas.length };
}
