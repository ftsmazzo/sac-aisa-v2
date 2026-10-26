# Decisões do MVP — SAC AISA v2

> Documento para apresentar o MVP ao dono e montar a proposta com orçamento.
> Depende de: [PRD](PRD.md), [TRD](TRD.md), [Fluxo do App](FLUXO-APP.md), [UI/UX](UIUX.md), [Esquema Backend](ESQUEMA-BACKEND.md), [Plano de Implementação](PLANO-IMPLEMENTACAO.md), [IA](IA.md), e o levantamento das APIs do Mercado Livre e da Shopee (22/10/2026).

**Data**: 22/10/2026. Atualizado em 26/10/2026 com o que entrou na `main` depois que o trabalho saiu do Claude (seção 9).

**Como ler os selos**

| Selo | Significa |
|---|---|
| **Pronto** | Está na `main`. Funciona com os dados reais importados ou, no modo treino, só com os dados fictícios. |
| **Simulado** | O código é o da captura real. Na demonstração os casos são fictícios e a reclamação nasce marcada como treino. A conta real ainda pede credencial e autorização. |
| **Fatia 1** | A triagem por IA sugere causa, setor e a pergunta. Quem grava é a pessoa. O tom inicial é exemplo de teste, para o dono validar. A resposta final com casos parecidos ainda não existe. |
| **Não existe** | Ainda não foi construído (seção 7). |

Onde falta dado, o texto diz "a definir" e quem informa. Este documento não traz horas, prazos nem preços.

---

## 1. Resumo de uma página

**A promessa: a reclamação certa, no setor certo, no tempo certo.**

O SAC AISA v2 recebe a reclamação, direciona ao setor responsável, abre o card no ClickUp e mede cada etapa até a resposta ao cliente. O gestor e o dono passam a ver onde a reclamação trava e quanto ela custa.

**O que o MVP mostra hoje**

- Login com perfis (operação, responsável de setor, gestor, administrador) e as 402 reclamações reais do sistema atual, importadas.
- Lista, ficha, cadastro e edição, com registro de quem mudou o quê.
- Análise do setor, fila por urgência e alertas de demora e de custo.
- Card no ClickUp quando a reclamação é iniciada no setor. Na triagem, ou aguardando o cliente, não há card e isso não aparece como erro.
- Relatórios com impressão (A4) e CSV, relatório visual e impressão de várias fichas. A tela inicial é o painel de decisão (prazo, setor e o que está em movimento), no recorte da marca escolhida.
- Tema e logo por marca (AISA, ARTMAQ, ARAUCA). A troca de marca aplica cor e logo na hora. No cabeçalho, cada logo usa a própria proporção.
- Triagem enxuta de 13 campos, solução registrada pelo setor, sete estados da jornada, relógio por etapa, setores e marcas por usuário e prazo do marketplace.
- Modo treino com dados fictícios, isolado das 402 reclamações reais, e marketplace simulado do Mercado Livre e da Shopee. O caso inventado entra em Triagem com pedido, SKU, texto, prazo, comprador e valor.
- Triagem por IA na ficha: sugere causa, setor e a pergunta, com botão Copiar. Não grava sozinha. O padrão de tom é exemplo de teste.

**O que o MVP ainda não faz**

Resposta final pela IA com casos parecidos, autorização das contas reais dos canais, WhatsApp, fotos enviadas pela operação e o filtro cruzado em que clicar num gráfico filtra os demais (seção 7). Dois pontos do Mercado Livre ainda são suposição e pedem conferência no console: anexos e a assinatura do aviso.

**O que precisamos do dono** para ir da demonstração à execução real: metas e indicadores, textos e exemplos para a IA, acessos às contas (ClickUp, Mercado Livre, Shopee, IA), regras de dados pessoais, pessoas e a forma da virada (seção 4).

---

## 2. O que já funciona, por etapa da jornada

### Captura

| Item | Selo |
|---|---|
| Reclamação digitada pela operação (site, marketplace, WhatsApp como origem informada) | Pronto |
| Importação das 402 reclamações, 22 causas, regras e usuários do sistema atual | Pronto |
| Dado do comprador e prazo do marketplace no cadastro | Pronto |
| Reclamação chegando sozinha do Mercado Livre e da Shopee | Simulado. O mesmo código lê o canal real com a URL base vazia, credenciais cadastradas e conta autorizada |
| Credenciais do Mercado Livre e da Shopee guardadas e testadas pelo administrador | Pronto o cadastro e o teste. A autorização da conta e da loja ainda é do dono |

### Triagem

| Item | Selo |
|---|---|
| Cadastro e edição com setor, causa e situação calculados pelo servidor | Pronto |
| Triagem enxuta: 13 campos em quatro grupos (Entrada, Consumidor, O caso, Encaminhamento) | Pronto |
| Estados Triagem e Aguardando cliente, com relógio que pausa enquanto se espera o cliente | Pronto |
| Sugestão de causa, perguntas ao comprador e mensagem com Copiar | Fatia 1 |

