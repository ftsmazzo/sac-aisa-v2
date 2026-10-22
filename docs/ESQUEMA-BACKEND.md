# Esquema Backend — SAC AISA v2

> Modelagem de dados e API.
> Fonte: [x] Entrevista com usuário  [x] Leitura de código existente (sac-renato, `schema.prisma`)
> Depende de: [TRD](TRD.md)

**Data**: 21/10/2026

Tudo aqui é **sugestão aprovada com "ok"**, sem validação do dono. Nomes e campos podem mudar na implementação. O esquema parte do `schema.prisma` do sac-renato (22 tabelas) e corrige os pontos estruturais da seção 6.

## 1. Entidades principais

### Cadastros

| Entidade | Campos-chave | Relacionamentos |
|---|---|---|
| Marca | id, nome (AISA, ARTMAQ, ARAUCA, WORK a confirmar), cor, logo | tem Reclamações |
| Canal | id, nome (Site, Mercado Livre, Shopee, Magalu, WhatsApp), tipo (interno, marketplace) | tem Reclamações e CapturaCanal |
| Bancada | id, código (00 a 08, ADMIN, USINAGEM), nome, ativa | tem Reclamações. Bancada de origem do produto |
| Setor | id, nome (12 áreas: Embalagem / Expedição, Montagem, Solda, Pintura / Acabamento, Corte e Dobra, Qualidade / Engenharia, Compras, Logística, Comercial / Anúncios, Comercial / Pedidos, PCP, SAC / Pós-venda), ativo | responsável por Causas e Reclamações. Ligado a Usuários e a ClickupConfig |
| Produto | id, código (SKU), nome, família, categoria, status | tem Reclamações. De-para de SKU em `SkuDepara` |
| Causa | id, categoria, nome, **origem** (montagem, componente_lote, projeto, embalagem, transporte, venda), setorRespId, ação sugerida, ordem | direciona Reclamações. Regra manual em `RegraDirecionamento` |

### Reclamação e tratativa

| Entidade | Campos-chave | Relacionamentos |
|---|---|---|
| Reclamacao | id, protocolo, marcaId, canalId, produtoId, bancadaId, causaId (principal), setorRespId, situação (aguardando, tratativa, resolvida; calculada pelo domínio, mantida para os relatórios), **estado** da jornada (triagem, aguardando_cliente, encaminhada, recebida, em_tratativa, resolvida_setor, finalizada), estadoDesde, devolução (NA, AGUARDANDO, RECEBIDO), datas reais (abertura, ação, recebimento), **prazoMarketplace** (data limite do canal, corre à parte do relógio interno), descrição, laudo, solução, cliente (nome e cidade mínimos), pedido, rascunho (booleano), origem | tem causas extras, fotos, análise, alertas, card ClickUp |
| EstadoHistorico | reclamacaoId, de (nulo na primeira linha), para, quando, autorId, autorNome, motivo, origem (web, clickup, importacao, migracao), reabertura | **novo**. Cada mudança de estado, com data e autor. Base dos relógios por etapa. Apagar a reclamação leva o histórico junto |
| ReclamacaoCausa | reclamacaoId, causaId, primária, ordem. Até 5 | N causas por reclamação |
| ReclamacaoFoto | reclamacaoId, caminho no volume, miniatura, tamanho, descrição da IA | pertence à Reclamação |
| AnaliseSetor | reclamacaoId, setorId, produtoPrecisaVoltar (sim/não), produtoRecebidoEm, conclusão, resultado, analisadoPor, data | **novo**. Estágio 1: decisão de retorno do produto e análise antes de finalizar |
| Custo | reclamacaoId, freteEnvio, freteRetorno, valorPeça, estorno, desconto, guia (todos `Decimal`) | pertence à Reclamação. Custo total = soma |

### Melhoria (estágio 2)

