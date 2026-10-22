import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import {
  COOKIE_SESSAO,
  ErroAuth,
  lerCookie,
  SENHA_MAX,
  ServicoAuth,
} from "@sac-aisa/auth";
import type { Response } from "express";
import { type PedidoComUsuario, Publico } from "./auth.guard";

const LOGIN_MAX = 100;

function opcoesCookie(expira?: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(expira ? { expires: expira } : {}),
  };
}

function lerCredenciais(corpo: unknown): { login: string; senha: string } {
  const c = (corpo ?? {}) as Record<string, unknown>;
  if (
    typeof c.login !== "string" ||
    typeof c.senha !== "string" ||
    !c.login.trim() ||
    !c.senha
  ) {
    throw new BadRequestException("Informe usuário e senha.");
  }
  if (c.login.length > LOGIN_MAX || c.senha.length > SENHA_MAX) {
    throw new BadRequestException("Usuário ou senha inválidos.");
  }
  return { login: c.login, senha: c.senha };
}

@Controller()
export class ControladorSaude {
  /** Não consulta banco nem devolve dado do negócio. */
  @Publico()
  @Get("health")
  saude() {
    return { status: "ok" };
  }
}

@Controller("auth")
export class ControladorAuth {
  constructor(@Inject(ServicoAuth) private readonly auth: ServicoAuth) {}

  @Publico()
  @Post("login")
  @HttpCode(200)
  async entrar(
    @Body() corpo: unknown,
    @Req() req: PedidoComUsuario,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { login, senha } = lerCredenciais(corpo);
    try {
      const r = await this.auth.entrar(login, senha, req.ip ?? "desconhecido");
      res.cookie(COOKIE_SESSAO, r.token, opcoesCookie(r.expiraEm));
      return { usuario: r.usuario };
    } catch (e) {
      if (e instanceof ErroAuth && e.codigo === "bloqueado") {
        res.setHeader("Retry-After", String(e.esperarSegundos ?? 60));
        throw new HttpException(e.message, 429);
      }
      if (e instanceof ErroAuth) throw new UnauthorizedException(e.message);
      throw e;
    }
  }

  @Publico()
  @Post("logout")
  @HttpCode(204)
  async sair(
    @Req() req: PedidoComUsuario,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.sair(lerCookie(req.headers.cookie, COOKIE_SESSAO));
    res.clearCookie(COOKIE_SESSAO, opcoesCookie());
  }

  @Get("me")
  eu(@Req() req: PedidoComUsuario) {
    return { usuario: req.usuario };
  }
}