### Setor

| Item | Selo |
|---|---|
| Direcionamento pela causa, com troca manual | Pronto |
| Troca de setor com autor, de/para e motivo na auditoria; ficha mostra "sugerido pela regra" ou "trocado à mão" | Pronto |
| Fila do setor por urgência e botão "Assumir" | Pronto |
| Análise do setor, com a decisão de retorno do produto | Pronto |
| Solução, laudo, peça, garantia e data de ação registrados pelo setor (a operação recebe recusa do servidor) | Pronto |
| Setores e marcas por usuário; o responsável de setor vê só o que é dele | Pronto |
| Alertas de 7, 3 e 2 dias e de custo acima de R$ 500 | Pronto |
| Alertas novos: setor sem receber, solução sem finalização, prazo do marketplace | Pronto |

### Fechamento

| Item | Selo |
|---|---|
| Sete estados: Triagem, Aguardando cliente, Encaminhada ao setor, Recebida pelo setor, Em tratativa, Resolvida no setor técnico, Finalizada no SAC | Pronto |
| Quem pode cada passagem conferido no servidor; reabertura com motivo | Pronto |
| Jornada na ficha: linha do tempo com autor e data, seis etapas e o próximo passo | Pronto |
| Tempos por etapa e histórico de estados na ficha | Pronto |
| Resposta final ao cliente, no tom da empresa e com casos parecidos | Não existe. A pergunta ao comprador, com Copiar, está na fatia 1 |

### ClickUp

| Item | Selo |
|---|---|
| Card quando a reclamação sai da triagem ou de aguardando o cliente; fila de nova tentativa; erro visível | Pronto. Antes disso não entra na fila |
| Atualização do card a cada movimento no SAC, inclusive a lista quando o setor muda e o workspace está gravado | Pronto |
| Webhook no workspace já em uso, com assinatura validada: mover o card atualiza a situação aqui | Pronto. O botão é "Ativar webhook". Não cria Space nem lista |
| Um status do card por estado da jornada (mapa configurável); mudança no card só vale para Recebida, Em tratativa e Resolvida, para a frente | Pronto. O status precisa já existir na lista |
| Trazer listas e status do ClickUp que a empresa já usa, gravar o mapa setor → lista e excluir a conexão | Pronto |
| Botão "Tentar de novo" (um card ou todos) | Pronto |
| Jeito antigo: criar o Space "SAC AISA", uma lista por setor e os status | Pronto, recolhido na tela. Não é o caminho da conta em uso |
| Card dos planos de ação | Não existe |

### Indicadores

| Item | Selo |
|---|---|
| Totais, tempo médio por etapa, ocorrências por setor e por produto, bancada × tipo de ocorrência, com filtro por período, marca, setor e causa | Pronto |
| Relatório visual (cartões, barras, mapa de calor bancada × tipo) | Pronto |
| Tempos por estado e relógio até recebimento, tratativa e finalização | Pronto |
| Tela inicial com prazo, setor e o que está em movimento, no recorte da marca | Pronto |
| Filtro cruzado (clicar num gráfico filtra os demais) e plano de ação com efeito | Não existe (fase 4 completa e fase 7) |

### Impressão e relatório

| Item | Selo |
|---|---|
| Ficha da reclamação em A4, com a logo da marca | Pronto |
| Relatório em A4 e CSV | Pronto |
| Imprimir várias fichas de uma vez (selecionadas ou todas do filtro, até 60) | Pronto |

### Base e segurança

| Item | Selo |
|---|---|
| Login com hash forte (Argon2id) e cookie httpOnly; perfil conferido no servidor em toda ação | Pronto |
| Tema e logo por marca, seletor no cabeçalho, troca na hora e quadro da logo na proporção de cada marca | Pronto |
| Tela de integrações do administrador com segredos cifrados | Pronto |
| Modo treino com dados de demonstração, isolado dos dados reais | Pronto. A visão de treino vale só para administrador e gestor |
| Monitoramento de erros (GlitchTip) e de disponibilidade (Uptime Kuma) | Pendente. Precisa de `SENTRY_DSN` e do monitor em `/health` |

---

## 3. Decisões tomadas pela equipe para viabilizar o MVP

Cada decisão pode ser revertida. A coluna "Quando reverter" diz o sinal que pede a mudança.

