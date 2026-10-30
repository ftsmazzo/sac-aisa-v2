import { Inject, Injectable } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import type { UsuarioLogado } from "@sac-aisa/auth";
import {
  GESTOR_TOOL_DEFS,
  type GestorToolDef,
  GestorTools,
  usuarioGestorDe,
} from "@sac-aisa/gestor-tools";
import { ConhecimentoService } from "./conhecimento.service";

export {
  formatWhatsapp,
  normSku,
  phoneMatch,
  resolverPeriodo,
  setorFuzzyMatch,
} from "@sac-aisa/gestor-tools";
export type { GestorToolDef };
export { GESTOR_TOOL_DEFS, usuarioGestorDe };

/** Adapter Nest: mesma implementação de `@sac-aisa/gestor-tools`. */
@Injectable()
export class GestorToolsService {
  private readonly tools: GestorTools;

  constructor(
    @Inject(PrismaClient) prisma: PrismaClient,
    @Inject(ConhecimentoService) conhecimento: ConhecimentoService,
  ) {
    this.tools = new GestorTools(prisma, {
      embed: (texto) => conhecimento.embed(texto),
    });
  }

  defs(): GestorToolDef[] {
    return this.tools.defs();
  }

  execute(
    name: string,
    args: Record<string, unknown>,
    usuario: UsuarioLogado,
  ): Promise<unknown> {
    return this.tools.execute(name, args, usuario);
  }
}
