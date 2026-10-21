# SAC AISA v2 — regras para quem altera o código

A fonte única das regras do projeto é este arquivo. A regra do Cursor em `.cursor/rules/projeto.mdc` só aponta para cá.

## O que este repositório é

Reconstrução do SAC de reclamações da AISA. O escopo está em `docs/PRD.md` e as decisões técnicas em `docs/TRD.md`. Mudança de escopo passa por esses documentos antes do código.

Stack inicial: TypeScript, Next.js (App Router). Entram conforme o plano: NestJS, PostgreSQL com Prisma, Redis para fila, OpenRouter para IA, Evolution API para WhatsApp, ClickUp e APIs de Mercado Livre e Shopee. O modelo de IA sugere; quem grava é a regra do sistema.

## Regras de negócio herdadas do sistema atual

- Situação: com data de ação, a reclamação está resolvida; sem ação e aguardando produto, fica aguardando; senão, em tratativa.
- Tratativa só depois do produto recebido, ou sem devolução.
- A causa define o setor responsável, com troca manual.
- Custo é a soma de fretes, peça, estorno, desconto e guia.
- Setor de fabricação do produto e setor responsável pela tratativa são entidades distintas, ligadas por relação explícita.

## Segurança

- Repositório privado. Segredo, `.env`, dump, backup com dado de cliente e chave de API ficam fora do Git.
- Senha de usuário com hash forte. Cookie de sessão httpOnly.
- Perfil conferido no servidor em toda ação.
- Consulta ao banco parametrizada.
- Upload com tamanho e tipo conferidos.
- LGPD: a IA não recebe dado pessoal além do necessário.
- `GET /health` não devolve dado do negócio.
- Postgres e Redis sem porta pública. HTTPS no proxy do EasyPanel.

## Fluxo de mudança

1. Issue no GitHub descrevendo o comportamento esperado.
2. Branch a partir de `main`.
3. Pull request para `main`. A CI precisa passar: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
4. Merge só com a CI verde.
5. O EasyPanel publica a `main` sozinho. Confirmar `GET /health` depois do deploy.

Não há force push em `main`.

## Esteira de qualidade

- TypeScript estrito.
- Biome para formato e lint.
- Vitest para teste. Regra de situação, custo e direcionamento ganha teste antes de entrar.
- Erros de runtime: GlitchTip (SDK compatível com Sentry), variável `SENTRY_DSN`. Sem DSN, a aplicação sobe e não envia erro para fora.
- Disponibilidade: Uptime Kuma, monitor HTTP(s) em `/health`, 60 segundos, 1 ou 2 tentativas.

## O que não entra

Dados reais de cliente no repositório. O banco novo recebe os dados do sistema atual por importação, nunca por commit.