| # | Decisão | Motivo | Quando reverter |
|---|---|---|---|
| 1 | **Reclamação antiga com data de ação virou "Finalizada no SAC"**, e não "Resolvida no setor técnico". Vale na migração e na importação. | A regra do sistema atual diz que data de ação significa resolvida. Esse caso já passou pelo SAC; "Resolvida no setor técnico" é um passo anterior e distorceria o tempo até a finalização. | Se o gestor quiser ver o histórico antigo no passo do setor, ou se a conferência com o sistema atual mostrar divergência de totais. |
| 2 | **Lista de marcas vazia no cadastro do usuário significa todas as marcas.** Só limita o responsável de setor; operação, gestor e administrador veem tudo. | Evita que um cadastro esquecido tranque o usuário fora de tudo e deixa a regra simples de explicar. | Se a empresa quiser operação separada por marca. |
| 3 | **Criamos o campo de prazo do marketplace e a tela de usuários** (`/admin/usuarios`, com setores e marcas). Não existiam. | O prazo do canal (ex.: `due_date` no Mercado Livre) corre à parte do prazo interno e precisa de alerta. Sem tela, o administrador não tinha como definir quem vê o quê. | Se a captura real do canal trouxer o prazo já preenchido e o campo digitado ficar redundante. |
| 4 | **Gestor e administrador só informam motivo fora do fluxo normal.** Setor e SAC andam só pelo caminho previsto. | Quem precisa corrigir um caso não fica travado, e o motivo fica na auditoria. | Se o uso mostrar excesso de passagens fora do fluxo (sinal de que o fluxo não serve). |
| 5 | **Os status do ClickUp precisam existir na lista.** Se o ClickUp recusar o nome, o erro fica no card e a fila tenta de novo. O botão "Tentar de novo" existe. O caminho da conta em uso traz os status que a lista já tem; não cria status. | O ClickUp só aceita status que a lista já tem; a recusa não pode perder a reclamação nem travar o registro. | Se a empresa pedir que o sistema crie status. Hoje isso só existe no jeito antigo, recolhido, para uma conta de teste vazia. |
| 6 | **A linha do tempo antiga da ficha convive com o novo bloco de tempos e o histórico de estados.** | A linha do tempo (PR 25) vem da auditoria e serve também para reclamação importada sem histórico. O bloco de tempos (PR 27) vem do histórico de estados. Os dois PRs andaram em paralelo. | Quando o histórico de estados cobrir todas as reclamações: unificar numa só visão. |
| 7 | **A tela de usuários não tem teste de interface.** A regra por trás tem teste; a tela só foi conferida no código. | Prazo do MVP. Tela de uso raro, só do administrador. | Antes da virada. Incluir teste de interface na fase 8. |
| 8 | **Segredos de integração ficam cifrados na tela do administrador** (AES-256-GCM). Só a chave de cifra, `INTEGRACOES_CHAVE`, vai no ambiente. | O administrador troca token sem pedir deploy, e o segredo não fica no Git, em log ou na resposta da API. | Se a empresa exigir cofre de segredos próprio. |
| 9 | **A IA só propõe; quem grava é a regra do sistema.** Nenhuma sugestão muda causa, setor, situação ou resposta sozinha. Sem IA ou acima do limite de custo, o sistema segue pelas regras. | Regra do projeto (`CLAUDE.md`). Um erro do modelo vira, no pior caso, uma sugestão que a pessoa recusa. | Só com prova de acerto em conjunto de teste e decisão do dono; e mesmo assim para uma etapa de cada vez. |
| 10 | **Dados do comprador ficam fora do modelo de IA.** O modelo recebe texto, SKU, produto e histórico; nome, e-mail, telefone e pedido ficam de fora. O nome entra na resposta por troca de campo no servidor, depois da IA. | LGPD: a IA não recebe dado pessoal além do necessário. | Só se a decisão de LGPD da empresa permitir outra regra. |
| 11 | **Botão Copiar em vez de envio automático.** A atendente copia a pergunta ou a resposta e cola no chat do marketplace. | Resposta automática ao canal está fora do escopo do PRD; a pessoa é o último filtro. | Quando a IA provar qualidade e o canal permitir resposta pela API. É fase "Depois". |
| 12 | **Modo treino isolado dos dados reais.** Dados de demonstração e simulador de canal, sem tocar nas 402 reclamações. | Permite demonstrar e treinar a equipe sem expor cliente nem poluir os indicadores. | Quando as capturas reais existirem, o simulador vira ferramenta de treino e teste. |
| 13 | **Estados e responsáveis por transição definidos no domínio, com teste.** SAC: Triagem, Aguardando cliente, Encaminhar, Finalizar. Setor: Receber, Em tratativa, Resolvida. Reabertura é evento e volta a "Encaminhada ao setor". | Regra de negócio fica em um lugar só e o servidor recusa o que não é permitido. | Se o dono quiser mais ou menos estados. |
| 14 | **"Complete" no ClickUp vale como "Resolvida no setor técnico", nunca como "Finalizada".** Mover o card para trás, ou para um estado do SAC, é recusado e o card volta. | Quem finaliza é o SAC, depois de responder o cliente. O setor não fecha o caso sozinho. | Se a empresa quiser que o setor feche direto. |
| 15 | **Relógio interno pausa em "Aguardando cliente"; o prazo do marketplace corre à parte, em dias corridos.** | Esperar o cliente não é demora do setor. O prazo do canal não pausa. | Se o dono definir outro critério de "demora" (seção 4.A). |
| 16 | **Triagem enxuta: 13 campos.** Saem da triagem causa, devolução, recebimento, data de ação, laudo, solução, peça, garantia, procedência e custo. Vão para o setor. | O SAC não deve preencher o que só o setor sabe. Quanto menos campos, menos erro e menos tempo. | Se a operação precisar de algum desses campos na entrada. |
| 17 | **Bancada de origem fica na triagem; garantia, procedência e peça vão para o setor.** "Observação da triagem" é livre. O motivo da troca de setor tem até 200 caracteres. | Escolha de produto sem o cliente (PR 25), a confirmar. | Quando o gestor confirmar ou corrigir. |
| 18 | **Bancada de origem e setor responsável são entidades distintas.** A análise cruza bancada com a origem da causa e não culpa a bancada por padrão. | Um defeito pode vir de componente, lote ou projeto. Confirmado com o cliente (PRD seção 9). | Se a estrutura final de setores mudar (seção 4.A). |
| 19 | **O sistema novo roda isolado do atual.** Banco, fila, API e web próprios; o sistema atual segue no ar. Os dados entram por importação, nunca por commit. | Risco menor durante a construção e nenhum dado de cliente no repositório. | Na virada (fase 8). |
| 20 | **Valores de alerta herdados do sistema atual** (2, 3 e 7 dias; R$ 500; 24 h): sugestão, não decisão. | O dono ainda não os validou. Servem de ponto de partida e são configuráveis. | Quando o dono aprovar metas (seção 4.A). |
| 21 | **A ordem das fases é sugestão.** Pedido de acesso às APIs dos marketplaces começa já, sem esperar o código. | A aprovação das plataformas costuma demorar e não depende de código. | Se o acesso for negado: a captura cai para importação manual ou por e-mail. |

