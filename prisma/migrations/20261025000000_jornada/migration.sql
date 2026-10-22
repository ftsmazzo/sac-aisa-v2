-- Jornada da reclamação: estados, histórico de estados, prazo do marketplace e marcas do usuário.

-- CreateEnum
CREATE TYPE "EstadoJornada" AS ENUM ('triagem', 'aguardando_cliente', 'encaminhada', 'recebida', 'em_tratativa', 'resolvida_setor', 'finalizada');

-- AlterEnum
ALTER TYPE "AlertTipo" ADD VALUE IF NOT EXISTS 'SEM_RECEBIMENTO_SETOR';
ALTER TYPE "AlertTipo" ADD VALUE IF NOT EXISTS 'SOLUCAO_SEM_FINALIZACAO';
ALTER TYPE "AlertTipo" ADD VALUE IF NOT EXISTS 'PRAZO_MARKETPLACE';

-- AlterTable
ALTER TABLE "reclamacoes"
    ADD COLUMN "estado" "EstadoJornada" NOT NULL DEFAULT 'triagem',
    ADD COLUMN "estadoDesde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "prazoMarketplace" DATE;

-- CreateTable
CREATE TABLE "estado_historico" (
    "id" TEXT NOT NULL,
    "reclamacaoId" TEXT NOT NULL,
    "de" "EstadoJornada",
    "para" "EstadoJornada" NOT NULL,
    "quando" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "autorId" TEXT,
    "autorNome" TEXT NOT NULL DEFAULT '',
    "motivo" TEXT NOT NULL DEFAULT '',
    "origem" TEXT NOT NULL DEFAULT 'web',
    "reabertura" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "estado_historico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario_marcas" (
    "usuarioId" TEXT NOT NULL,
    "marcaId" TEXT NOT NULL,

    CONSTRAINT "usuario_marcas_pkey" PRIMARY KEY ("usuarioId","marcaId")
);

-- CreateIndex
CREATE INDEX "reclamacoes_estado_idx" ON "reclamacoes"("estado");

-- CreateIndex
CREATE INDEX "estado_historico_reclamacaoId_quando_idx" ON "estado_historico"("reclamacaoId", "quando");

-- AddForeignKey
ALTER TABLE "estado_historico" ADD CONSTRAINT "estado_historico_reclamacaoId_fkey" FOREIGN KEY ("reclamacaoId") REFERENCES "reclamacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_marcas" ADD CONSTRAINT "usuario_marcas_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_marcas" ADD CONSTRAINT "usuario_marcas_marcaId_fkey" FOREIGN KEY ("marcaId") REFERENCES "marcas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Dados antigos: a situação de hoje vira o estado da jornada, sem perder nada.
-- Rascunho vira triagem; com data de ação, finalizada (já estava resolvida no sistema antigo);
-- aguardando produto, recebida pelo setor; o resto, em tratativa. Mesma regra de estadoDaSituacaoLegada
-- no pacote de domínio. A coluna `situacao` continua como está.
UPDATE "reclamacoes" SET
    "estado" = (CASE
        WHEN "rascunho" THEN 'triagem'
        WHEN "dataAcao" IS NOT NULL THEN 'finalizada'
        WHEN "devolucao" = 'AGUARDANDO' THEN 'recebida'
        ELSE 'em_tratativa'
    END)::"EstadoJornada",
    "estadoDesde" = "criadoEm";

-- Uma linha-base de histórico por reclamação existente, para os relógios terem de onde partir.
INSERT INTO "estado_historico" ("id", "reclamacaoId", "de", "para", "quando", "autorNome", "motivo", "origem")
SELECT 'mig-' || "id", "id", NULL, "estado", "criadoEm", 'Migração', 'Estado inicial a partir da situação anterior.', 'migracao'
FROM "reclamacoes";
