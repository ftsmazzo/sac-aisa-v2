# PRD — SAC AISA v2

> Product Requirements Document — o quê e por quê, não como.
> Fonte: [x] Entrevista com usuário  [x] Leitura de código existente (sac-renato)  [x] Briefing e transcrição da reunião com o dono (gravação 82088628-1048-42c7-bd4c-d8e059124755, 21/10/2026)

**Data**: 21/10/2026
**Responsável**: a definir (nome não informado na entrevista)

## 1. Resumo em uma frase

O SAC AISA v2 é o sistema de reclamações da AISA que captura a reclamação (digitada ou vinda do marketplace), a IA prepara o registro, o direciona ao setor certo, abre o card no ClickUp e mede cada etapa, para que o gestor decida com dados e o cliente receba resposta e solução rápidas.

Fonte: briefing + entrevista.

## 2. Problema e contexto

- Problema real que motiva o projeto: o SAC existe para melhorar o relacionamento da empresa com o cliente e o dono não vê esse resultado. A reclamação demora a chegar ao setor correto, o preenchimento é manual e demorado, não há notificação efetiva quando algo fica parado e as métricas não bastam para decidir.
- Como é resolvido hoje: tudo manual, sem processo e sem padronização, o que impossibilita avaliar. Convivem o sistema atual (o SAC em nuvem, repositório sac-renato, com IA, alertas e WhatsApp já parcialmente feitos), o ClickUp para tarefas, e, segundo a entrevista, planilhas e WhatsApp.
- Por que agora: a reunião com o dono deu entendimento pleno da demanda e ele pediu um orçamento para a execução. A versão atual nasceu de uma demanda parcial.

Fonte: briefing + entrevista. A convivência de planilhas e WhatsApp vem da resposta "todas as opções" na entrevista; não foi detalhada.

## 3. Público-alvo

- Quem opera: a equipe que registra as reclamações.
- Quem supervisiona: o gestor e o responsável de cada setor. Monitoram o andamento e recebem informação para tomar decisão (ajuste de setor, plano de ação por produto).
- Outros: o dono da AISA, como destinatário final das avaliações. Perfis exatos e permissões ficam a definir.

Fonte: entrevista. A frase sobre gestor e responsável foi registrada como dita; confirmar se "responsável" é o responsável do setor.

## 4. Objetivos e métricas de sucesso

| Objetivo | Métrica | Meta |
|---|---|---|
| Reclamação entra no fluxo sem demora | Tempo entre a chegada (digitada ou do marketplace) e o registro | A definir. Sugestão, não decisão: o alerta de rascunho do sac-renato dispara em 24 h (`ALERT_RASCUNHO_WHATSAPP_HORAS`) |
| Setor trata rápido | Dias até a ação, em reclamação com devolução | 2 dias (`ALERT_META_DIAS`, sugestão do sistema atual) |
| Produto devolvido não fica parado | Dias em "aguardando produto" | Alerta em 7 dias (`ALERT_AGUARDANDO_DIAS`) |
| Demais casos não ficam parados | Dias sem ação | Alerta em 3 dias (`ALERT_OUTROS_DIAS`) |
| Custo alto vira prioridade | Valor da reclamação | Alerta acima de R$ 500 (`ALERT_CUSTO_ALTO`) |
| O gestor decide com dados | Painel por setor, causa e produto, com tempo de resposta e resolução | Painel entregue com os KPIs aprovados pelo dono |
| Cada reclamação aparece no ClickUp | Reclamações registradas com card criado automaticamente | 100% |

Fonte: briefing (objetivos) + código atual (valores). Os valores marcados como sugestão vêm do sac-renato e foram aceitos na entrevista ("use todas sugeridas"); o dono ainda não os validou.

## 5. Escopo

### Dentro do escopo (MVP)

- Preenchimento da reclamação com IA, em jornada interativa com a pessoa.
- Direcionamento automático ao setor responsável, com ajuste manual.
- Card criado automaticamente no ClickUp ao registrar.
- Acompanhamento do card no ClickUp (movimentação e resolução).
- Notificação ao gestor quando a reclamação fica pendente além do limite.
- Painel de KPIs e relatórios para decisão.
- Interface nova, moderna e responsiva.
- Migração das reclamações e regras do sistema atual.

### Fora do escopo (por enquanto)

- Marketplaces fora da primeira entrega: Magalu (5 de 402 reclamações no sistema atual). Entra depois, se a API justificar.
- Resposta automática de volta ao marketplace: a definir com o cliente.

Fonte: briefing + entrevista.

## 6. Funcionalidades principais

