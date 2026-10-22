#!/bin/sh
# Sobe a API: aplica as migrações, cria o primeiro administrador se pedido e inicia.
set -e

node_modules/.bin/prisma migrate deploy

# Primeiro acesso: com ADMIN_LOGIN e ADMIN_SENHA definidos e nenhum administrador
# no banco, cria o administrador. Se já existir, não altera nada. Depois do primeiro
# login, remova ADMIN_SENHA das variáveis do serviço.
if [ -n "$ADMIN_LOGIN" ] && [ -n "$ADMIN_SENHA" ]; then
  node apps/api/dist/criar-admin.js || true
fi

exec node apps/api/dist/main.js
