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
import { ControladorJornada } from "./jornada.controller";
import { ControladorReclamacoes } from "./reclamacoes.controller";
import { ControladorRelatorios } from "./relatorios.controller";
import { RepositorioPrisma } from "./repositorio-prisma";
import { lerChave } from "./segredos";
import { ControladorTreino } from "./treino.controller";
import { ControladorUsuarios } from "./usuarios.controller";

@Module({
  controllers: [
    ControladorSaude,
    ControladorAuth,
    ControladorImportacao,
    ControladorReclamacoes,
    ControladorJornada,
    ControladorIntegracoes,
    ControladorUsuarios,
    ControladorWebhooks,
    ControladorAnalise,
    ControladorFilaAlertas,
    ControladorRelatorios,
    ControladorTreino,
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
      useFactory: (
        prisma: PrismaClient,
        integr: ServicoIntegracoes,
        clickup: ServicoClickup,
      ) =>
        new ServicoWebhookClickup(
          new RepositorioClickupPrisma(prisma),
          integr,
          () => new Date(),
          (reclamacaoId) => clickup.reclamacaoMudou(reclamacaoId),
        ),
      inject: [PrismaClient, ServicoIntegracoes, ServicoClickup],
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