---

## 4. O que o dono precisa decidir e informar para a execução real

Cada item diz por que importa e quem pode responder. "Quem pode responder" é sugestão; o dono indica quem na empresa responde.

### A. Negócio

| # | Item | Por que importa | Quem pode responder |
|---|---|---|---|
| A1 | Metas e indicadores aprovados (quais números o dono quer ver e com que meta) | O painel só é entregue com os indicadores aprovados. Hoje os valores são sugestão do sistema atual. | Dono |
| A2 | Critério de "demora" por etapa (até receber, tratativa, até finalizar) | Define quando o alerta dispara. Alerta ruidoso é ignorado; tardio não serve. | Dono e gestor |
| A3 | Prazos internos (meta de 2 dias, alerta de 3 e 7 dias, 24 h sem receber ou finalizar) | Substituem os valores herdados. São configuráveis, mas alguém precisa decidir. | Gestor |
| A4 | Lista final de setores responsáveis e de bancadas | O direcionamento e o ClickUp dependem dela. | Gestor e responsáveis de setor |
| A5 | WORK é marca? (19 de 402 reclamações) | Muda o seletor de marca, o tema e os relatórios. Hoje WORK aparece só em texto. | Dono |
| A6 | Confirmar as escolhas de produto sem o cliente (itens 14 e 17 da seção 3) | Estão no sistema como sugestão. | Gestor |

### B. Conteúdo para a IA

| # | Item | Por que importa | Quem pode responder |
|---|---|---|---|
| B1 | Missão, valores, metas e tom de voz da empresa; o que dizer e o que evitar; assinatura por canal; se há tom por marca | Dão o tom às perguntas e às respostas. Sem isso a resposta fica genérica. | Dono e comercial |
| B2 | De 5 a 15 exemplos de resposta aprovados, por tipo de caso (falta de item, avaria, voltagem, atraso, defeito), sem dado de cliente | É o que a IA imita e o que o gestor usa para avaliar a qualidade. | Gestor e SAC |
| B3 | Perguntas obrigatórias por categoria de produto, com texto, tipo de resposta, se é obrigatória e um exemplo. Ex.: produto elétrico, "qual a voltagem da tomada?"; avaria, "onde estava o dano na caixa?" (exemplos ilustrativos, não aprovados) | A IA aponta o que falta para a reclamação ficar correta com base nessa lista. | Gestor e responsáveis de setor |
| B4 | Quais famílias contam como elétricas e quais como montáveis | Define quais perguntas valem para cada produto. | Engenharia e qualidade |
| B5 | Catálogo com especificações (voltagem, potência, medidas), manuais e problemas conhecidos, começando pelos mais reclamados e pelos elétricos | O catálogo importado tem 316 linhas e não traz isso. Sem esses dados a IA erra o produto. | Engenharia e qualidade |
| B6 | Política de soluções por tipo de caso: o que se oferece (orientar, peça, troca, reembolso), em que condição, quem aprova, o que nunca prometer | A resposta final fica dentro do que a empresa aceita. | Dono e gestor |
| B7 | Responsabilidade de cada setor em uma frase | Serve para explicar o direcionamento. | Responsáveis de setor |
| B8 | Patamar de acerto exigido para ligar a triagem por IA | A IA só liga se vencer as regras atuais. O dono diz quanto é suficiente. | Dono e gestor |

