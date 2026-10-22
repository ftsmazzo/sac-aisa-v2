-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Perfil" AS ENUM ('administrador', 'gestor', 'operacao', 'responsavel_setor');

-- CreateEnum
CREATE TYPE "Situacao" AS ENUM ('aguardando', 'tratativa', 'resolvida');

-- CreateEnum
CREATE TYPE "Devolucao" AS ENUM ('NA', 'AGUARDANDO', 'RECEBIDO');

-- CreateEnum
CREATE TYPE "OrigemCausa" AS ENUM ('montagem', 'componente_lote', 'projeto', 'embalagem', 'transporte', 'venda');

-- CreateEnum
CREATE TYPE "CanalTipo" AS ENUM ('interno', 'marketplace');

-- CreateEnum
CREATE TYPE "CapturaStatus" AS ENUM ('pendente', 'aceito', 'descartado');

-- CreateEnum
CREATE TYPE "PlanoStatus" AS ENUM ('aberto', 'em_andamento', 'concluido', 'cancelado');

-- CreateEnum
CREATE TYPE "PlanoOrigem" AS ENUM ('kpi', 'manual', 'recorrencia');

-- CreateEnum
CREATE TYPE "AlertTipo" AS ENUM ('AGUARDANDO_DIAS', 'TRATATIVA_META', 'CUSTO_ALTO', 'CAUSA_OUTROS', 'RASCUNHO_PENDENTE');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('aberto', 'enviado', 'resolvido', 'ignorado');

-- CreateEnum
CREATE TYPE "IaTipo" AS ENUM ('preenchimento', 'classificacao');

-- CreateEnum
CREATE TYPE "IaAceite" AS ENUM ('aceita', 'alterada', 'recusada');

