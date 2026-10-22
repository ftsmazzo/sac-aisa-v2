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
| Reclamacao | id, protocolo, marcaId, canalId, produtoId, bancadaId, causaId (principal), setorRespId, situação (aguardando, tratativa, resolvida), devolução (NA, AGUARDANDO, RECEBIDO), datas reais (abertura, ação, recebimento), descrição, laudo, solução, cliente (nome e cidade mínimos), pedido, rascunho (booleano), origem | tem causas extras, fotos, análise, alertas, card ClickUp |
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
| IntegracaoCanal | canalId, tipo de autorização, expiração, ativo. Segredos só em variável de ambiente ou cifrados | **novo** |
| ClickupConfig | setorId, listaId, listaPadrão, mapeamento de status do ClickUp para situação | **novo** |
| ClickupCard | reclamacaoId ou planoId, taskId, listaId, status externo, sincronizadoEm, tentativas, ultimoErro | **novo**. Um card por reclamação ou plano |
| ClickupEvento | taskId, tipo, payload, recebidoEm, processadoEm | **novo**. Histórico dos webhooks |
| IaRegistro | reclamacaoId ou captura, tipo (preenchimento, classificação), sugestão, confiança, aceita (sim/não/alterada), modelo, criadoEm | **novo**. Alimenta a taxa de aceite da IA e a revisão |

### Apoio (mantidos do sistema atual)

| Entidade | Campos-chave |
|---|---|
| Usuario | id, login, nome, perfil, ativo, telefone, setorIds, hash de senha |
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
- Escopo: o responsável de setor só vê Reclamações, cards e planos do(s) seu(s) setor(es); sem setor vinculado, não vê nada. Operação, gestor e administrador veem todos os setores (`PERFIS_TODOS_OS_SETORES` no domínio). A conferência é feita no servidor em toda ação, nunca só na tela.
- Segredos (ClickUp, marketplaces, OpenRouter) só em variável de ambiente.

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
| `/reclamacoes/:id/analise` | POST | Responsável de setor | Registra a decisão de retorno do produto; sem ela não finaliza |
| `/reclamacoes/:id/fotos` | POST | Sim | Tipo e tamanho conferidos; arquivo no volume, caminho no banco |
| `/ia/rascunho` | POST | Operação+ | A IA sugere produto, bancada, causa e origem; **nunca grava**. Registra em `IaRegistro` |
| `/capturas` | GET | Operação+ | Fila de rascunhos pendentes do marketplace |
| `/capturas/:id/aceitar`, `/descartar` | POST | Operação+ | Aceitar vira Reclamação; descartar guarda o motivo |
| `/planos` | GET, POST, PATCH | Responsável, gestor | Plano de melhoria. Conclusão dispara a janela de efeito |
| `/planos/:id/efeito` | GET | Gestor | Ocorrência antes e depois da ação |
| `/painel/resumo`, `/painel/cruzamento` | GET | Gestor | Indicadores; bancada × ocorrência; tempo por setor |
| `/alertas` | GET, PATCH | Gestor | Lista e resolve alertas |
| `/webhooks/clickup` | POST | Por segredo | Valida assinatura; grava `ClickupEvento`; atualiza situação |
| `/cadastros/*` (marcas, canais, bancadas, setores, causas, produtos) | CRUD | Administrador | Lista controlada; sem duplicata |
| `/usuarios`, `/integracoes`, `/config` | CRUD | Administrador | Limites de alerta, mapa setor → lista do ClickUp |

## 4. Processamento assíncrono

Fila no Redis (BullMQ, a confirmar), com falhas registradas e nova tentativa com espera crescente:

- **Captura dos marketplaces:** a cada 10 minutos (a definir), por canal. Reconhece duplicata pelo `idExterno`.
- **Pré-tratamento pela IA:** para cada captura nova.
- **Criar card no ClickUp:** ao registrar a Reclamação ou o Plano. Falhou, fica pendente em `ClickupCard` com contagem de tentativas, e avisa o gestor se passar do prazo.
- **Webhook do ClickUp:** responde rápido e processa em segundo plano.
- **Varredura de alertas:** periódica. Rascunho parado (24 h, a definir), aguardando produto (7 dias), tratativa sem ação (2 e 3 dias) e custo acima de R$ 500, com chave de deduplicação.
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