### C. Acessos

| # | Item | Por que importa | Quem pode responder |
|---|---|---|---|
| C1 | ClickUp definitivo: espaço, usuário de serviço e token | O card nasce na conta da empresa, não num teste. Usuário de serviço evita que o card pare se alguém sair. | Dono e quem administra o ClickUp |
| C2 | Aplicativo do Mercado Livre, criado com a conta da empresa. Quem autoriza precisa ser administrador da conta vendedora (operador não autoriza) | Sem isso não há captura. | Dono (titular da conta) |
| C3 | Aplicativo da Shopee em open.shopee.com e a aprovação da empresa pela plataforma. A autorização é do dono da loja; subconta não autoriza | A aprovação é o portão para o app ir ao ar e pode demorar. Pedir já. | Dono (titular da loja) |
| C4 | Chave de IA (OpenRouter) e orçamento mensal de IA | A IA tem limite diário de custo configurável. Alguém precisa fixar o teto. | Dono |
| C5 | Domínio do sistema | Endereço definitivo, HTTPS e URLs de retorno dos marketplaces. | Dono |
| C6 | Backup: onde guardar, por quanto tempo e quem restaura | O sistema atual faz backup diário; o novo precisa do mesmo cuidado. | Dono e quem mantém o sistema |
| C7 | Logos em vetor das marcas (se existirem) | Hoje são imagens; o código não muda para trocá-las. | Marketing |

### D. Conformidade

| # | Item | Por que importa | Quem pode responder |
|---|---|---|---|
| D1 | Retenção dos dados do comprador (por quanto tempo guardar nome, e-mail, telefone) e do registro de IA | A LGPD exige prazo e base legal. Hoje não há decisão. | Dono, com apoio jurídico |
| D2 | Aceite de enviar a um provedor de IA texto sem dado pessoal | O texto vai a terceiro, ainda que limpo. | Dono, com apoio jurídico |
| D3 | O que cada canal permite de contato fora do chat do marketplace. **A confirmar**: não verificamos nas regras de cada canal se é permitido chamar o comprador por WhatsApp ou e-mail. | Define se o WhatsApp entra e em que condição. | Jurídico e responsável de cada canal |
| D4 | Limite de caracteres e formato das mensagens de cada marketplace | A pergunta ao comprador precisa caber no chat. | SAC |

### E. Pessoas

| # | Item | Por que importa | Quem pode responder |
|---|---|---|---|
| E1 | Usuários por setor e por marca (quem vê o quê) | Alimenta a tela de usuários. | Gestor |
| E2 | Quem administra o sistema | O administrador cuida de usuários, integrações e cadastros. | Dono |
| E3 | Quem mantém o código depois do lançamento | Define o tipo de manutenção e o custo recorrente. Hoje a definir. | Dono |

### F. Virada

| # | Item | Por que importa | Quem pode responder |
|---|---|---|---|
| F1 | Período em paralelo com o sistema atual | A virada pede dois ciclos completos sem divergência de números. Duração a definir. | Dono e gestor |
| F2 | Critério para desligar o sistema atual | Evita desligar cedo demais ou manter dois sistemas para sempre. | Dono e gestor |
| F3 | Data de lançamento ou demonstração oficial | Hoje a definir. | Dono |

---

## 5. Base para o orçamento

**Sem horas e sem preços.** A complexidade é relativa (P pequena, M média, G grande), estimativa da equipe, sujeita a revisão depois do estudo das APIs.

### 5.1 Fases do plano

| Fase | Entrega | Complexidade | Situação |
|---|---|---|---|
| 1. Base de dados e acesso | Esquema, API, login e perfis, importação do sistema atual, domínio com testes, sistema de design e tema por marca | M | Feita |
| 2. Núcleo da reclamação | Lista, ficha, cadastro e edição, análise do setor, fila, alertas, estados e relógios, triagem enxuta, usuários por setor e marca; **falta: fotos enviadas pela operação** | M | Feita, salvo as fotos |
| 3. ClickUp | Card quando a reclamação é iniciada, webhook no workspace, listas e status já existentes, fila com o nome do setor; **falta: card dos planos** | M | Quase toda feita |
| 4. Painel de indicadores | Tela inicial com prazo, setor e movimento; relatórios e bancada × ocorrência. **Falta o filtro cruzado** (clicar num gráfico filtra os demais) | G | Começada |
| 5. IA no registro | Jornada guiada, rascunho, taxa de aceite, registro de custo, limite diário | M | Fatia 1 feita: triagem, pergunta, registro e limite. A jornada guiada completa não |
| 5a. Triagem por IA | Perguntas obrigatórias, apontar o que falta, Copiar, causa e setor sugeridos | G | Fatia 1 feita. O padrão inicial é exemplo de teste |
| 5b. Conhecimento da empresa | Casos resolvidos e busca, resposta sugerida no tom da empresa, aviso de repetida, resumo semanal | G | Não começou |
| 5c. Padrões e fotos | Padrão bancada × ocorrência pela IA, descrição de defeito pela foto | M | Depende de painel, fotos e 5b |
| 6. Marketplaces | Captura do Mercado Livre e da Shopee, fila de aviso e de busca, reclamação em Triagem | G | Código feito, com marketplace simulado para a demonstração. Falta autorizar as contas reais. Anexos e assinatura do aviso do Mercado Livre ainda são suposição |
| 7. Melhoria contínua | Plano de ação com acompanhamento do efeito | M | Não começou |
| 8. Virada | Execução em paralelo, conferência, migração final, desligar o sistema atual | M | Depois das demais |
| Depois | WhatsApp, Magalu, PWA, resposta automática ao marketplace | a definir | Fora do MVP |

