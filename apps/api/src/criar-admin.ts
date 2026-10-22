import { PrismaClient } from "@prisma/client";
import { hashSenha, validarSenhaNova } from "@sac-aisa/auth";

/**
 * Cria o primeiro administrador. Roda uma vez, de fora do navegador:
 *   ADMIN_LOGIN=... ADMIN_NOME=... ADMIN_SENHA=... npm run admin:criar -w @sac-aisa/api
 * A senha vem só do ambiente e nunca é impressa nem gravada em arquivo.
 */
async function criar() {
  const login = (process.env.ADMIN_LOGIN ?? "").trim().toLowerCase();
  const nome = (process.env.ADMIN_NOME ?? "").trim() || login;
  const senha = process.env.ADMIN_SENHA ?? "";

  if (!login || !senha) {
    console.error("Defina ADMIN_LOGIN e ADMIN_SENHA no ambiente.");
    process.exit(1);
  }
  const problema = validarSenhaNova(senha, login);
  if (problema) {
    console.error(problema);
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const jaTem = await prisma.usuario.count({
      where: { perfil: "administrador" },
    });
    if (jaTem > 0) {
      console.error("Já existe um administrador. Nada foi alterado.");
      process.exit(1);
    }
    await prisma.usuario.create({
      data: {
        login,
        nome,
        perfil: "administrador",
        senhaHash: await hashSenha(senha),
      },
    });
    console.log(`Administrador "${login}" criado.`);
  } finally {
    await prisma.$disconnect();
  }
}

criar();