| Entidade | Campos-chave | Relacionamentos |
|---|---|---|
| PlanoAcao | id, título, descrição, produtoId, causaId, bancadaId, setorRespId, status (aberto, em_andamento, concluído, cancelado), prioridade, responsável, prazo, origem (kpi, manual, recorrência), baselineInício, baselineFim | vincula N Reclamações em `PlanoReclamacao`. Tem card ClickUp |
| PlanoEfeito | planoId, janela antes, janela depois, ocorrências antes, ocorrências depois, queda %, resultado (reabrir ou encerrar) | **novo**. Mede se a ação surtiu efeito |

### Integrações e IA

| Entidade | Campos-chave | Relacionamentos |
|---|---|---|
| CapturaCanal | id, canalId, idExterno (único por canal), payload bruto (JSON), sugestão da IA (JSON), status (pendente, aceito, descartado), reclamacaoId, capturadoEm, limiteEm | **novo**. Rascunho do marketplace antes do registro. Evita duplicata pelo idExterno |
| IntegracaoConfig | chave (clickup, mercadolivre, shopee, openrouter), config (JSON, só o que não é segredo), segredos (JSON `{ nome: { cifrado, fim } }`), estado (pendente, conectado, erro), ultimoErro, testadoEm | **novo**. Conexões configuradas pelo administrador. Segredo cifrado com AES-256-GCM; ver decisão na seção 3 |
| IntegracaoCanal | canalId, tipo de autorização, expiração, ativo | **novo**. Estado da autorização OAuth de cada canal (entra com a captura, fase 6). Os tokens ficam em `IntegracaoConfig` |
| ClickupConfig | setorId, listaId | **novo**. Mapa setor → lista. A lista padrão (`listaPadraoId`) e o mapa de estados (`mapaEstados`: estado → status do card, um por estado, sem repetir status; vazio usa o padrão: triagem, aguardando cliente, encaminhada ao setor, recebida pelo setor, em tratativa, resolvida no setor técnico, finalizada no sac) ficam em `IntegracaoConfig` (`clickup`), porque valem para todos os setores. O `mapaStatus` antigo (status → situação) deixou de ser lido |
| ClickupCard | reclamacaoId ou planoId, taskId, listaId, status externo, sincronizadoEm, tentativas, ultimoErro, proximaTentativaEm, precisaSync | **novo**. Um card por reclamação ou plano. Nasce pendente (sem `taskId`) na mesma transação do registro. `ultimoErro` preenchido e `proximaTentativaEm` nulo = a fila esgotou as tentativas. `precisaSync` = o SAC mudou desde o último envio e a fila manda o estado atual ao card |
| ClickupComentario | cardId, texto, criadoEm, enviadoEm | **novo**. Comentário a postar no card (análise do setor, devolução recebida). Sai pela mesma fila e na ordem; `enviadoEm` nulo = pendente |
| ClickupEvento | taskId, tipo, payload, chave, repeticoes, recebidoEm, processadoEm | **novo**. Histórico dos webhooks. `chave` única = `{webhook_id}:{history_item_id}`: a mesma entrega repetida só conta em `repeticoes`, sem reprocessar |
| IaRegistro | reclamacaoId ou captura, tipo (preenchimento, classificação), sugestão, confiança, aceita (sim/não/alterada), modelo, criadoEm | **novo**. Alimenta a taxa de aceite da IA e a revisão |

### Apoio (mantidos do sistema atual)

| Entidade | Campos-chave |
|---|---|
| Usuario | id, login, nome, perfil, ativo, telefone, hash de senha. Vínculos: lista de **setores** (`UsuarioSetor`) e lista de **marcas** (`UsuarioMarca`, **nova**; lista vazia = todas as marcas) |
| PermissaoUsuario | usuarioId, chave, permitido |
| Auditoria | quando, usuário, ação, alvo, detalhe, reclamaçãoId, extra. Cada criação e edição de reclamação grava `reclamacao.criar` ou `reclamacao.editar` na mesma transação do dado, com `extra.mudancas` (campo, de, para). Texto livre (descrição, laudo, solução, observação, cliente, pedido, cidade e afins) entra só como "alterado", sem copiar o conteúdo, por causa da LGPD |
| Alerta, AlertaDestino | tipo, status, título, mensagem, reclamaçãoId, chave de deduplicação, setor, destino |
| VendaDia | sku, data, quantidade. Base para taxa de reclamação por venda |
| Config | chave, valor. Limites de alerta e metas |
| WhatsappConversa, WhatsappMensagem | fora do MVP; migrar depois |