-- CreateTable
CREATE TABLE "marcas" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cor" TEXT,
    "logo" TEXT,
    "ativa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "marcas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canais" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "CanalTipo" NOT NULL DEFAULT 'interno',
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "canais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bancadas" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL DEFAULT '',
    "ativa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "bancadas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "setores" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "setores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produtos" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "familia" TEXT NOT NULL DEFAULT '',
    "categoria" TEXT NOT NULL DEFAULT '',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "produtos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sku_depara" (
    "id" TEXT NOT NULL,
    "skuOrigem" TEXT NOT NULL,
    "skuDestino" TEXT NOT NULL,

    CONSTRAINT "sku_depara_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "causas" (
    "id" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "origem" "OrigemCausa",
    "acao" TEXT NOT NULL DEFAULT '',
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "setorId" TEXT NOT NULL,

    CONSTRAINT "causas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regras_direcionamento" (
    "id" TEXT NOT NULL,
    "causaId" TEXT NOT NULL,
    "setorId" TEXT,
    "acao" TEXT,

    CONSTRAINT "regras_direcionamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reclamacoes" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "protocoloExterno" TEXT,
    "marcaId" TEXT,
    "canalId" TEXT NOT NULL,
    "produtoId" TEXT,
    "bancadaId" TEXT,
    "causaId" TEXT,
    "setorRespId" TEXT,
    "setorRespManual" BOOLEAN NOT NULL DEFAULT false,
    "causaManual" BOOLEAN NOT NULL DEFAULT false,
    "situacao" "Situacao" NOT NULL DEFAULT 'tratativa',
    "devolucao" "Devolucao" NOT NULL DEFAULT 'NA',
    "dataAbertura" DATE NOT NULL,
    "dataAcao" DATE,
    "dataRecebimento" DATE,
    "descricao" TEXT NOT NULL DEFAULT '',
    "laudo" TEXT NOT NULL DEFAULT '',
    "procedencia" TEXT NOT NULL DEFAULT '',
    "solucao" TEXT NOT NULL DEFAULT '',
    "observacao" TEXT NOT NULL DEFAULT '',
    "garantia" TEXT NOT NULL DEFAULT '',
    "pedido" TEXT NOT NULL DEFAULT '',
    "clienteNome" TEXT NOT NULL DEFAULT '',
    "cidade" TEXT NOT NULL DEFAULT '',
    "uf" TEXT NOT NULL DEFAULT '',
    "transportadora" TEXT NOT NULL DEFAULT '',
    "peca" TEXT NOT NULL DEFAULT '',
    "rascunho" BOOLEAN NOT NULL DEFAULT false,
    "origemRegistro" TEXT NOT NULL DEFAULT 'web',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPorId" TEXT,
    "alteradoEm" TIMESTAMP(3) NOT NULL,
    "alteradoPorId" TEXT,

    CONSTRAINT "reclamacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custos" (
    "reclamacaoId" TEXT NOT NULL,
    "freteEnvio" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "freteRetorno" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "valorPeca" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "estorno" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "desconto" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "guia" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "custos_pkey" PRIMARY KEY ("reclamacaoId")
);

-- CreateTable
CREATE TABLE "reclamacao_causas" (
    "id" TEXT NOT NULL,
    "reclamacaoId" TEXT NOT NULL,
    "causaId" TEXT NOT NULL,
    "primaria" BOOLEAN NOT NULL DEFAULT false,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "reclamacao_causas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reclamacao_fotos" (
    "id" TEXT NOT NULL,
    "reclamacaoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "caminho" TEXT NOT NULL,
    "miniatura" TEXT,
    "largura" INTEGER,
    "altura" INTEGER,
    "kb" INTEGER,
    "descricaoIa" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPorId" TEXT,

    CONSTRAINT "reclamacao_fotos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analises_setor" (
    "id" TEXT NOT NULL,
    "reclamacaoId" TEXT NOT NULL,
    "setorId" TEXT NOT NULL,
    "produtoPrecisaVoltar" BOOLEAN NOT NULL DEFAULT false,
    "produtoRecebidoEm" DATE,
    "conclusao" TEXT NOT NULL DEFAULT '',
    "resultado" TEXT NOT NULL DEFAULT '',
    "analisadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analises_setor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planos_acao" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL DEFAULT '',
    "produtoId" TEXT,
    "causaId" TEXT,
    "bancadaId" TEXT,
    "setorRespId" TEXT,
    "status" "PlanoStatus" NOT NULL DEFAULT 'aberto',
    "prioridade" TEXT NOT NULL DEFAULT 'media',
    "responsavel" TEXT NOT NULL DEFAULT '',
    "prazo" DATE,
    "origem" "PlanoOrigem" NOT NULL DEFAULT 'manual',
    "baselineInicio" DATE,
    "baselineFim" DATE,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPorId" TEXT,
    "alteradoEm" TIMESTAMP(3) NOT NULL,
    "alteradoPorId" TEXT,

    CONSTRAINT "planos_acao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plano_reclamacoes" (
    "planoId" TEXT NOT NULL,
    "reclamacaoId" TEXT NOT NULL,

    CONSTRAINT "plano_reclamacoes_pkey" PRIMARY KEY ("planoId","reclamacaoId")
);

-- CreateTable
CREATE TABLE "plano_efeitos" (
    "id" TEXT NOT NULL,
    "planoId" TEXT NOT NULL,
    "antesInicio" DATE NOT NULL,
    "antesFim" DATE NOT NULL,
    "depoisInicio" DATE NOT NULL,
    "depoisFim" DATE NOT NULL,
    "ocorrenciasAntes" INTEGER NOT NULL,
    "ocorrenciasDepois" INTEGER NOT NULL,
    "quedaPercentual" DECIMAL(6,2) NOT NULL,
    "resultado" TEXT NOT NULL DEFAULT '',
    "calculadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plano_efeitos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capturas_canal" (
    "id" TEXT NOT NULL,
    "canalId" TEXT NOT NULL,
    "idExterno" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "sugestaoIa" JSONB,
    "status" "CapturaStatus" NOT NULL DEFAULT 'pendente',
    "motivoDescarte" TEXT,
    "reclamacaoId" TEXT,
    "capturadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "limiteEm" TIMESTAMP(3),

    CONSTRAINT "capturas_canal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integracoes_canal" (
    "canalId" TEXT NOT NULL,
    "tipoAuth" TEXT NOT NULL DEFAULT '',
    "expiraEm" TIMESTAMP(3),
    "ativa" BOOLEAN NOT NULL DEFAULT false,
    "ultimoErro" TEXT,
    "alteradoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integracoes_canal_pkey" PRIMARY KEY ("canalId")
);

-- CreateTable
CREATE TABLE "clickup_config" (
    "setorId" TEXT NOT NULL,
    "listaId" TEXT NOT NULL,
    "listaPadrao" BOOLEAN NOT NULL DEFAULT false,
    "mapaStatus" JSONB,

    CONSTRAINT "clickup_config_pkey" PRIMARY KEY ("setorId")
);

-- CreateTable
CREATE TABLE "clickup_cards" (
    "id" TEXT NOT NULL,
    "reclamacaoId" TEXT,
    "planoId" TEXT,
    "taskId" TEXT,
    "listaId" TEXT,
    "statusExterno" TEXT,
    "sincronizadoEm" TIMESTAMP(3),
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "ultimoErro" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clickup_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clickup_eventos" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "recebidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processadoEm" TIMESTAMP(3),

    CONSTRAINT "clickup_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ia_registros" (
    "id" TEXT NOT NULL,
    "reclamacaoId" TEXT,
    "capturaId" TEXT,
    "tipo" "IaTipo" NOT NULL,
    "sugestao" JSONB NOT NULL,
    "confianca" DECIMAL(4,3),
    "aceite" "IaAceite",
    "modelo" TEXT NOT NULL DEFAULT '',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ia_registros_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "perfil" "Perfil" NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "telefone" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPorId" TEXT,
    "alteradoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario_setores" (
    "usuarioId" TEXT NOT NULL,
    "setorId" TEXT NOT NULL,

    CONSTRAINT "usuario_setores_pkey" PRIMARY KEY ("usuarioId","setorId")
);

-- CreateTable
CREATE TABLE "permissoes_usuario" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "permitido" BOOLEAN NOT NULL,

    CONSTRAINT "permissoes_usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessoes" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria" (
    "id" TEXT NOT NULL,
    "quando" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" TEXT,
    "usuarioNome" TEXT NOT NULL DEFAULT '',
    "acao" TEXT NOT NULL,
    "alvo" TEXT NOT NULL DEFAULT '',
    "detalhe" TEXT NOT NULL DEFAULT '',
    "reclamacaoId" TEXT,
    "extra" JSONB,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alertas" (
    "id" TEXT NOT NULL,
    "tipo" "AlertTipo" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'aberto',
    "titulo" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "reclamacaoId" TEXT,
    "chaveDedupe" TEXT NOT NULL,
    "setor" TEXT,
    "enviadoEm" TIMESTAMP(3),
    "resolvidoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alertas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerta_destinos" (
    "id" TEXT NOT NULL,
    "setor" TEXT NOT NULL DEFAULT '',
    "perfil" TEXT NOT NULL DEFAULT '',
    "telefone" TEXT NOT NULL,
    "nome" TEXT NOT NULL DEFAULT '',
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "alerta_destinos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendas_dia" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "descricao" TEXT NOT NULL DEFAULT '',
    "data" DATE NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "vendas_dia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config" (
    "chave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,

    CONSTRAINT "config_pkey" PRIMARY KEY ("chave")
);

-- CreateIndex
CREATE UNIQUE INDEX "marcas_nome_key" ON "marcas"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "canais_nome_key" ON "canais"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "bancadas_codigo_key" ON "bancadas"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "setores_nome_key" ON "setores"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "produtos_codigo_key" ON "produtos"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "sku_depara_skuOrigem_key" ON "sku_depara"("skuOrigem");

-- CreateIndex
CREATE INDEX "causas_setorId_idx" ON "causas"("setorId");

-- CreateIndex
CREATE UNIQUE INDEX "regras_direcionamento_causaId_key" ON "regras_direcionamento"("causaId");

-- CreateIndex
CREATE UNIQUE INDEX "reclamacoes_numero_key" ON "reclamacoes"("numero");

-- CreateIndex
CREATE INDEX "reclamacoes_situacao_idx" ON "reclamacoes"("situacao");

-- CreateIndex
CREATE INDEX "reclamacoes_dataAbertura_idx" ON "reclamacoes"("dataAbertura");

-- CreateIndex
CREATE INDEX "reclamacoes_marcaId_idx" ON "reclamacoes"("marcaId");

-- CreateIndex
CREATE INDEX "reclamacoes_canalId_idx" ON "reclamacoes"("canalId");

-- CreateIndex
CREATE INDEX "reclamacoes_bancadaId_idx" ON "reclamacoes"("bancadaId");

-- CreateIndex
CREATE INDEX "reclamacoes_setorRespId_idx" ON "reclamacoes"("setorRespId");

-- CreateIndex
CREATE INDEX "reclamacoes_causaId_idx" ON "reclamacoes"("causaId");

-- CreateIndex
CREATE INDEX "reclamacoes_produtoId_idx" ON "reclamacoes"("produtoId");

-- CreateIndex
CREATE INDEX "reclamacao_causas_causaId_idx" ON "reclamacao_causas"("causaId");

-- CreateIndex
CREATE UNIQUE INDEX "reclamacao_causas_reclamacaoId_causaId_key" ON "reclamacao_causas"("reclamacaoId", "causaId");

-- CreateIndex
CREATE INDEX "reclamacao_fotos_reclamacaoId_idx" ON "reclamacao_fotos"("reclamacaoId");

-- CreateIndex
CREATE INDEX "analises_setor_reclamacaoId_idx" ON "analises_setor"("reclamacaoId");

-- CreateIndex
CREATE INDEX "planos_acao_status_idx" ON "planos_acao"("status");

-- CreateIndex
CREATE INDEX "planos_acao_produtoId_idx" ON "planos_acao"("produtoId");

-- CreateIndex
CREATE INDEX "plano_efeitos_planoId_idx" ON "plano_efeitos"("planoId");

-- CreateIndex
CREATE UNIQUE INDEX "capturas_canal_reclamacaoId_key" ON "capturas_canal"("reclamacaoId");

-- CreateIndex
CREATE INDEX "capturas_canal_status_idx" ON "capturas_canal"("status");

-- CreateIndex
CREATE UNIQUE INDEX "capturas_canal_canalId_idExterno_key" ON "capturas_canal"("canalId", "idExterno");

-- CreateIndex
CREATE UNIQUE INDEX "clickup_cards_reclamacaoId_key" ON "clickup_cards"("reclamacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "clickup_cards_planoId_key" ON "clickup_cards"("planoId");

-- CreateIndex
CREATE UNIQUE INDEX "clickup_cards_taskId_key" ON "clickup_cards"("taskId");

-- CreateIndex
CREATE INDEX "clickup_eventos_taskId_idx" ON "clickup_eventos"("taskId");

-- CreateIndex
CREATE INDEX "ia_registros_reclamacaoId_idx" ON "ia_registros"("reclamacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_login_key" ON "usuarios"("login");

-- CreateIndex
CREATE UNIQUE INDEX "permissoes_usuario_usuarioId_chave_key" ON "permissoes_usuario"("usuarioId", "chave");

-- CreateIndex
CREATE INDEX "sessoes_usuarioId_idx" ON "sessoes"("usuarioId");

-- CreateIndex
CREATE INDEX "sessoes_expiraEm_idx" ON "sessoes"("expiraEm");

-- CreateIndex
CREATE INDEX "auditoria_quando_idx" ON "auditoria"("quando");

-- CreateIndex
CREATE INDEX "auditoria_reclamacaoId_idx" ON "auditoria"("reclamacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "alertas_chaveDedupe_key" ON "alertas"("chaveDedupe");

-- CreateIndex
CREATE INDEX "alertas_status_tipo_idx" ON "alertas"("status", "tipo");

-- CreateIndex
CREATE INDEX "vendas_dia_data_idx" ON "vendas_dia"("data");

-- CreateIndex
CREATE UNIQUE INDEX "vendas_dia_sku_data_key" ON "vendas_dia"("sku", "data");

-- AddForeignKey
ALTER TABLE "causas" ADD CONSTRAINT "causas_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "setores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regras_direcionamento" ADD CONSTRAINT "regras_direcionamento_causaId_fkey" FOREIGN KEY ("causaId") REFERENCES "causas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regras_direcionamento" ADD CONSTRAINT "regras_direcionamento_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "setores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reclamacoes" ADD CONSTRAINT "reclamacoes_marcaId_fkey" FOREIGN KEY ("marcaId") REFERENCES "marcas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reclamacoes" ADD CONSTRAINT "reclamacoes_canalId_fkey" FOREIGN KEY ("canalId") REFERENCES "canais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reclamacoes" ADD CONSTRAINT "reclamacoes_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reclamacoes" ADD CONSTRAINT "reclamacoes_bancadaId_fkey" FOREIGN KEY ("bancadaId") REFERENCES "bancadas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reclamacoes" ADD CONSTRAINT "reclamacoes_causaId_fkey" FOREIGN KEY ("causaId") REFERENCES "causas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reclamacoes" ADD CONSTRAINT "reclamacoes_setorRespId_fkey" FOREIGN KEY ("setorRespId") REFERENCES "setores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custos" ADD CONSTRAINT "custos_reclamacaoId_fkey" FOREIGN KEY ("reclamacaoId") REFERENCES "reclamacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reclamacao_causas" ADD CONSTRAINT "reclamacao_causas_reclamacaoId_fkey" FOREIGN KEY ("reclamacaoId") REFERENCES "reclamacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reclamacao_causas" ADD CONSTRAINT "reclamacao_causas_causaId_fkey" FOREIGN KEY ("causaId") REFERENCES "causas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reclamacao_fotos" ADD CONSTRAINT "reclamacao_fotos_reclamacaoId_fkey" FOREIGN KEY ("reclamacaoId") REFERENCES "reclamacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analises_setor" ADD CONSTRAINT "analises_setor_reclamacaoId_fkey" FOREIGN KEY ("reclamacaoId") REFERENCES "reclamacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analises_setor" ADD CONSTRAINT "analises_setor_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "setores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planos_acao" ADD CONSTRAINT "planos_acao_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planos_acao" ADD CONSTRAINT "planos_acao_causaId_fkey" FOREIGN KEY ("causaId") REFERENCES "causas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planos_acao" ADD CONSTRAINT "planos_acao_bancadaId_fkey" FOREIGN KEY ("bancadaId") REFERENCES "bancadas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planos_acao" ADD CONSTRAINT "planos_acao_setorRespId_fkey" FOREIGN KEY ("setorRespId") REFERENCES "setores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plano_reclamacoes" ADD CONSTRAINT "plano_reclamacoes_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "planos_acao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plano_reclamacoes" ADD CONSTRAINT "plano_reclamacoes_reclamacaoId_fkey" FOREIGN KEY ("reclamacaoId") REFERENCES "reclamacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plano_efeitos" ADD CONSTRAINT "plano_efeitos_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "planos_acao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capturas_canal" ADD CONSTRAINT "capturas_canal_canalId_fkey" FOREIGN KEY ("canalId") REFERENCES "canais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capturas_canal" ADD CONSTRAINT "capturas_canal_reclamacaoId_fkey" FOREIGN KEY ("reclamacaoId") REFERENCES "reclamacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integracoes_canal" ADD CONSTRAINT "integracoes_canal_canalId_fkey" FOREIGN KEY ("canalId") REFERENCES "canais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clickup_config" ADD CONSTRAINT "clickup_config_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "setores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clickup_cards" ADD CONSTRAINT "clickup_cards_reclamacaoId_fkey" FOREIGN KEY ("reclamacaoId") REFERENCES "reclamacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clickup_cards" ADD CONSTRAINT "clickup_cards_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "planos_acao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ia_registros" ADD CONSTRAINT "ia_registros_reclamacaoId_fkey" FOREIGN KEY ("reclamacaoId") REFERENCES "reclamacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_setores" ADD CONSTRAINT "usuario_setores_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_setores" ADD CONSTRAINT "usuario_setores_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "setores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permissoes_usuario" ADD CONSTRAINT "permissoes_usuario_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_reclamacaoId_fkey" FOREIGN KEY ("reclamacaoId") REFERENCES "reclamacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

