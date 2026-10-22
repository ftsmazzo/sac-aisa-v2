-- AlterTable
ALTER TABLE "clickup_cards" ADD COLUMN "precisaSync" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "clickup_eventos" ADD COLUMN "chave" TEXT,
ADD COLUMN "repeticoes" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "clickup_comentarios" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviadoEm" TIMESTAMP(3),

    CONSTRAINT "clickup_comentarios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clickup_comentarios_cardId_enviadoEm_idx" ON "clickup_comentarios"("cardId", "enviadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "clickup_eventos_chave_key" ON "clickup_eventos"("chave");

-- AddForeignKey
ALTER TABLE "clickup_comentarios" ADD CONSTRAINT "clickup_comentarios_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "clickup_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