## 2. Autenticação e autorização

- Método: login próprio, usuário e senha, hash **Argon2id**, cookie de sessão httpOnly, sem SSO. Limite de tentativas por IP e por usuário.
- Perfis: **operação**, **responsável de setor**, **gestor**, **administrador**. O sistema atual tem `master`, `gestor` e `operador`; `master` vira administrador.
- Permissão por tela (`PermissaoUsuario`), como hoje, sobre o perfil.
- Escopo: o responsável de setor só vê Reclamações, cards e planos do(s) seu(s) setor(es); sem setor vinculado, não vê nada. Operação (SAC), gestor e administrador veem todos os setores e todas as marcas (`PERFIS_TODOS_OS_SETORES` e `veTodasAsMarcas` no domínio). O responsável de setor com marcas no cadastro só vê essas marcas; sem marcas, vê todas. O escopo (setor e marca) vale nas rotas de lista, ficha, fila, alertas, relatórios, mudança de estado e opções de filtro (o seletor de marca só recebe as permitidas). A conferência é feita no servidor em toda ação, nunca só na tela.
- **Matriz de estados:** o SAC faz Triagem, Aguardando cliente, Encaminhar e Finalizar; o setor faz Receber, Em tratativa e Resolvida no setor técnico; gestor e administrador fazem qualquer passagem, com motivo fora do fluxo; reabertura (volta a Encaminhada) é do SAC e do gestor, com motivo. A regra é pura e testada em `packages/domain/src/jornada.ts`.
- **Segredos das integrações (decisão da fase 3):** token do ClickUp, segredo do webhook, Secret Key do Mercado Livre, Partner Key da Shopee e chave do OpenRouter são digitados pelo administrador em `/admin/integracoes`, e não em variável de ambiente solta. Ficam em `IntegracaoConfig.segredos`, cifrados com AES-256-GCM (IV aleatório por gravação; o nome da integração e do campo entram como dado autenticado, então um valor copiado para outro campo não abre). A chave de cifra é a única variável de ambiente: `INTEGRACOES_CHAVE`, 32 bytes em base64 (`openssl rand -base64 32`) ou 64 caracteres hexadecimais, fora do Git. Sem ela, a tela avisa e a API recusa gravar (503). A API nunca devolve segredo: só `preenchido` e a máscara `••••` + 4 últimos caracteres (segredo com menos de 12 caracteres não mostra nenhum). Trocar a `INTEGRACOES_CHAVE` invalida os segredos já gravados; o teste avisa e a pessoa informa de novo. A auditoria registra quais campos mudaram, nunca o valor.
- Fora a `INTEGRACOES_CHAVE`, o ambiente guarda só `DATABASE_URL`, `WEB_ORIGINS`, `API_URL` e, opcional, `WEB_BASE_URL` (link da ficha no card do ClickUp), `URL_PUBLICA_WEB` (base HTTPS pública da web, usada pelo assistente do ClickUp para montar a URL do webhook) e `SENTRY_DSN`.

## 3. Endpoints/ações principais

