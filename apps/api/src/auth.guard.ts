import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  Inject,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  COOKIE_SESSAO,
  decidirAcesso,
  lerCookie,
  ServicoAuth,
  type UsuarioLogado,
} from "@sac-aisa/auth";
import type { Request } from "express";

export const CHAVE_PUBLICO = "sac:publico";
export const CHAVE_REQUER = "sac:requer";

/** Marca a rota como aberta. Sem isto, toda rota exige login. */
export const Publico = () => SetMetadata(CHAVE_PUBLICO, true);

/** Exige estas permissões, além do login. */
export const Requer = (...chaves: string[]) =>
  SetMetadata(CHAVE_REQUER, chaves);

export type PedidoComUsuario = Request & { usuario?: UsuarioLogado };

export function origensPermitidas(): string[] {
  return (process.env.WEB_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

/** Guarda global: nega por padrão e confere perfil e origem em toda ação. */
@Injectable()
export class GuardaAcesso implements CanActivate {
  constructor(
    @Inject(ServicoAuth) private readonly auth: ServicoAuth,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const req = contexto.switchToHttp().getRequest<PedidoComUsuario>();
    const alvos = [contexto.getHandler(), contexto.getClass()];
    const publico =
      this.reflector.getAllAndOverride<boolean>(CHAVE_PUBLICO, alvos) === true;
    const requeridas =
      this.reflector.getAllAndOverride<string[]>(CHAVE_REQUER, alvos) ?? [];

    const token = lerCookie(req.headers.cookie, COOKIE_SESSAO);
    const usuario = await this.auth.validar(token);

    const decisao = decidirAcesso({
      publico,
      usuario,
      requeridas,
      metodo: req.method,
      origem: req.headers.origin ?? null,
      origensPermitidas: origensPermitidas(),
    });
    if (!decisao.ok) throw new HttpException(decisao.motivo, decisao.status);

    if (usuario) req.usuario = usuario;
    return true;
  }
}
