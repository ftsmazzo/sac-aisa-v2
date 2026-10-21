# SAC AISA v2

Sistema de reclamações da AISA: registro assistido por IA, direcionamento ao setor responsável, card automático no ClickUp, captura por API dos marketplaces e painel de indicadores para o gestor.

A v2 substitui o `sac-renato` (sistema atual), que segue no ar durante a construção.

Os documentos de produto e de técnica estão em `docs/`: `PRD.md` e `TRD.md`. Fluxo, UI/UX, esquema e plano de implementação vêm a seguir.

## Rodar na máquina

```bash
npm ci
npm run dev
```

A aplicação abre em `http://localhost:3000`. A rota de saúde é `GET /health` e responde `{ "status": "ok" }`.

## Verificações

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Variáveis

Copie `.env.example` quando ele existir. Não grave senha, banco nem chave de API no Git. Tokens do ClickUp, dos marketplaces e do OpenRouter ficam só no EasyPanel.

## Publicação

O EasyPanel publica a branch `main` a partir deste repositório. A imagem Docker sobe o Next.js na porta 3000. Depois de cada deploy, conferir `GET /health` no domínio.
