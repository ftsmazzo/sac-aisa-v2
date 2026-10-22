import { PrismaClient } from "@prisma/client";
import { redefinirSenha } from "@sac-aisa/auth";

/**
 * Redefine a senha de um usuário existente. Roda de fora do navegador, na subida:
 *   RESET_LOGIN=... RESET_SENHA=...
 * A senha vem só do ambiente e nunca é impressa nem gravada em arquivo.
 * Depois de usar, remova RESET_SENHA das variáveis do serviço.
 */
async function executar() {
  const prisma = new PrismaClient();
  try {
    const r = await redefinirSenha(
      {
        consultar: (sql, params) =>
          prisma.$queryRawUnsafe(sql, ...params) as Promise<
            Record<string, unknown>[]
          >,
        executar: (sql, params) => prisma.$executeRawUnsafe(sql, ...params),
      },
      process.env.RESET_LOGIN ?? "",
      process.env.RESET_SENHA ?? "",
    );
    if (!r.ok) {
      console.error(r.mensagem);
      process.exitCode = 1;
      return;
    }
    console.log(
      `Senha de "${r.login}" redefinida. ${r.sessoesEncerradas} sessão(ões) encerrada(s).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

executar();
