-- CreateEnum
CREATE TYPE "PerguntaTipo" AS ENUM ('texto', 'escolha', 'numero', 'sim_nao', 'foto', 'data');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IaTipo" ADD VALUE 'triagem';
ALTER TYPE "IaTipo" ADD VALUE 'pergunta';

-- AlterTable
ALTER TABLE "ia_registros" ADD COLUMN     "aceitoEm" TIMESTAMP(3),
ADD COLUMN     "causaEscolhidaId" TEXT,
ADD COLUMN     "custoUsd" DECIMAL(10,6) NOT NULL DEFAULT 0,
ADD COLUMN     "entradaRedigida" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "erro" TEXT,
ADD COLUMN     "etapa" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "latenciaMs" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "textoFinal" TEXT,
ADD COLUMN     "tokensEntrada" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tokensSaida" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "usouRegras" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "usuarioId" TEXT,
ADD COLUMN     "versaoPerfil" INTEGER,
ADD COLUMN     "versaoPrompt" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "perfil_empresa" (
    "id" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "descricao" TEXT NOT NULL DEFAULT '',
    "missao" TEXT NOT NULL DEFAULT '',
    "valores" TEXT NOT NULL DEFAULT '',
    "metas" TEXT NOT NULL DEFAULT '',
    "tomDeVoz" TEXT NOT NULL DEFAULT '',
    "dizer" TEXT NOT NULL DEFAULT '',
    "evitar" TEXT NOT NULL DEFAULT '',
    "assinatura" TEXT NOT NULL DEFAULT '',
    "exemplos" JSONB NOT NULL DEFAULT '[]',
    "padrao" BOOLEAN NOT NULL DEFAULT false,
    "nota" TEXT NOT NULL DEFAULT '',
    "publicadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publicadaPorId" TEXT,
    "publicadaPorNome" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "perfil_empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "perguntas_obrigatorias" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "categoria" TEXT NOT NULL DEFAULT '',
    "texto" TEXT NOT NULL,
    "tipo" "PerguntaTipo" NOT NULL DEFAULT 'texto',
    "opcoes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "obrigatoria" BOOLEAN NOT NULL DEFAULT true,
    "exemplo" TEXT NOT NULL DEFAULT '',
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "regras" JSONB NOT NULL DEFAULT '[]',
    "padrao" BOOLEAN NOT NULL DEFAULT false,
    "atualizadaEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "perguntas_obrigatorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reclamacao_respostas" (
    "id" TEXT NOT NULL,
    "reclamacaoId" TEXT NOT NULL,
    "perguntaId" TEXT,
    "chave" TEXT NOT NULL,
    "textoPergunta" TEXT NOT NULL,
    "valor" TEXT NOT NULL DEFAULT '',
    "origem" TEXT NOT NULL DEFAULT 'atendente',
    "dispensada" BOOLEAN NOT NULL DEFAULT false,
    "motivo" TEXT NOT NULL DEFAULT '',
    "registradaPorId" TEXT,
    "registradaPorNome" TEXT NOT NULL DEFAULT '',
    "registradaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reclamacao_respostas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "perfil_empresa_versao_key" ON "perfil_empresa"("versao");

-- CreateIndex
CREATE UNIQUE INDEX "perguntas_obrigatorias_chave_key" ON "perguntas_obrigatorias"("chave");

-- CreateIndex
CREATE UNIQUE INDEX "reclamacao_respostas_reclamacaoId_chave_key" ON "reclamacao_respostas"("reclamacaoId", "chave");

-- CreateIndex
CREATE INDEX "ia_registros_criadoEm_idx" ON "ia_registros"("criadoEm");

-- AddForeignKey
ALTER TABLE "reclamacao_respostas" ADD CONSTRAINT "reclamacao_respostas_reclamacaoId_fkey" FOREIGN KEY ("reclamacaoId") REFERENCES "reclamacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reclamacao_respostas" ADD CONSTRAINT "reclamacao_respostas_perguntaId_fkey" FOREIGN KEY ("perguntaId") REFERENCES "perguntas_obrigatorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