| Funcionalidade | Prioridade | Descrição curta |
|---|---|---|
| Registro assistido por IA | MVP | A IA conduz a jornada, pré-trata os dados e entrega o registro quase pronto |
| Direcionamento por causa e setor | MVP | Causa define o setor, com troca manual (regra já existe no sistema atual) |
| Integração ClickUp | MVP | Cria o card, lê a movimentação e a resolução |
| Alertas ao gestor | MVP | Aviso por demora, com limites configuráveis |
| Painel de KPIs | MVP | Tempo de resposta e de tratativa, setores e produtos com mais reclamação, custo |
| Plano de ação por produto | MVP | Modelagem, embalagem, elétrica e outras categorias (existe em parte) |
| Integração com marketplaces | MVP: Mercado Livre e Shopee. Depois: Magalu | Captura automática por API e pré-tratamento pela IA. Prioridade pelo volume e pela resolutividade (seção 9) |
| WhatsApp (cliente e gestor) | Depois | Já existe no sistema atual; avaliar o que migra |
| Visual novo | MVP | Reconstrução da interface em componentes e sistema de design |

Fonte: briefing + código atual.

## 7. Restrições de negócio

- Prazo: a definir (a conversar depois).
- Orçamento: a definir. O dono pediu um orçamento; ele será montado depois do plano de implementação.
- Legais/regulatórias: LGPD, por haver dados de cliente (nome, contato, pedido). Detalhar no TRD.

Fonte: entrevista (prazo e orçamento adiados).

## 8. Riscos e premissas

- Premissa: os valores sugeridos de prazo e custo refletem o que o dono espera. Se forem falsos, os alertas ficam ruidosos ou tardios.
- Premissa: os marketplaces oferecem API de reclamações acessível à AISA. Se não oferecerem, a captura automática cai para importação manual ou por e-mail.
- Risco (média/alta): sem processo e sem padronização hoje, os dados históricos podem não permitir medir; a linha de base dos KPIs pode ser fraca.
- Risco (média): o sistema atual continua em uso durante a construção; é preciso congelar o esquema ou prever uma migração final dos dados.
- Risco (baixa/alta): o ClickUp precisa de mapeamento de setores para listas ou espaços; sem isso o card cai no lugar errado.

Pontos em aberto herdados do briefing: quais KPIs e metas finais; critério de demora validado pelo dono; lista completa de setores; stack e banco preferidos pela empresa; perfis e permissões; resposta automática ao marketplace.

## 9. Canais e estrutura de setores

Fonte: entrevista + dados do sistema atual (402 reclamações, contagem agregada, sem dado de cliente).

### Canais (marketplaces)

Shopee, Mercado Livre e Magalu existem. A decisão de quais integrar segue a resolutividade: onde a integração mais reduz o tempo até a solução.

| Canal | Reclamações no sistema atual | Decisão proposta |
|---|---|---|
| Site | 167 | Não é marketplace. Entrada pelo formulário assistido por IA |
| Mercado Livre | 146 | MVP |
| Shopee | 81 | MVP |
| Magalu | 5 | Depois |
| WhatsApp | 2 | Pelo registro assistido |

Mercado Livre e Shopee somam 227 de 402 (56%). É sugestão, não decisão, até o dono confirmar.

### Setores: dois tipos e o gargalo estrutural

O sistema atual usa duas listas de setor que não se ligam formalmente:

1. **Setor de fabricação do produto**: vem do cadastro do produto e da planilha. Valores: SETOR 00 a SETOR 08, mais ADMIN e USINAGEM. É o lugar da fábrica onde o produto nasce. Concentração: SETOR 06 (107), SETOR 04 (88) e SETOR 01 (65).
2. **Setor responsável pela tratativa**: define quem resolve a reclamação, escolhido pela causa. Doze áreas: Embalagem / Expedição, Montagem, Solda, Pintura / Acabamento, Corte e Dobra, Qualidade / Engenharia, Compras, Logística, Comercial / Anúncios, Comercial / Pedidos, PCP e SAC / Pós-venda.

O gargalo: a reclamação carrega os dois, mas nomes e estrutura são diferentes e não há mapa entre eles. O setor de fabricação mede a origem do defeito; o responsável mede quem trata. Misturar os dois impede dizer "qual setor produz mais problema" e "qual setor demora a resolver". A v2 trata os dois como entidades distintas, com a ligação explícita, e o ClickUp recebe o setor responsável.

Também há três empresas no mesmo SAC: ARTMAQ (251), AISA (130) e WORK (19). Tratar como marca ou empresa de origem, a confirmar.

A decisão sobre a estrutura final de setores fica para o dono e o gestor. Pergunta aberta: o setor numerado corresponde a qual área física ou equipe?