| Endpoint/Ação | Método | Autenticado? | Regra de negócio relevante |
|---|---|---|---|
| `/health` | GET | Não | Não consulta banco nem devolve dado do negócio |
| `/auth/login`, `/auth/logout` | POST | Não / Sim | Limite de tentativas; cookie httpOnly |
| `/reclamacoes` | GET | `reclamacoes.ver` | Filtros `de`, `ate` (abertura), `marca`, `canal`, `setor`, `causa` (principal ou extra), `situacao`, `busca` (número, pedido, cliente, produto, descrição, laudo); `pagina` e `porPagina` (máx. 100). Situação e custo calculados pelo domínio. Escopo por perfil. Valor inválido é 400. Produto e bancada entram depois |
| `/reclamacoes/filtros` | GET | `reclamacoes.ver` | Marcas, canais, setores, causas e bancadas para os chips e o formulário; o responsável de setor recebe só os seus setores |
| `/reclamacoes/:id` | GET | `reclamacoes.ver` | Ficha completa (custos, causas extras, análises, nº de fotos). Fora do escopo do usuário devolve 404, igual a inexistente |
| `/reclamacoes` | POST | `reclamacoes.criar` | Cria. Exige `canalId` e `descricao`; `dataAbertura` vale hoje (Brasília) se omitida e não pode ser futura. Causa (pelas palavras do texto) e setor (pela causa, com a regra manual de `RegraDirecionamento`) saem do servidor. `situacao` não é aceita: vem do domínio. Campo desconhecido, tipo errado ou valor fora do limite é 400. Devolve `{ id, numero }`. O card no ClickUp entra na fase 3 |
| `/reclamacoes/:id` | PATCH | `reclamacoes.editar` | Edição parcial; só os campos enviados mudam. `causaId` escolhido trava a causa (`causaManual`), `null` volta ao cálculo. `setorRespId` exige `reclamacoes.trocar_setor` (gestor e administrador) e marca a troca como manual; `null` volta ao setor da causa. Fora do escopo do usuário é 404. Data de ação com devolução ainda aguardando é 400. Sem mudança real, nada é gravado nem auditado. Devolve `{ id, numero, alterou }` |
| `/reclamacoes/:id/estado` | POST | `reclamacoes.ver` + matriz do domínio | Corpo `{ para, motivo? }`. A matriz decide por perfil: sem permissão é 403, passagem inexistente, setor ausente ao encaminhar, produto não recebido ou motivo faltando é 400, fora do escopo é 404. Data de ação acompanha o estado (existe em Resolvida no setor técnico e Finalizada; reabrir a limpa). Estado, histórico, auditoria e a marca de "card precisa de status novo" entram na mesma transação, e só grava se o estado ainda é o que a pessoa viu. Depois, o card do ClickUp é atualizado sem segurar a resposta |
| `/reclamacoes/:id/analise` | POST | `reclamacoes.analisar` | Registra a decisão de retorno do produto. O setor vem da reclamação, nunca do corpo; um registro por setor; reclamação resolvida ou sem setor é recusada. Precisa voltar e não chegou = devolução aguardando; com `produtoRecebidoEm` = recebido; não volta = sem devolução. Análise, ajuste da reclamação e auditoria na mesma transação |
| `/reclamacoes/:id/analise/:analiseId` | PATCH | `reclamacoes.analisar` | Edita só a análise do setor atual (a de outro setor é 404). Sem mudança não grava nem audita. Texto livre não vai para a auditoria |
| `/fila` | GET | `reclamacoes.analisar` | O que está com o setor (Encaminhada, Recebida, Em tratativa), com setor responsável, por urgência (alertas, dias em aberto, custo). Cada item traz estado, `podeAssumir` (encaminhada e quem pode receber) e `analisada`. Escopo por setor e marca |
| `/relatorios` | GET | `relatorios.ver` (gestor, responsável de setor, administrador) | Filtros `de`, `ate` (abertura), `marca`, `setor`, `causa`; valor inválido é 400. Devolve totais (por situação do domínio e custo), tempo médio por etapa (abertura até o produto chegar, até a análise do setor, tratativa, abertura até a resolução; datas fora de ordem não entram), ocorrências por setor, os 15 produtos mais frequentes e bancada × tipo de ocorrência (tipo = categoria da causa). Só a causa de origem `montagem` conta como da bancada (`atribuivelABancada`, no domínio); componente, lote, projeto, embalagem, transporte, venda ou sem origem vão para "fora da montagem". Sem bancada ou sem causa aparece como "Sem bancada" e "A classificar". Rascunho fica de fora. Escopo por setor igual ao da lista. Varre até 5.000 reclamações (as mais recentes) e avisa em `cortado`. Sem dado de cliente na resposta. Consulta pelo Prisma, parametrizada |
| `/reclamacoes/:id/fotos` | POST | Sim | Tipo e tamanho conferidos; arquivo no volume, caminho no banco |
| `/ia/rascunho` | POST | Operação+ | A IA sugere produto, bancada, causa e origem; **nunca grava**. Registra em `IaRegistro` |
| `/capturas` | GET | Operação+ | Fila de rascunhos pendentes do marketplace |
| `/capturas/:id/aceitar`, `/descartar` | POST | Operação+ | Aceitar vira Reclamação; descartar guarda o motivo |
| `/planos` | GET, POST, PATCH | Responsável, gestor | Plano de melhoria. Conclusão dispara a janela de efeito |
| `/planos/:id/efeito` | GET | Gestor | Ocorrência antes e depois da ação |
| `/painel/resumo`, `/painel/cruzamento` | GET | Gestor | Indicadores; bancada × ocorrência; tempo por setor |
| `/alertas` | GET, PATCH | Gestor | Lista e resolve alertas |
| `/webhooks/clickup` | POST | Por assinatura | Público, mas só aceita corpo com `X-Signature` válido (HMAC-SHA256 hex do corpo cru com o segredo do webhook, comparação em tempo constante). Assinatura inválida ou segredo não configurado é 401 e nada é gravado. Válido: grava `ClickupEvento`, responde 200 e processa em seguida. O status novo (`history_items[].after`) passa pelo mapa de estados (o mapa configurado primeiro; depois "Complete" e "Closed" valem Resolvida no setor técnico, nunca Finalizada). Só vale para os estados do setor, andando para a frente por Encaminhada → Recebida → Em tratativa → Resolvida no setor técnico, cada passo com as regras do sistema (produto recebido, por exemplo) e uma linha no histórico de estados (autor "ClickUp"). Mover para estado do SAC, voltar atrás, mexer antes de encaminhar ou depois de finalizar é **recusado**: nada muda na reclamação, a auditoria registra a recusa e o card volta ao status do estado atual (o card é marcado e a fila o corrige). Mudança de reclamação vai para a auditoria como "ClickUp". Evento de task desconhecida só é marcado como processado. Entrega repetida (mesma `chave`) é marcada em `repeticoes` e não é processada. O aviso do status que o próprio SAC acabou de mandar ao card (eco) é ignorado, e o que chega do ClickUp nunca volta para ele |
| `/admin/integracoes/clickup/fila` | GET | `integracoes.gerir` + perfil administrador | Fila de envio: cards pendentes, com erro (vai tentar de novo) e esgotados, com o que falta, tentativas, último erro e próxima tentativa |
| `/admin/integracoes/clickup/fila/reenviar` | POST | idem | "Tentar de novo": corpo `{ cardId }` ou vazio para todos. Zera as tentativas do que está com erro ou esgotado e agenda já. Devolve `{ reenviados }` |
| `/alertas` | GET, PATCH | `alertas.ver` (lista); gestor (resolver, ainda não feito) | Lista alertas calculados na hora pelas regras de `alertas.ts` sobre o que está em aberto, com contagem por tipo e escopo por setor. Nesta fatia não grava em `alertas`; o PATCH vem com a varredura e o envio |
| `/cadastros/*` (marcas, canais, bancadas, setores, causas, produtos) | CRUD | Administrador | Lista controlada; sem duplicata |
| `/admin/integracoes` | GET | `integracoes.gerir` + perfil administrador | Painel: um item por integração com estado, último erro, campos (texto com valor; segredo só com máscara), listas por setor e mapa de status do ClickUp, passos de configuração e `gravacaoLiberada` |
| `/admin/integracoes/:chave` | PUT | idem | Grava `{ campos, listas?, mapaStatus? }`. Segredo vazio mantém o gravado; campo desconhecido é 400; sem `INTEGRACOES_CHAVE` é 503. Volta o estado para pendente e audita |
| `/admin/integracoes/:chave/testar` | POST | idem | "Testar conexão": chama a API de fora e devolve só `{ ok, mensagem, estado }`. ClickUp: token e cada lista. Mercado Livre: credenciais do app (`client_credentials`). Shopee: assinatura do app (`get_shops_by_partner`). OpenRouter: chave. A autorização da conta vendedora (ML) e da loja (Shopee) e a captura entram na fase 6 |
| `/admin/integracoes/clickup/assistente/workspaces` | GET | `integracoes.gerir` + perfil administrador | Assistente do ClickUp. Lista os workspaces que o token gravado enxerga (`GET /team`): `{ workspaces: [{ id, nome }] }`. Sem token gravado é 400 |
| `/admin/integracoes/clickup/assistente/configurar` | POST | idem | Corpo `{ workspaceId, recriarWebhook? }`. Roda, em ordem e de forma idempotente, com o token gravado: (1) confere o workspace; (2) acha pelo nome ou cria o Space "SAC AISA" (`POST /team/{id}/space`, com os sete status do mapa em `statuses`: o primeiro `open`, o último `closed`, o resto `custom`, uma cor por status) e grava o mapa estado → status; (3) confere se o Space ficou com os status (se o ClickUp ignorou, tenta `PUT /space/{id}` e, falhando, devolve **aviso** com o nome do que criar à mão); (4) uma lista por setor ativo no Space, reaproveitando pelo nome (`POST /space/{id}/list`), e grava setor → lista; (5) webhook com o evento `taskStatusUpdated` e `space_id` do Space, apontando para `<URL_PUBLICA_WEB>/api/webhooks/clickup`. Sem `URL_PUBLICA_WEB`, usa `X-Forwarded-Host` e `X-Forwarded-Proto` (ou o host) da requisição; URL que não seja HTTPS é recusada no passo do webhook. Webhook nosso que já existe (mesma URL) é reaproveitado (o segredo vem de `GET /team/{id}/webhook`); `recriarWebhook` apaga e cria outro. O `secret` entra cifrado em `segredoWebhook` e **nunca** volta na resposta nem vai para log: só `webhook: { ativo, mascara }`. Cada passo volta como `{ id, rotulo, estado (ok, erro, aviso, pulado), mensagem }`, com a mensagem sem segredo. Falha num passo deixa o que já foi criado (Space e listas ficam gravados) e os que dependem dele voltam `pulado`; rodar de novo continua de onde parou. Guarda `workspaceId`, `spaceId`, `webhookId` e `webhookUrl` na config do ClickUp |
| `/admin/integracoes/clickup/assistente/webhook/remover` | POST | idem | Apaga o webhook no ClickUp (404 lá é tolerado), limpa `webhookId` e o segredo gravado. `{ passos }` |
| `/admin/integracoes/clickup/assistente/testar` | POST | idem | "Testar fluxo": cria um card de teste na primeira lista, move para o status de Recebida, espera até 12 s o evento `taskStatusUpdated` chegar no webhook (conferido em `ClickupEvento`) e apaga o card. `{ passos }` com um resultado por etapa |
| `/admin/usuarios` | GET, POST | `usuarios.gerir` + perfil administrador | Lista com setores e marcas e as opções (perfis, setores, marcas); cria usuário com perfil, lista de setores, lista de marcas e senha (Argon2id; a senha nunca volta nem vai para a auditoria). Responsável de setor exige ao menos um setor |
| `/admin/usuarios/:id` | PATCH | idem | Muda nome, perfil, ativo, telefone, senha, setores e marcas. O login não muda. Quem administra não desativa nem rebaixa a própria conta. Trocar a senha ou desativar encerra as sessões; setor, marca e perfil valem já na próxima chamada |
| `/config` | CRUD | Administrador | Limites de alerta |

