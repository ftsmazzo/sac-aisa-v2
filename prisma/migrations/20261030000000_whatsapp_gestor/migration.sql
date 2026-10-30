-- CreateEnum
CREATE TYPE "WhatsappDirecao" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "WhatsappPapel" AS ENUM ('cliente', 'interno');

-- CreateTable
CREATE TABLE "whatsapp_conversas" (
    "id" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "papel" "WhatsappPapel" NOT NULL DEFAULT 'cliente',
    "nome" TEXT NOT NULL DEFAULT '',
    "estado" TEXT NOT NULL DEFAULT 'inicio',
    "contexto" JSONB,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alteradoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_conversas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_mensagens" (
    "id" TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "direcao" "WhatsappDirecao" NOT NULL,
    "texto" TEXT NOT NULL,
    "payload" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_mensagens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_conversas_telefone_idx" ON "whatsapp_conversas"("telefone");

-- CreateIndex
CREATE INDEX "whatsapp_mensagens_conversaId_criadoEm_idx" ON "whatsapp_mensagens"("conversaId", "criadoEm");

-- AddForeignKey
ALTER TABLE "whatsapp_mensagens" ADD CONSTRAINT "whatsapp_mensagens_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "whatsapp_conversas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
