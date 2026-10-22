-- CreateTable
CREATE TABLE "reclamacao_campo_origem" (
    "id" TEXT NOT NULL,
    "reclamacaoId" TEXT NOT NULL,
    "campo" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "aceite" TEXT,
    "quando" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" TEXT,

    CONSTRAINT "reclamacao_campo_origem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reclamacao_campo_origem_reclamacaoId_campo_key" ON "reclamacao_campo_origem"("reclamacaoId", "campo");

-- AddForeignKey
ALTER TABLE "reclamacao_campo_origem" ADD CONSTRAINT "reclamacao_campo_origem_reclamacaoId_fkey" FOREIGN KEY ("reclamacaoId") REFERENCES "reclamacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