O MVP do plano são as fases 1 a 4. A triagem por IA e a captura dos marketplaces já têm uma primeira entrega; a resposta com casos parecidos e a conta real ainda vêm em seguida.

### 5.2 O que já está construído e reduz o custo

- Base completa: login, perfis, importação de dados reais, cadastros, tema por marca, impressão e relatórios.
- Regras de negócio testadas (situação, custo, direcionamento, estados e relógios).
- ClickUp de ponta a ponta na conta que a empresa já usa: traz listas e status, liga o webhook no workspace e cria o card quando o setor começa.
- Tela inicial de decisão e relatórios, com a tabela de bancada na largura do bloco.
- Estudo das APIs do Mercado Livre e da Shopee feito, e o código da captura junto com o marketplace simulado para demonstrar sem a conta real.
- Triagem por IA na ficha, com registro de custo, limite diário e padrão inicial de teste. A arquitetura completa está em `IA.md`.
- Tela de integrações do administrador e estrutura de auditoria.
- CI com tipo, lint, teste e build; deploy automático no EasyPanel.

### 5.3 Dependências de terceiros que podem atrasar

- Aprovação da Shopee para o aplicativo (portão da fase 6). Pedir já.
- Conta administradora do Mercado Livre para autorizar o aplicativo.
- Token do ClickUp de um usuário de serviço e as listas que a empresa já usa (o sistema não cria o Space no caminho normal).
- Metas, indicadores e critério de demora aprovados pelo dono (fase 4).
- Exemplos de resposta, perguntas obrigatórias, catálogo com especificações e política de soluções (fases 5a e 5b).
- Decisão de LGPD (retenção e IA).
- `pgvector` no Postgres do EasyPanel e modelo de embedding no OpenRouter, ainda sem confirmação (fase 5b; há alternativa sem extensão).
- Logos em vetor e paleta definitiva das marcas (opcional).

### 5.4 Custos recorrentes a cotar

Valores a definir; nenhum foi informado.

| Item | Observação |
|---|---|
| Hospedagem (EasyPanel, banco, fila) | Mesmo padrão do sistema atual. Valor a definir com quem hospeda. |
| IA por uso (OpenRouter) | Cobrada por consumo. Há limite diário configurável. Valor a definir com o orçamento mensal (C4). |
| ClickUp | Plano da empresa; quantidade de usuários a definir. |
| Domínio | Valor a definir. |
| Monitoramento (GlitchTip, Uptime Kuma) | Pendentes de ligar. Valor a definir conforme onde rodam. |
| Manutenção e suporte pós-lançamento | A definir, conforme E3. |

### 5.5 Premissas

- O escopo do PRD não muda sem passar por `docs/PRD.md` e `docs/TRD.md`.
- Os marketplaces oferecem as APIs descritas no levantamento e liberam o acesso à AISA.
- O dono e o gestor respondem à seção 4 a tempo de cada fase.
- Mercado Livre e Shopee entram no MVP; Magalu (5 de 402 reclamações) fica para depois.
- O sistema atual segue em uso até a virada.

### 5.6 Riscos

| Risco | Efeito | Resposta |
|---|---|---|
| Histórico fraco: parte das 402 causas foi inferida pelo importador | A triagem por IA pode nascer com acerto modesto | Linha de base honesta, sugestão com confiança, conjunto de teste que cresce com o uso |
| Aprovação do marketplace demora ou é negada | Captura atrasa ou cai para importação manual | Pedir já; manter o cadastro manual funcionando |
| API da Shopee: a janela máxima de datas da busca não está publicada de forma estável | Estimativa da fase 6 pode mudar | Conferir o contrato no console assim que o app existir |
| Regras de contato do canal ainda não verificadas | O WhatsApp pode não valer para contato com comprador | Confirmar com o canal (D3) |
| Mudança no sistema atual durante a construção | Reimportação na virada | Congelar o esquema ou prever migração final |
| Dado pessoal escapa na limpeza do texto da IA | Exposição de comprador | Lista de campos permitidos, nome e contato fora do prompt, taxa de vazamento medida; risco reduzido, não zero |
| Parte das telas foi conferida por teste, sem ensaio no navegador com o banco real | Falha visual na primeira demonstração | Ensaiar o roteiro em `/admin/roteiro-treino` antes de apresentar |
| Sem processo hoje, a linha de base dos indicadores é fraca | Meta mal calibrada | Rodar em paralelo e ajustar metas depois de um ciclo |

