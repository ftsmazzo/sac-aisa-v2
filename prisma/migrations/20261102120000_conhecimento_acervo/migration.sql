-- AlterTable
ALTER TABLE "conhecimento_chunks" ADD COLUMN "acervo" TEXT NOT NULL DEFAULT '';

-- Backfill por fonte (antes do reindex via sincronizar / importar-url)
UPDATE "conhecimento_chunks" SET "acervo" = 'institucional' WHERE "fonte" = 'perfil' AND "acervo" = '';
UPDATE "conhecimento_chunks" SET "acervo" = 'politica-sac' WHERE "fonte" IN ('pergunta', 'causa') AND "acervo" = '';
UPDATE "conhecimento_chunks" SET "acervo" = 'casos' WHERE "fonte" = 'caso' AND "acervo" = '';
UPDATE "conhecimento_chunks" SET "acervo" = 'produtos-site' WHERE "fonte" = 'url' AND "acervo" = '';
UPDATE "conhecimento_chunks" SET "acervo" = 'manual' WHERE "fonte" = 'manual' AND "acervo" = '';

-- CreateIndex
CREATE INDEX "conhecimento_chunks_acervo_ativo_idx" ON "conhecimento_chunks"("acervo", "ativo");
