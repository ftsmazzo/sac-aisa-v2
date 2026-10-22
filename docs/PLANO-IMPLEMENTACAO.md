# Plano de Implementação — SAC AISA v2

> Roteiro de execução.
> Depende de: [PRD](PRD.md), [TRD](TRD.md), [Fluxo do App](FLUXO-APP.md), [UI/UX](UIUX.md), [Esquema Backend](ESQUEMA-BACKEND.md)

**Data**: 21/10/2026

A ordem das fases é **sugestão**, não decisão. Prazo e orçamento ficaram para depois; este plano é a base para montar o orçamento que o dono pediu. O escopo do PRD permanece: registro assistido por IA, direcionamento, ClickUp, marketplaces, painel de indicadores e interface nova.

## 0. Já feito

- Pasta, repositório privado `ftsmazzo/sac-aisa-v2` e projeto `sac-aisa-v2` no EasyPanel (Postgres, Redis e app web).
- Aplicação mínima no ar, com `GET /health` respondendo ok, CI de tipo, lint, teste e build, e `CLAUDE.md` com as regras.
- PRD, TRD, Fluxo, UI/UX, Esquema e protótipo visual do painel e da ficha.
- Fase 2, fatia 1 (leitura): lista de reclamações com filtros, busca e paginação e ficha lateral somente leitura, sobre os dados importados.
- Fase 2, fatia 2 (escrita): cadastro e edição de reclamação na ficha lateral (`POST` e `PATCH /reclamacoes`), com causa, setor e situação calculados pelo servidor e auditoria de quem mudou o quê. Faltam a análise do setor, a fila, as fotos e os alertas.
- Pendente da base: GlitchTip (erros) e Uptime Kuma (monitor em `/health`, 60 s).

## 1. MVP

O produto gera valor quando uma reclamação é registrada, vai ao setor certo, aparece como card no ClickUp, é tratada em dois estágios e o gestor enxerga o resultado. São as fases 1 a 4. IA e marketplaces vêm em seguida, mas **o pedido de acesso às APIs começa já na fase 1**, porque a aprovação das plataformas costuma demorar e não depende de código.

## 2. Fases seguintes

| Fase | Escopo | Prioridade | Dependências |
|---|---|---|---|
| 1. Base de dados e acesso | Esquema v2 no Prisma (cadastros e reclamação), API NestJS, login com Argon2id e perfis (operação, responsável de setor, gestor, administrador), importação do sac-renato (402 reclamações, 22 causas, regras, de-para, usuários), pacote de domínio com testes (situação, custo, direcionamento), sistema de design e tema por marca | Alta | Aprovação do esquema; logos podem chegar depois |
| 2. Núcleo da reclamação | Lista com ficha na frente (cadastro e edição), nova reclamação, fotos, auditoria, fila do setor, análise do setor com a decisão de retorno do produto, estágio 1 completo, alertas de demora | Alta | Fase 1 |
| 3. ClickUp | Card automático ao registrar, mapa setor → lista, webhook de movimentação, sincronização de status com nova tentativa e erro registrado | Alta | Fase 2; token do ClickUp e a lista de espaços e listas por setor |
| 4. Painel de indicadores | Filtro cruzado, bancada × ocorrência, tempo por setor, setores e produtos com mais reclamação, custo, atrasadas, relatórios | Alta | Fases 2 e 3; KPIs e metas aprovados pelo dono |
| 5. IA no registro | Jornada guiada, rascunho com produto, bancada, causa e origem, sugestões com confiança, `IaRegistro` e taxa de aceite; falha da IA cai nas regras | Média | Fase 2; chave do OpenRouter |
| 6. Marketplaces | Primeiro estudo da API de cada canal. Depois Mercado Livre e Shopee: captura, rascunho pré-tratado pela IA, fila de pendentes e alerta de atraso. Magalu fica para depois | Média | Fases 2 e 5; acesso às APIs aprovado |
| 7. Melhoria contínua | Plano de ação ligado às reclamações, card no ClickUp e acompanhamento do efeito (a ocorrência caiu depois da ação?) | Média | Fases 3 e 4 |
| 8. Virada | Execução em paralelo com o sac-renato, conferência dos números, migração final, congelar o sistema atual e desligá-lo | Alta ao final | Fases 1 a 7 e validação do gestor |
| Depois | WhatsApp (cliente e gestor), Magalu, PWA instalável, resposta automática de volta ao marketplace | Baixa | A definir com o cliente |

Fases 3 e 5 podem andar em paralelo depois da 2, assim como o front e o back dentro de cada fase, desde que não mexam nos mesmos arquivos.

## 3. Marcos externos

- Data de lançamento ou demo: a definir (adiado por você).
- Orçamento: a montar a partir das fases acima; o dono pediu a proposta.
- Itens que dependem de terceiros e podem atrasar:
  - Logos e paleta definitiva das marcas.
  - Token do ClickUp e a estrutura de listas por setor.
  - Acesso às APIs do Mercado Livre e da Shopee (aprovação das plataformas). Pedir já.
  - KPIs e metas aprovados pelo dono, e o critério de "demora".
  - Lista final de setores e bancadas, e se WORK é marca.
  - Retenção de dados de cliente (LGPD).
  - Quem mantém o código depois do lançamento.

## 4. Critério de "pronto" por fase

- **Fase 1:** esquema migrado e importação conferida contra os totais do sistema atual (402 reclamações, 22 causas); login e perfis funcionando, com perfil recusado no servidor; testes de domínio verdes; CI verde; deploy no EasyPanel com `/health` ok.
- **Fase 2:** uma reclamação percorre registro, análise do setor e resolução sem sair do sistema; o responsável de setor só vê o próprio setor; alertas de 7, 3 e 2 dias e de custo disparam nos casos de teste.
- **Fase 3:** toda reclamação registrada cria um card na lista do setor certo; mover o card no ClickUp atualiza a situação aqui; falha do ClickUp deixa pendência visível e com nova tentativa.
- **Fase 4:** clicar em um gráfico filtra o painel inteiro; os números batem com a lista; o gestor consegue responder "qual bancada concentra qual tipo de problema" e "qual setor demora a responder".
- **Fase 5:** a IA preenche produto, bancada e causa; a pessoa só confirma; a taxa de aceite aparece no painel; sem IA, o formulário continua funcionando.
- **Fase 6:** uma reclamação nova do canal aparece como rascunho pendente sem digitação; duplicata não é criada; atraso no registro avisa o gestor.
- **Fase 7:** um plano concluído mostra a ocorrência antes e depois, e reabre se não houve queda.
- **Fase 8:** dois ciclos completos em paralelo sem divergência de números; usuários treinados; o sac-renato fica somente leitura e depois é desligado.

---

## Riscos do plano

- A captura dos marketplaces depende de APIs que ainda não foram estudadas; o prazo da fase 6 só fica firme depois do estudo.
- Sem processo e padronização hoje, os dados históricos podem fragilizar a linha de base dos indicadores.
- O sistema atual continua em uso; qualquer mudança nele durante a construção exige reimportar os dados na virada.
