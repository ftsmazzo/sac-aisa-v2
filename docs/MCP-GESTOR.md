# MCP do agente gestor (Fatia 2)

Mesmas tools só-leitura do WhatsApp, via stdio, para Cursor/ops.

## Pacote

- `@sac-aisa/gestor-tools` — defs + executores + filtros de escopo
- `apps/mcp-gestor` — servidor MCP fino

## Rodar local

```bash
# na raiz do monorepo, com DATABASE_URL apontando ao Postgres
npm run start -w @sac-aisa/mcp-gestor
```

Opcional: `GESTOR_MCP_LOGIN=seu.login` para fixar o usuário (administrador ou gestor ativo). Sem isso, usa o primeiro admin/gestor ativo.

## Cursor (`mcp.json`)

```json
{
  "mcpServers": {
    "sac-aisa-gestor": {
      "command": "npx",
      "args": ["tsx", "apps/mcp-gestor/src/main.ts"],
      "cwd": "C:/Users/…/sac-aisa-v2",
      "env": {
        "DATABASE_URL": "postgresql://…",
        "GESTOR_MCP_LOGIN": "admin"
      }
    }
  }
}
```

Sem tools de escrita nesta fase.

## RAG

A tool `conhecimento_buscar` lê `conhecimento_chunks`. Para embeddings no MCP, defina `OPENROUTER_API_KEY` (e opcional `GESTOR_EMBED_MODEL`).

Na API: `POST /admin/ia/conhecimento/sincronizar` (perfil, perguntas, causas, amostra de casos) e `POST /admin/ia/conhecimento/importar-url` com `{ "url": "https://…" }` — domínio em `CONHECIMENTO_URL_ALLOWLIST`.
