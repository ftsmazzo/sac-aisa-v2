import { existsSync, readFileSync } from "node:fs";
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  HttpCode,
  Inject,
  Post,
  Req,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { executarImportacao, validarArquivo } from "@sac-aisa/importacao";
import { type PedidoComUsuario, Requer } from "./auth.guard";

const CATALOGO =
  process.env.CATALOGO_PRODUTOS ?? "/app/dados/catalogo-produtos.txt";

/** Uma importação por vez: duas transações grandes ao mesmo tempo só atrapalham. */
let emAndamento = false;

function catalogoDeProdutos(): string | undefined {
  return existsSync(CATALOGO) ? readFileSync(CATALOGO, "utf8") : undefined;
}

@Controller("admin")
export class ControladorImportacao {
  constructor(@Inject(PrismaClient) private readonly prisma: PrismaClient) {}

  /**
   * Importa o backup do sistema antigo. Só quem tem `dados.importar`.
   * "simular" confere sem gravar; "gravar" escreve tudo numa transação.
   */
  @Requer("dados.importar")
  @Post("importar")
  @HttpCode(200)
  async importar(@Body() corpo: unknown, @Req() req: PedidoComUsuario) {
    const c = (corpo ?? {}) as Record<string, unknown>;
    if (c.modo !== "simular" && c.modo !== "gravar") {
      throw new BadRequestException("Informe o modo: simular ou gravar.");
    }
    const modo = c.modo;

    const validado = validarArquivo(c.arquivo);
    if (!validado.ok) throw new BadRequestException(validado.mensagem);

    if (emAndamento) {
      throw new ConflictException("Já existe uma importação em andamento.");
    }
    emAndamento = true;
    try {
      const resultado = await executarImportacao(
        {
          transacao: (fn) =>
            this.prisma.$transaction(
              (tx) =>
                fn((sql, params) =>
                  /^\s*select/i.test(sql)
                    ? tx.$queryRawUnsafe(sql, ...params)
                    : tx.$executeRawUnsafe(sql, ...params),
                ),
              { timeout: 600_000, maxWait: 30_000 },
            ),
        },
        validado.arquivo,
        modo,
        catalogoDeProdutos(),
      );

      if (modo === "gravar") {
        await this.prisma.auditoria.create({
          data: {
            usuarioId: req.usuario?.id,
            usuarioNome: req.usuario?.nome ?? "",
            acao: "importou o backup do sistema antigo",
            alvo: "Dados",
            detalhe: JSON.stringify(resultado.relatorio.contagens),
          },
        });
      }
      return resultado;
    } finally {
      emAndamento = false;
    }
  }
}