---

## 6. Roteiro de demonstração (10 minutos)

O texto que se diz ao dono está na tela `/admin/roteiro-treino`. São 9 passos, 10 minutos, com o modo treino ligado. Perfil de entrada: gestor ou administrador.

1. Preparar o treino e carregar os dados fictícios.
2. Visão geral do início.
3. A lista nos sete estados.
4. Simulação de canais: novo caso do Mercado Livre e da Shopee, aviso duplicado, aviso perdido e a lista do que falta para a conta real. Abrir a reclamação criada e clicar em Analisar.
5. Ficha, relógios e prazo do marketplace.
6. Fila do setor e o botão Assumir.
7. Alertas.
8. Relatórios e custo.
9. Desligar o modo treino. Apagar os dados de treino tira só o que é fictício.

A IA sugere e a pessoa copia. O tom inicial está marcado como exemplo de teste. Para a conta real: desligar o simulado, deixar a URL base vazia, cadastrar as credenciais e autorizar a conta do Mercado Livre e a loja da Shopee.

---

## 7. O que ainda não está pronto

Sem rodeios:

- **Resposta final pela IA, com casos parecidos: existe como sugestão.** A ficha pede a sugestão, a pessoa revisa e grava. Sem chave, a ficha segue. A busca é por palavras em comum, sem pgvector. Nome, e-mail, telefone e pedido não entram no prompt. A triagem por IA continua: sugere causa, setor e a pergunta, com Copiar, e não grava.
- **Conta real do Mercado Livre e da Shopee: não autorizada.** Isso é do dono. O mesmo cliente fala com a API real quando o modo simulado está desligado. O anexo do Mercado Livre usa o download documentado (`filename`, sem URL inventada). O aviso usa o manifesto `id;request-id;ts` no header `x-signature`.
- **WhatsApp: não existe** no sistema novo. O sistema atual tem, parcialmente.
- **Fotos enviadas pela operação: existem** na ficha, com tipo e tamanho conferidos (JPEG, PNG ou WebP, até 5 MB). A URL que o canal já manda continua.
- **Filtro cruzado: existe nos relatórios.** Um clique no gráfico filtra os outros gráficos e a lista. A tela inicial segue com prazo, setor e o que está em movimento.
- **Plano de ação com efeito: existe.** Se a ocorrência não caiu, o plano reabre. O card do plano vai ao ClickUp pela lista já gravada. Reclamação de treino não vai, salvo o interruptor já existente.
- **ClickUp:** o card da reclamação, a fila, o "Tentar de novo", a troca de lista quando o setor muda, o webhook no workspace e o card do plano existem. O caminho normal traz as listas que já existem. Criar Space fica no jeito antigo, recolhido.
- **Alertas** de prazo, custo e fila são gravados quando a tela do gestor os abre, e somem quando a regra já não confirma. Não saem por WhatsApp.
- **Erros:** com `SENTRY_DSN`, o GlitchTip recebe. Sem DSN, a aplicação sobe e não envia erro para fora. `GET /health` continua `{status:"ok"}`, sem dado do negócio, para o monitor.
- **Tela de usuários sem teste de interface.**
- **Ensaio no navegador com o banco real:** ainda é o passo antes de apresentar. O roteiro está em `/admin/roteiro-treino`.
- **Fim do sistema atual (virada):** nada feito. Depende de todas as fases.
- **Retenção de dados, LGPD, prazos, metas e orçamento**: a definir.

---

## 8. Slides sugeridos

**1. SAC AISA: a reclamação certa, no setor certo, no tempo certo**
- Uma reclamação entra, chega ao setor responsável e é medida até a resposta
- Card no ClickUp, alertas de demora e relatórios para o dono
- Marcas AISA, ARTMAQ e ARAUCA no mesmo sistema

**2. O problema de hoje**
- A reclamação demora a chegar ao setor certo
- Preenchimento manual, sem padrão
- Ninguém é avisado quando algo trava
- Métricas que não bastam para decidir

**3. A jornada em sete estados**
- Triagem, Aguardando cliente, Encaminhada, Recebida
- Em tratativa, Resolvida no setor técnico, Finalizada no SAC
- Cada passo tem dono, data e autor registrados
- O card no ClickUp acompanha cada estado

**4. O que já funciona**
- 402 reclamações reais importadas, lista, ficha e edição
- Análise do setor, fila, alertas e ClickUp de ponta a ponta
- Modo treino e marketplace simulado, sem misturar com o dado real
- Relatório, impressão em A4 e tema por marca

**5. O que o dono vê**
- Tempo em cada etapa, com o relógio pausado quando se espera o cliente
- Prazo do marketplace separado do prazo interno
- Bancada × tipo de ocorrência, sem culpar a bancada por padrão
- Custo e reclamações paradas

