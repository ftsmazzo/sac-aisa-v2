/**
 * npm run ia:avaliar [-- --amostra 30 --semente 1]
 * Roda a triagem por IA em uma amostra das reclamações importadas, SEM dado pessoal (nome, pedido,
 * telefone e e-mail saem antes do prompt), e compara com a causa do histórico e com as regras.
 * Gasta dinheiro de verdade: pede confirmação antes e só roda quando você executa.
 */
import { createInterface } from "node:readline/promises";
import { PrismaClient } from "@prisma/client";
import {
  avaliar,
  type CasoHistorico,
  estimarCustoAvaliacao,
  formatarRelatorio,
  sortear,
} from "./ia/avaliacao";
import { resolverConfig } from "./ia/ia";
import { fonteOpenRouter } from "./ia/ia.controller";
import { ProvedorOpenRouter } from "./ia/provedor";
import { RepositorioIaPrisma } from "./ia/repositorio";
import { ServicoIntegracoes } from "./integracoes";
import { RepositorioIntegracoesPrisma } from "./integracoes.controller";
import { lerChave } from "./segredos";

function argumento(nome: string, padrao: number): number {
  const i = process.argv.indexOf(`--${nome}`);
  const v = i >= 0 ? Number(process.argv[i + 1]) : padrao;
  return Number.isInteger(v) && v > 0 ? v : padrao;
}

async function principal() {
  const amostra = Math.min(argumento("amostra", 30), 200);
  const semente = argumento("semente", 1);
  const prisma = new PrismaClient();
  try {
    const integr = new ServicoIntegracoes(
      new RepositorioIntegracoesPrisma(prisma),
      lerChave(process.env.INTEGRACOES_CHAVE),
    );
    const cfg = await resolverConfig(fonteOpenRouter(integr), process.env);
    if (!cfg.chave) {
      console.error(
        "IA não configurada: coloque a chave em /admin/integracoes (cartão OpenRouter) ou em OPENROUTER_API_KEY.",
      );
      process.exitCode = 1;
      return;
    }
    const repo = new RepositorioIaPrisma(prisma);
    const [causas, perguntas] = await Promise.all([
      repo.causas(),
      repo.perguntas(),
    ]);
    const setorDe = new Map(causas.map((c) => [c.id, c.setorNome]));

    // Gabarito: importada, com causa definida no backup (a inferida é palpite de regra e não serve).
    const linhas = await prisma.reclamacao.findMany({
      where: {
        origemRegistro: "importado",
        causaManual: true,
        causaId: { not: null },
        descricao: { not: "" },
        rascunho: false,
      },
      select: {
        numero: true,
        descricao: true,
        clienteNome: true,
        pedido: true,
        causaId: true,
        produto: { select: { codigo: true, nome: true } },
        canal: { select: { nome: true } },
        setorResp: { select: { nome: true } },
      },
    });
    const todos: CasoHistorico[] = linhas.flatMap((l) =>
      l.causaId
        ? [
            {
              id: `#${l.numero}`,
              descricao: l.descricao,
              produto: l.produto?.nome ?? "",
              sku: l.produto?.codigo ?? "",
              canal: l.canal.nome,
              clienteNome: l.clienteNome,
              pedido: l.pedido,
              causaId: l.causaId,
              setorNome: l.setorResp?.nome ?? setorDe.get(l.causaId) ?? "",
            },
          ]
        : [],
    );
    if (todos.length === 0) {
      console.error(
        "Não há reclamação importada com causa definida para avaliar.",
      );
      process.exitCode = 1;
      return;
    }
    const casos = sortear(todos, amostra, semente);
    console.log(
      `Vou chamar o OpenRouter ${casos.length} vezes (modelo ${cfg.modelo}), com texto sem dado pessoal.\nCusto estimado: US$ ${estimarCustoAvaliacao(casos.length).toFixed(3)} (o valor real aparece no fim).`,
    );
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const resp = (await rl.question('Digite "sim" para gastar e continuar: '))
      .trim()
      .toLowerCase();
    rl.close();
    if (resp !== "sim") {
      console.log("Cancelado. Nada foi gasto.");
      return;
    }
    const { relatorio } = await avaliar({
      casos,
      causas,
      perguntas,
      provedor: new ProvedorOpenRouter(cfg.chave),
      modelo: cfg.modelo,
      aoAndar: (f, t) => process.stdout.write(`\r${f}/${t}`),
    });
    console.log(`\n\n${formatarRelatorio(relatorio, cfg.modelo)}`);
  } finally {
    await prisma.$disconnect();
  }
}

principal().catch((e) => {
  console.error("Falha na avaliação:", e instanceof Error ? e.message : "erro");
  process.exitCode = 1;
});
