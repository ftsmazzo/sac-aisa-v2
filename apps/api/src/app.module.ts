import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { PrismaClient } from "@prisma/client";
import { ServicoAuth } from "@sac-aisa/auth";
import { ControladorAuth, ControladorSaude } from "./auth.controller";
import { GuardaAcesso } from "./auth.guard";
import { ServicoClickup, ServicoWebhookClickup } from "./clickup";
import { ControladorImportacao } from "./importacao.controller";
import { ServicoIntegracoes } from "./integracoes";
import {
  ControladorIntegracoes,
  ControladorWebhooks,
  FilaClickup,
  RepositorioClickupPrisma,
  RepositorioIntegracoesPrisma,
} from "./integracoes.controller";
import { ControladorReclamacoes } from "./reclamacoes.controller";
import { RepositorioPrisma } from "./repositorio-prisma";
import { lerChave } from "./segredos";

@Module({
  controllers: [
    ControladorSaude,
    ControladorAuth,
    ControladorImportacao,
    ControladorReclamacoes,
    ControladorIntegracoes,
    ControladorWebhooks,
  ],
  providers: [
    { provide: PrismaClient, useFactory: () => new PrismaClient() },
    {
      provide: ServicoIntegracoes,
      useFactory: (prisma: PrismaClient) =>
        new ServicoIntegracoes(
          new RepositorioIntegracoesPrisma(prisma),
          lerChave(process.env.INTEGRACOES_CHAVE),
        ),
      inject: [PrismaClient],
    },
    {
      provide: ServicoClickup,
      useFactory: (prisma: PrismaClient, integr: ServicoIntegracoes) =>
        new ServicoClickup(new RepositorioClickupPrisma(prisma), integr),
      inject: [PrismaClient, ServicoIntegracoes],
    },
    {
      provide: ServicoWebhookClickup,
      useFactory: (prisma: PrismaClient, integr: ServicoIntegracoes) =>
        new ServicoWebhookClickup(new RepositorioClickupPrisma(prisma), integr),
      inject: [PrismaClient, ServicoIntegracoes],
    },
    FilaClickup,
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
