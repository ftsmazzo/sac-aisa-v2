-- Captura dos canais: campos que vieram do marketplace ficam protegidos contra edição sem motivo.
-- Aditiva: toda reclamação atual fica com a lista vazia.

-- AlterTable
ALTER TABLE "reclamacoes" ADD COLUMN "camposCanal" JSONB NOT NULL DEFAULT '[]'::jsonb;
