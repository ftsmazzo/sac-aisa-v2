import { PrismaClient } from "@prisma/client";
import { apagarTreino, carregarDemonstracao, transacaoPrisma } from "./treino";

/**
 * Dados de demonstração do modo treino, de fora do navegador:
 *   npm run treino:carregar -w @sac-aisa/api            cria as reclamações fictícias
 *   npm run treino:carregar -w @sac-aisa/api -- --apagar apaga só os dados de treino
 * Rodar de novo não duplica. O log mostra só contagens.
 */
async function executar() {
  const apagar = process.argv.includes("--apagar");
  const prisma = new PrismaClient();
  try {
    const transacao = transacaoPrisma(prisma);
    if (apagar) {
      const r = await apagarTreino(transacao);
      console.log(`Apagadas ${r.reclamacoes} reclamações de treino.`);
    } else {
      const r = await carregarDemonstracao(transacao);
      console.log(
        `Demonstração: ${r.criadas} criadas, ${r.jaExistiam} já existiam.`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

executar().catch((e) => {
  console.error(e instanceof Error ? e.message : "Falha ao rodar o treino.");
  process.exit(1);
});
