import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { aplicarTabelas } from "./aplicar";
import { type BackupLegado, converterBackup } from "./converter";

/**
 * Importa o backup JSON do sac-renato para o banco da v2.
 *
 *   npm run importar -w @sac-aisa/importacao -- <backup.json> [--produtos <catalogo.txt>] [--simular]
 *
 * --simular só converte e mostra o relatório, sem tocar no banco.
 * O relatório traz só contagens, nunca dado de cliente.
 */
async function executar() {
  const args = process.argv.slice(2);
  const arquivo = args.find((a) => !a.startsWith("--"));
  const simular = args.includes("--simular");
  const iProd = args.indexOf("--produtos");
  const catalogo = iProd >= 0 ? args[iProd + 1] : undefined;

  if (!arquivo) {
    console.error("Informe o arquivo de backup JSON.");
    process.exit(1);
  }

  const backup = JSON.parse(readFileSync(arquivo, "utf8")) as BackupLegado;
  if (!Array.isArray(backup.regs)) {
    console.error(
      "O arquivo não parece um backup do sac-renato (falta `regs`).",
    );
    process.exit(1);
  }

  const { tabelas, relatorio } = converterBackup(backup, {
    catalogoProdutos: catalogo ? readFileSync(catalogo, "utf8") : undefined,
  });
  console.log(JSON.stringify(relatorio, null, 2));

  if (simular) {
    console.log("Simulação: nada foi gravado.");
    return;
  }
  if (!process.env.DATABASE_URL) {
    console.error("Defina DATABASE_URL para gravar.");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    await prisma.$transaction(
      async (tx) => {
        await aplicarTabelas(
          (sql, params) => tx.$queryRawUnsafe(sql, ...params),
          tabelas,
        );
      },
      { timeout: 600_000, maxWait: 30_000 },
    );
    console.log("Importação concluída.");
  } finally {
    await prisma.$disconnect();
  }
}

executar();
