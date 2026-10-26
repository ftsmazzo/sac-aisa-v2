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
import {
  ControladorSimulacao,
  ControladorWebhooksCanais,
  ServicoCanais,
} from "./canais.controller";
import { ServicoClickup, ServicoWebhookClickup } from "./clickup";
import { ServicoAssistenteClickup } from "./clickup-assistente";
import { ControladorCoeficiente } from "./coeficiente";
import { ControladorFotos } from "./fotos";
import { ControladorIa, ControladorIaAdmin } from "./ia/ia.controller";
import { ControladorImportacao } from "./importacao.controller";
import { ServicoIntegracoes } from "./integracoes";
import {
  ControladorAssistenteClickup,
  ControladorIntegracoes,
  ControladorWebhooks,
  FilaClickup,
  RepositorioAssistentePrisma,
  RepositorioClickupPrisma,
  RepositorioIntegracoesPrisma,
} from "./integracoes.controller";
import { ControladorJornada } from "./jornada.controller";
import { ControladorPainel } from "./painel.controller";
import { ControladorPlanos } from "./planos";
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
    ControladorFotos,
    ControladorJornada,
    ControladorIa,
    ControladorIaAdmin,
    ControladorIntegracoes,
    ControladorAssistenteClickup,
    ControladorUsuarios,
    ControladorWebhooks,
    ControladorAnalise,
    ControladorFilaAlertas,
    ControladorRelatorios,
    ControladorCoeficiente,
    ControladorPlanos,
    ControladorPainel,
    ControladorTreino,
    ControladorWebhooksCanais,
    ControladorSimulacao,
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
    {
      provide: ServicoAssistenteClickup,
      useFactory: (prisma: PrismaClient, integr: ServicoIntegracoes) =>
        new ServicoAssistenteClickup(
          integr,
          new RepositorioIntegracoesPrisma(prisma),
          new RepositorioAssistentePrisma(prisma),
        ),
      inject: [PrismaClient, ServicoIntegracoes],
    },
    FilaClickup,
    ServicoCanais,
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