## 4. Processamento assíncrono

Fila no Redis (BullMQ, a confirmar), com falhas registradas e nova tentativa com espera crescente:

- **Captura dos marketplaces:** a cada 10 minutos (a definir), por canal. Reconhece duplicata pelo `idExterno`.
- **Pré-tratamento pela IA:** para cada captura nova.
- **Criar card no ClickUp:** ao registrar a Reclamação (o Plano entra na fase 7). O `ClickupCard` pendente nasce na transação do registro e a primeira tentativa sai logo depois, sem segurar a resposta. A fila é no próprio banco (um laço a cada 60 s na API pega cards sem `taskId` com `proximaTentativaEm` vencida; Redis fica para quando houver mais filas). A lista é a do setor responsável; sem lista própria, a `listaPadraoId`; sem nenhuma, o erro fica registrado e tenta de novo em 1 h sem gastar tentativa. Sem token configurado nada quebra: o card fica pendente até alguém configurar. Falha do ClickUp ou da rede grava `ultimoErro` (sem o token) e `tentativas`, e a espera cresce: 1, 5, 15 min, 1 h, 3 h, 12 h; passada a última, `proximaTentativaEm` fica nulo e o erro permanece visível. O card leva número, canal, marca, descrição, produto, causa, setor e pedido; nunca nome, cidade nem contato do cliente.
- **Atualizar o card (fatia C da fase 3):** o SAC é a origem. Depois de gravar, a reclamação marca o card (`precisaSync`) e a fila manda o estado atual: título, descrição, prazo, prioridade, status (o do estado atual da jornada, pelo mapa de estados) e, se o setor responsável mudou, a lista nova (`PUT /api/v3/workspaces/{workspaceId}/tasks/{taskId}/home_list/{listaId}`, antes do status, que é o da lista nova; exige o campo `workspaceId` da integração, sem ele o erro fica visível e tenta de novo em 1 h, sem gastar tentativa). O status só é enviado se o card ainda não está no status do estado. Toda mudança de estado marca o card na mesma transação da gravação, então a fila o atualiza mesmo que a chamada logo depois falhe. Se o ClickUp recusar o nome do status (ele não conhece), o erro fica no card e a fila tenta de novo; os status do mapa precisam existir na lista. Prazo = abertura + meta de dias da tratativa (2) ou do produto aguardado (7); prioridade: resolvida baixa, prazo vencido urgente, custo acima do limite alta, senão normal. Comentários curtos com o link da ficha: análise do setor registrada ou editada (com a decisão de retorno do produto) e devolução recebida (na análise ou na edição). Tudo sai pela fila do banco, com a mesma espera e o mesmo erro (`ClickupCard.ultimoErro`) da criação, depois da gravação, sem segurá-la nem falhar por ela. Falha no meio dos comentários não repete os já enviados.
- **Sem laço:** mudança que veio do webhook não marca o card (`origem: "clickup"` não envia) e o eco do status enviado é descartado pela comparação com `statusExterno`.
- **Planos de ação: pendente.** `ClickupCard.planoId` já existe, mas ainda não há tela nem API para criar ou editar `PlanoAcao`; o card do plano (criar e atualizar, com a mesma fila) entra junto com a fase 7.
- **Não verificado contra o ClickUp real:** o corpo do `PUT /task` usa `markdown_content`, `due_date`, `priority` e `status`; mover de lista exige que o status atual exista na lista nova, senão o ClickUp responde 400 e o erro aparece na fila. Testar com a conta de teste antes de ligar em produção.
- **Webhook do ClickUp:** responde 200 logo depois de validar a assinatura e gravar o evento; o processamento roda em seguida, fora da resposta.
- **Varredura de alertas:** periódica. Rascunho parado (24 h, a definir), aguardando produto (7 dias), tratativa sem ação (2 e 3 dias), custo acima de R$ 500, setor sem receber (encaminhada há mais de 24 h), solução devolvida sem finalização (mais de 24 h) e prazo do marketplace (falta 1 dia ou menos), com chave de deduplicação. Hoje a tela calcula na hora, pelas regras de `alertas.ts`.
- **Efeito do plano:** ao concluir, calcula a janela depois da ação.
- **Backup diário do Postgres**, com retenção de 30 dias.

