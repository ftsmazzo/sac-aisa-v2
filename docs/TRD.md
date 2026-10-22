# TRD — SAC AISA v2

> Technical Requirements Document — traduz o PRD em decisões técnicas.
> Fonte: [x] Entrevista com usuário  [x] Leitura de código existente (sac-renato)
> Depende de: [PRD](PRD.md)

**Data**: 21/10/2026

Nenhuma pergunta técnica foi respondida na entrevista. Tudo abaixo vem do código do sac-renato e é **sugestão, não decisão**, até confirmação.

## 1. Stack tecnológica

| Camada | Tecnologia | Motivo/restrição |
|---|---|---|
| Frontend | Next.js (App Router), React, TypeScript, Tailwind e biblioteca de componentes | Hoje há um único `page.tsx` de 3.403 linhas. A v2 separa em rotas e componentes e adota sistema de design |
| Backend | NestJS, TypeScript | Mantém a API atual (reclamações, IA, alertas, WhatsApp, qualidade). Evolui em vez de reescrever |
| Banco de dados | PostgreSQL com Prisma | Já em uso. Esquema novo e isolado (seção 4) |
| Fila e cache | Redis | Já em uso para fila (`FilaTarefa`), rate limit e memória do agente do gestor |
| IA | OpenRouter, modelo configurável por variável | Já em uso. Sem chave, cai no classificador de regras |
| WhatsApp | Evolution API | Já em uso para cliente e gestor. O que migra fica a definir |
| Domínio compartilhado | `packages/domain` com testes | Regras de situação, custo e direcionamento já validadas |
| Infra/Deploy | Docker no EasyPanel | Mesmo padrão do sistema atual |

Fonte: código atual. Stack de preferência da empresa não foi informada.

## 2. Integrações externas

| Integração | Finalidade | Observações |
|---|---|---|
| ClickUp (API e webhooks) | O SAC é a origem: cria o card ao registrar e o atualiza a cada movimento da reclamação (status, setor, prazo, comentários); recebe a movimentação e a resolução por webhook, sem devolver o que veio de lá | Novo. Precisa do mapa entre setor responsável e lista ou espaço do ClickUp. Token da empresa, fora do Git |
| Mercado Livre (API de pós-venda) | Capturar reclamações e mensagens do comprador | Novo. MVP. Verificar na documentação oficial o escopo de reclamações e a autorização OAuth |
| Shopee (Open Platform) | Capturar devoluções e reclamações | Novo. MVP. Verificar o que a API expõe e o processo de aprovação do app |
| Magalu | Idem | Fase posterior (5 de 402 reclamações) |
| OpenRouter | Preenchimento assistido, classificação, análise | Existe. A IA sugere; quem grava é a regra do sistema |
| Evolution API | WhatsApp | Existe |
| GlitchTip (Sentry) e Uptime Kuma | Erros e disponibilidade | Existe no sac-renato. Repetir com `SENTRY_DSN` e monitor em `/health` |

O que cada API de marketplace realmente entrega não foi verificado. Ler a documentação oficial é a primeira tarefa da fase de integração, antes de prometer prazo.

## 3. Requisitos não-funcionais

- Performance: a definir. Sugestão: telas principais em menos de 2 s; captura de marketplace em lote, de minutos em minutos, sem tempo real.
- Escalabilidade: a definir. O sistema atual tem 402 reclamações; volume pequeno. Uma instância de API e um banco bastam; revisar se a captura automática elevar muito o volume.
- Segurança: login por usuário com perfis (operação, gestor, responsável de setor), sessão em cookie httpOnly, hash de senha forte, perfil conferido no servidor em toda ação, consulta ao banco parametrizada, upload com tipo e tamanho conferidos, limite de requisições. Tokens de ClickUp, marketplaces e OpenRouter são configurados pelo administrador em `/admin/integracoes` e guardados cifrados (AES-256-GCM) no banco; a única variável de ambiente é a chave de cifra, `INTEGRACOES_CHAVE`.
- Compliance: LGPD. Há nome, cidade, protocolo e contato de cliente. Definir base legal, retenção e acesso. A IA não deve receber dado pessoal além do necessário.
- Disponibilidade: a definir. Sugestão: monitor de saúde a cada 60 s e backup diário do Postgres com retenção, como no sistema atual.
- Internacionalização/idiomas: português do Brasil.

## 4. Ambiente e deploy

- Onde roda: nuvem própria, em EasyPanel com Docker.
- Provedor: EasyPanel. Qual painel é o servidor do SAC precisa ser confirmado entre os conectados.
- Isolamento: o v2 recebe seu próprio banco, Redis, API e web, sem reaproveitar os serviços do sac-renato, que segue no ar durante a construção.
- Nomes: pasta local, repositório GitHub e projeto EasyPanel se chamam `sac-aisa-v2`. Repositório privado.
- CI/CD: GitHub Actions com tipo, lint, testes e build; merge só com CI verde; EasyPanel publica a `main`. Confirmar `/health` depois do deploy.

## 5. Restrições herdadas

- Sistemas legados a integrar: o sac-renato. Dados migrados por importação (reclamações, causas, regras, de-para de SKU, usuários), não por commit. O backup JSON e o `.env` do sistema atual não entram no repositório.
- Decisões já tomadas: nomes `sac-aisa-v2`; uso de ClickUp; Mercado Livre e Shopee no MVP; setor de fabricação e setor responsável como entidades separadas (PRD, seção 9).

## 6. Manutenção

- Quem mantém o código após o lançamento: a definir (não informado).
- Nível de complexidade aceitável: moderado. Sugestão: manter a stack já conhecida (TypeScript no front, na API e no domínio) para reduzir o custo de manutenção.

---

## Gaps & Recomendações (sistema atual, sac-renato)

- [ ] Interface em um único arquivo de 3.403 linhas. Recomendação: separar em rotas e componentes.
- [ ] Setor de fabricação e setor responsável sem ligação formal. Recomendação: duas tabelas e uma relação explícita.
- [ ] Sem ClickUp nem marketplaces. Recomendação: módulos de integração com adaptador por canal, para o Magalu entrar sem mexer no núcleo.
- [ ] Texto livre de setor nas reclamações. Recomendação: chave estrangeira e lista controlada.
- [ ] Segredos e dados reais no diretório do projeto (`.env`, backup JSON). Recomendação: manter fora do Git e do v2.
