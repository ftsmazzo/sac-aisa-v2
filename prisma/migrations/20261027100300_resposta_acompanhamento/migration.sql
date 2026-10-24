-- Resposta que o SAC envia no marketplace e o acompanhamento depois do fechamento.
ALTER TABLE "reclamacoes" ADD COLUMN "respostaMarketplace" TEXT NOT NULL DEFAULT '';
ALTER TABLE "reclamacoes" ADD COLUMN "respostaEnviadaEm" TIMESTAMP(3);
ALTER TABLE "reclamacoes" ADD COLUMN "acompanhamento" TEXT NOT NULL DEFAULT '';