## 5. Armazenamento

- Dados estruturados em PostgreSQL. Fotos no volume do servidor, caminho no banco.
- **Dado sensível:** nome, cidade e pedido de cliente (LGPD). Guardar só o necessário. Retenção e anonimização a definir com o cliente.
- Volume esperado: pequeno. O histórico tem 402 reclamações, com crescimento moderado; a captura automática pode elevar. Índices por situação, data, marca, canal, bancada, setor e causa.

## 6. O que muda em relação ao sistema atual

- `setor`, `empresa` e `canal` deixam de ser texto livre e viram tabelas com chave estrangeira.
- Dinheiro sai de `Float` para `Decimal`; datas saem de texto para data.
- `Causa` ganha **origem**; `Reclamacao` ganha `AnaliseSetor`.
- `PlanoAcao` ganha vínculo com reclamações e `PlanoEfeito`.
- Jornada (migração `20261025000000_jornada`): `Reclamacao` ganha `estado`, `estadoDesde` e `prazoMarketplace`; entram `EstadoHistorico` e `UsuarioMarca`. Dados antigos: com data de ação vira **finalizada**, aguardando produto vira **recebida**, o resto **em tratativa** e rascunho **triagem**; cada reclamação ganha uma linha-base no histórico (data de criação). A coluna `situacao` e a regra do domínio ficam como estão. A migração é **aditiva** (só cria enum, colunas com valor padrão e tabelas; os UPDATE e INSERT tocam apenas o que ela mesma criou) e roda depois de `20261024000000_clickup_sincronizacao`. Reversível por script: `prisma/rollback/20261025000000_jornada_desfazer.sql` (manual, fora de `prisma/migrations`; os três valores novos do enum `AlertTipo` ficam porque o PostgreSQL não remove valor de enum, e a migração usa `ADD VALUE IF NOT EXISTS` para poder rodar de novo). O teste `teste/migracao-jornada.test.ts` aplica a cadeia inteira, confere a conversão dos dados antigos e roda o desfazer. A importação do backup antigo usa a mesma regra (`estadoDaSituacaoLegada`) e grava a linha-base.
- Entram `CapturaCanal`, `IntegracaoCanal`, `Clickup*` e `IaRegistro`.
- Migração por importação (402 reclamações, 22 causas, regras, de-para, usuários), mapeando o texto antigo para as tabelas novas. Textos sem correspondência ficam como "a classificar".

---

## Gaps & Recomendações (sistema atual, sac-renato)

- [ ] `setor`, `empresa` e `canal` em texto livre: contagens podem se dividir por grafia. Recomendação: tabelas e chave estrangeira, com importação que normaliza.
- [ ] Datas e valores em tipos imprecisos (`String` e `Float`). Recomendação: `Date` e `Decimal`.
- [ ] Senha com `salt` e `hash` próprios. Recomendação: Argon2id e sessão por cookie httpOnly.
- [ ] Sem registro do que a IA sugeriu e do que a pessoa aceitou. Recomendação: `IaRegistro`.
- [ ] Sem vínculo entre plano de ação e reclamações, nem medida de efeito. Recomendação: `PlanoReclamacao` e `PlanoEfeito`.
- [ ] Fila em tabela no Postgres. Recomendação: fila no Redis, com tentativas e erro registrados.
