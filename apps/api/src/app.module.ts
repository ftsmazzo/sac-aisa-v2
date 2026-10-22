import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { PrismaClient } from "@prisma/client";
import { ServicoAuth } from "@sac-aisa/auth";
import {
  ControladorAnalise,
  ControladorFilaAlertas,
} from "./analise-fila.controller";
import { ControladorAuth, ControladorSaude } from "./auth.controller";
import { GuardaAcesso } from "./auth.guard";
import { ControladorImportacao } from "./importacao.controller";
import { ControladorReclamacoes } from "./reclamacoes.controller";
import { RepositorioPrisma } from "./repositorio-prisma";

@Module({
  controllers: [
    ControladorSaude,
    ControladorAuth,
    ControladorImportacao,
    ControladorReclamacoes,
    ControladorAnalise,
    ControladorFilaAlertas,
  ],
  providers: [
    { provide: PrismaClient, useFactory: () => new PrismaClient() },
    {
      provide: ServicoAuth,
      useFactory: (prisma: PrismaClient) =>
        new ServicoAuth(new RepositorioPrisma(prisma)),
      inject: [PrismaClient],
    },
    { provide: APP_GUARD, useClass: GuardaAcesso },
  ],
})
export class ModuloApp {}
