#!/bin/sh
# Sobe a API: aplica as migrações, cria o primeiro administrador se pedido e inicia.
set -e

node_modules/.bin/prisma migrate deploy

# Redefinir senha: com RESET_LOGIN e RESET_SENHA definidos, troca a senha desse usuário
# (que precisa existir) e encerra as sessões dele. Depois de usar, remova RESET_SENHA
# das variáveis do serviço.
if [ -n "$RESET_LOGIN" ] && [ -n "$RESET_SENHA" ]; then
  node apps/api/dist/redefinir-senha.js || true
fi

# Primeiro acesso: com ADMIN_LOGIN e ADMIN_SENHA definidos e nenhum administrador
# no banco, cria o administrador. Se já existir, não altera nada. Depois do primeiro
# login, remova ADMIN_SENHA das variáveis do serviço.
if [ -n "$ADMIN_LOGIN" ] && [ -n "$ADMIN_SENHA" ]; then
  node apps/api/dist/criar-admin.js || true
fi

# Importação do sac-renato: com IMPORT_BACKUP apontando para o arquivo JSON montado
# no serviço, importa as reclamações. Rodar de novo não duplica nada. O log mostra só
# contagens. Depois de conferir, desmonte o arquivo e remova a variável.
if [ -n "$IMPORT_BACKUP" ] && [ -f "$IMPORT_BACKUP" ]; then
  node apps/api/dist/importar.js "$IMPORT_BACKUP" --produtos /app/dados/catalogo-produtos.txt || true
fi

exec node apps/api/dist/main.js
