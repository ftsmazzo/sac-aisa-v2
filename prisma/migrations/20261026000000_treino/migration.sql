-- Modo treino: reclamações fictícias de demonstração e a escolha de visão por usuário.
-- Aditiva: nada existente muda; toda reclamação atual fica com treino = false.

-- AlterTable
ALTER TABLE "reclamacoes" ADD COLUMN "treino" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN "modoTreino" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "reclamacoes_treino_idx" ON "reclamacoes"("treino");