**6. Como a IA ajuda agora**
- Na ficha, aponta causa, setor e o que falta, e redige a pergunta
- A pessoa confirma e copia. A IA não grava
- Dados do comprador ficam fora do modelo
- A resposta final, com casos parecidos, é sugestão: a pessoa revisa e grava. O tom atual ainda é exemplo de teste

**7. Decisões que tomamos**
- Reclamação antiga com data de ação: Finalizada no SAC
- Marcas vazias no usuário significam todas
- Gestor e administrador informam motivo fora do fluxo
- Segredos cifrados; IA só propõe; modo treino isolado

**8. O que falta construir**
- Autorizar as contas reais do Mercado Livre e da Shopee
- WhatsApp, Magalu, resposta automática ao marketplace e desligar o sistema atual

**9. O que precisamos do dono**
- Metas, indicadores e o que é "demora"
- Exemplos de resposta, perguntas por produto, política de soluções
- Acessos: ClickUp, Mercado Livre, Shopee, IA
- LGPD, pessoas e o plano da virada

**10. Como será o orçamento**
- Por fase, com complexidade relativa
- Parte já construída reduz o custo
- Dependências de terceiros: aprovação das plataformas
- Recorrentes: hospedagem, IA por uso, ClickUp, domínio, monitoramento (valores a definir)

**11. Próximos passos**
- Pedir já o acesso às APIs dos marketplaces
- Dono responde à seção de decisões
- Proposta com orçamento por fase
- Definir o período em paralelo e a data de lançamento (a definir)

---

## 9. O que entrou depois que o trabalho saiu do Claude

De 23 a 26/10/2026, na `main`, depois dos documentos de 21 e 22/10. O que já estava escrito acima e contradizia isto foi corrigido nas seções 2, 3, 5 e 7.

### ClickUp passa a usar a conta que já existe

O caminho da tela é: excluir a conexão de teste, colar o token, gravar, buscar os workspaces, trazer listas e status, conferir a lista de cada setor (o nome igual já vem marcado) e gravar de novo. Nada disso cria Space, lista ou status. O card usa a lista gravada daquele setor; se não houver, uma lista do espaço cujo nome é o do setor, e por último a lista padrão. Sem nenhuma, a fila diz o nome do setor e pede para gravar a lista que já existe. Não se cria card à mão no ClickUp.

O webhook liga no workspace (`POST /team/{id}/webhook`, evento `taskStatusUpdated`, sem `space_id`). O botão é **Ativar webhook**. Recriar o webhook não recria a estrutura. **Testar fluxo** cria um card de teste, confere o status e apaga o card; se o webhook ainda não estiver ativo, essa etapa aparece como não rodada.

Criar o Space "SAC AISA", uma lista por setor e os status continua no sistema, dentro de **Jeito antigo: criar o Space de teste**. Serve para uma conta vazia. Não é o caminho da produção.

A conexão pode ser excluída. A exclusão do ClickUp também limpa as listas gravadas.

### Quando o card nasce

Reclamação em **Triagem** ou **Aguardando cliente** não gera card e não entra na fila como erro. O card é tentado quando o atendimento começa no setor (encaminhada em diante). Reclamação de treino continua fora do ClickUp, salvo se o administrador ligar "Criar cards para reclamações de treino".

Se o setor responsável mudar e o workspace estiver gravado, o card muda de lista. Sem workspace, o erro fica no card e a fila tenta de novo, sem gastar a tentativa. **Tentar de novo** vale para um card ou para todos.

### Tela

- Início: painel de decisão com prazo, setor e o que está em movimento, no recorte da marca escolhida. Clicar num gráfico para filtrar o resto ainda não existe.
- Troca de marca: logo e cor mudam na hora, sem recarregar a página.
- Logo do cabeçalho: a altura é a mesma e a largura é a da própria marca. AISA e ARTMAQ deixam de ficar numa caixa larga com faixa vazia.
- Relatório: a tabela bancada × tipo ocupa a largura do bloco.
- Integrações: o cartão abre no nome e no estado; o consumo da IA cabe no cartão; a fila nomeia o setor sem lista.
- Página **Padrão da IA**: usa a largura da tela, com recuo no cartão. Em cada pergunta, o texto fica de um lado e os selos com Editar do outro.
- Ficha: os botões são os do passo atual. Gravar o diagnóstico leva a Em tratativa. A resposta ao cliente fica em rascunho na ficha; o fechamento pede a solução.
- Usuários: gravar setor e ativar a conta chegam ao servidor. Setor e marca só são enviados para o perfil responsável de setor.

### O que isto não muda

Resposta final da IA com casos parecidos, fotos enviadas pela operação, WhatsApp, plano de ação com efeito, filtro cruzado, contas reais do Mercado Livre e da Shopee, GlitchTip, Uptime Kuma, metas do dono e a virada continuam como na seção 7.
