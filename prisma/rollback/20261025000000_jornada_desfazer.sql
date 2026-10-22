-- Desfaz a migração 20261025000000_jornada. NÃO fica em prisma/migrations: o Prisma não a executa.
-- Rodar à mão (psql) só se a jornada precisar ser retirada. Faça o backup do banco antes.
--
-- O que apaga: o estado, o histórico de estados, o prazo do marketplace e as marcas dos usuários.
-- Perde-se o que só existe nessas colunas e tabelas (transições, autores, prazos, marcas por usuário).
-- Não mexe em reclamação, custo, situação (`situacao`), data de ação nem alerta existentes.
-- Os três valores novos do enum "AlertTipo" ficam: o PostgreSQL não remove valor de enum, e são inofensivos.
-- Depois de rodar, apague a linha da migração em `_prisma_migrations` (e a pasta no código) antes de um novo `migrate deploy`:
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261025000000_jornada';

BEGIN;

-- Alertas gravados com os tipos novos não existem mais em dado real (a tela calcula na hora), mas por segurança:
DELETE FROM "alertas" WHERE "tipo"::text IN ('SEM_RECEBIMENTO_SETOR', 'SOLUCAO_SEM_FINALIZACAO', 'PRAZO_MARKETPLACE');

DROP TABLE IF EXISTS "usuario_marcas";
DROP TABLE IF EXISTS "estado_historico";

DROP INDEX IF EXISTS "reclamacoes_estado_idx";
ALTER TABLE "reclamacoes"
    DROP COLUMN IF EXISTS "estado",
    DROP COLUMN IF EXISTS "estadoDesde",
    DROP COLUMN IF EXISTS "prazoMarketplace";

DROP TYPE IF EXISTS "EstadoJornada";

COMMIT;
