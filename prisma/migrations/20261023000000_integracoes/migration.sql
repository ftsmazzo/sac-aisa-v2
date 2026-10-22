-- AlterTable
ALTER TABLE "clickup_cards" ADD COLUMN "proximaTentativaEm" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "integracoes_config" (
    "chave" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "segredos" JSONB NOT NULL DEFAULT '{}',
    "estado" TEXT NOT NULL DEFAULT 'pendente',
    "ultimoErro" TEXT,
    "testadoEm" TIMESTAMP(3),
    "alteradoEm" TIMESTAMP(3) NOT NULL,
    "alteradoPorId" TEXT,

    CONSTRAINT "integracoes_config_pkey" PRIMARY KEY ("chave")
);

-- CreateIndex
CREATE INDEX "clickup_cards_taskId_idx" ON "clickup_cards"("taskId");

-- CreateIndex
CREATE INDEX "clickup_cards_proximaTentativaEm_idx" ON "clickup_cards"("proximaTentativaEm");
