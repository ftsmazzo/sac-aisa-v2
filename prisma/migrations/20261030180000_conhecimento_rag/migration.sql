-- CreateEnum
CREATE TYPE "ConhecimentoFonte" AS ENUM ('perfil', 'pergunta', 'causa', 'caso', 'url', 'manual');

-- CreateTable
CREATE TABLE "conhecimento_chunks" (
    "id" TEXT NOT NULL,
    "fonte" "ConhecimentoFonte" NOT NULL,
    "chave" TEXT NOT NULL,
    "titulo" TEXT NOT NULL DEFAULT '',
    "texto" TEXT NOT NULL,
    "url" TEXT NOT NULL DEFAULT '',
    "embedding" DOUBLE PRECISION[],
    "modeloEmbedding" TEXT NOT NULL DEFAULT '',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alteradoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conhecimento_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conhecimento_chunks_chave_key" ON "conhecimento_chunks"("chave");

-- CreateIndex
CREATE INDEX "conhecimento_chunks_fonte_ativo_idx" ON "conhecimento_chunks"("fonte", "ativo");
