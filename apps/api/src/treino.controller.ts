import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Post,
  Put,
  Req,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import type { UsuarioLogado } from "@sac-aisa/auth";
import type { PedidoComUsuario } from "./auth.guard";
import { ServicoIntegracoes } from "./integracoes";
import {
  apagarTreino,
  carregarDemonstracao,
  resumoTreino,
  simularCanal,
  transacaoPrisma,
} from "./treino";
import { CANAIS_SIMULADOS, type CanalSimulado } from "./treino-canais";

function usuarioDe(req: PedidoComUsuario): UsuarioLogado {
  if (!req.usuario) throw new BadRequestException("Sessão ausente.");
  return req.usuario;
}

/** O modo treino é de quem conduz a apresentação: administrador e gestor. */
export function exigirGestao(u: UsuarioLogado) {
  if (u.perfil !== "administrador" && u.perfil !== "gestor") {
    throw new ForbiddenException("Sem permissão para esta ação.");
  }
}

/** Carregar e apagar dados de treino é do administrador. */
export function exigirAdministrador(u: UsuarioLogado) {
  if (u.perfil !== "administrador") {
    throw new ForbiddenException("Só o administrador pode fazer isto.");
  }
}

export function lerCanal(corpo: unknown): CanalSimulado {
  const c = (corpo ?? {}) as Record<string, unknown>;
  if (!CANAIS_SIMULADOS.includes(c.canal as CanalSimulado)) {
    throw new BadRequestException("Informe o canal: mercadolivre ou shopee.");
  }
  return c.canal as CanalSimulado;
}

/** Tela de treino: carga de demonstração, simuladores de canal e a escolha de visão por usuário. */
@Controller("admin/treino")
export class ControladorTreino {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(ServicoIntegracoes)
    private readonly integracoes: ServicoIntegracoes,
  ) {}

  private auditar(u: UsuarioLogado, acao: string, detalhe: string) {
    return this.prisma.auditoria.create({
      data: {
        usuarioId: u.id,
        usuarioNome: u.nome,
        acao,
        alvo: "Modo treino",
        detalhe,
      },
    });
  }

  @Get()
  async situacao(@Req() req: PedidoComUsuario) {
    const u = usuarioDe(req);
    exigirGestao(u);
    const [resumo, cfg] = await Promise.all([
      transacaoPrisma(this.prisma)((exec) => resumoTreino(exec)),
      this.integracoes.config("clickup"),
    ]);
    return {
      modoTreino: u.modoTreino === true,
      resumo,
      criarCardsTreino: cfg.criarCardsTreino === true,
    };
  }

  /** Liga ou desliga a visão de treino do próprio usuário. */
  @Put("modo")
  async modo(@Body() corpo: unknown, @Req() req: PedidoComUsuario) {
    const u = usuarioDe(req);
    exigirGestao(u);
    const c = (corpo ?? {}) as Record<string, unknown>;
    if (typeof c.ativo !== "boolean") {
      throw new BadRequestException("Informe se o modo treino fica ligado.");
    }
    await this.prisma.usuario.update({
      where: { id: u.id },
      data: { modoTreino: c.ativo },
    });
    await this.auditar(
      u,
      "treino.modo",
      c.ativo ? "Ligou o modo treino." : "Desligou o modo treino.",
    );
    return { modoTreino: c.ativo };
  }

  @Post("demonstracao")
  @HttpCode(200)
  async carregar(@Req() req: PedidoComUsuario) {
    const u = usuarioDe(req);
    exigirAdministrador(u);
    const r = await carregarDemonstracao(transacaoPrisma(this.prisma));
    await this.auditar(
      u,
      "treino.carregar",
      `Dados de demonstração: ${r.criadas} criadas, ${r.jaExistiam} já existiam.`,
    );
    return r;
  }

  /** Só linhas de treino. A confirmação vem no corpo para não apagar por engano. */
  @Post("apagar")
  @HttpCode(200)
  async apagar(@Body() corpo: unknown, @Req() req: PedidoComUsuario) {
    const u = usuarioDe(req);
    exigirAdministrador(u);
    const c = (corpo ?? {}) as Record<string, unknown>;
    if (c.confirmar !== true) {
      throw new BadRequestException("Confirme para apagar os dados de treino.");
    }
    const r = await apagarTreino(transacaoPrisma(this.prisma));
    await this.auditar(
      u,
      "treino.apagar",
      `Apagou ${r.reclamacoes} reclamações de treino.`,
    );
    return r;
  }

  @Post("simular")
  @HttpCode(200)
  async simular(@Body() corpo: unknown, @Req() req: PedidoComUsuario) {
    const u = usuarioDe(req);
    exigirGestao(u);
    const canal = lerCanal(corpo);
    const r = await simularCanal(transacaoPrisma(this.prisma), canal);
    await this.auditar(
      u,
      "treino.simular",
      `Simulou ${r.canal}: reclamação de treino #${r.numero}.`,
    );
    return r;
  }
}
