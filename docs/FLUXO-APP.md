# Fluxo do App — SAC AISA v2

> Como o usuário se move pelo produto.
> Fonte: [x] Entrevista com usuário  [x] Leitura de código existente (sac-renato)
> Depende de: [PRD](PRD.md)

**Data**: 21/10/2026

Os perfis, as regras de decisão e as exceções abaixo são **sugestão**, não decisão: a pergunta sobre eles não foi respondida. As jornadas 3 e 4 seguem o que o cliente confirmou (dois estágios, setor definido pelo sistema, retorno do produto decidido pela análise).

## 1. Perfis de usuário

| Perfil | Descrição | Permissões principais |
|---|---|---|
| Operação | Equipe do SAC que registra e acompanha | Cria e edita reclamação, confere o rascunho da IA, registra a data de ação, anexa fotos |
| Responsável de setor | Quem trata as ocorrências do setor | Vê só as reclamações do seu setor, registra análise e solução, conclui o estágio 1, abre plano de melhoria |
| Gestor | Supervisiona todos os setores | Lê tudo, recebe alertas, usa o painel, aprova estorno e plano de ação, troca o setor responsável |
| Administrador | Mantém o sistema | Usuários e perfis, setores, bancadas, causas, regras, integrações, limites de alerta |

O sistema atual tem `master`, `gestor` e `operador`. O dono entra como gestor (leitura do painel), salvo decisão diferente.

## 1.1 Estados da reclamação e relógios

A reclamação anda por sete estados (nomes de tela): **Triagem**, **Aguardando cliente**, **Encaminhada ao setor**, **Recebida pelo setor**, **Em tratativa**, **Resolvida no setor técnico** e **Finalizada no SAC**. "Resolvida" é do setor técnico; "Finalizada" é do SAC. Reabertura é um **evento**, não um estado: volta a "Encaminhada ao setor", com motivo.

| De → Para | Quem faz |
|---|---|
| Triagem ⇄ Aguardando cliente | SAC |
| Triagem ou Aguardando cliente → Encaminhada ao setor | SAC (exige setor responsável) |
| Encaminhada → Recebida ("Assumir" na fila) | Setor |
| Recebida → Em tratativa | Setor (só com o produto recebido, ou sem devolução) |
| Em tratativa → Resolvida no setor técnico | Setor (põe a data de ação) |
| Resolvida no setor técnico → Finalizada no SAC | SAC |
| Resolvida ou Finalizada → Encaminhada (reabertura) | SAC, com motivo |
| Qualquer outra | Gestor e administrador, com motivo |

A regra mora no domínio (`packages/domain/src/jornada.ts`) e o servidor a confere em toda mudança: transição de quem não pode é 403, transição que não existe é 400. Setor e SAC só andam pelo fluxo; gestor e administrador podem qualquer passagem, e fora do fluxo normal informam o motivo.

**Relógios** (`packages/domain/src/relogios.ts`, calculados do histórico de estados, que guarda data e autor de cada mudança): tempo em cada estado, tempo até o recebimento pelo setor, tempo de tratativa e tempo até a finalização pelo SAC. O relógio interno **pausa em "Aguardando cliente"**. O **prazo do marketplace** (campo da reclamação) corre à parte, em dias corridos, não pausa e aparece separado na ficha. A ficha mostra os tempos e o histórico.

**Alertas novos**: "Setor ainda não recebeu" (encaminhada há mais de 24 h), "Solução devolvida sem finalização" (resolvida no setor técnico há mais de 24 h) e "Prazo do marketplace" (falta 1 dia ou menos, ou já estourou). Esperar o cliente não conta como tratativa parada.

**ClickUp acompanha**: cada estado tem um status do card (mapa configurável em Integrações, com padrão). Mudar o estado no sistema atualiza o card. Mudar o card no ClickUp só vale para Recebida, Em tratativa e Resolvida no setor técnico, andando para a frente; mover para um estado do SAC, voltar atrás ou mexer antes de encaminhar é recusado e o card volta ao status certo. "Complete" no ClickUp vale como Resolvida no setor técnico, nunca como Finalizada.

**Escopo**: SAC, gestor e administrador veem tudo. O responsável de setor vê só os setores do seu cadastro e, se o cadastro tiver marcas, só essas marcas (lista de marcas vazia = todas). O seletor de marca oferece só as marcas permitidas. O administrador define setores e marcas na tela de usuários.

## 1.2 Modo treino

Para ensaiar e apresentar o sistema sem sujar os dados reais, os indicadores nem o ClickUp. Só **administrador e gestor** usam; a escolha vale **por usuário**.

- **Alternador "Modo treino"** no topo. Ligado, a faixa laranja "MODO TREINO: dados fictícios" aparece em todas as telas e a visão mostra **somente** dados de treino (lista, ficha, fila, alertas e relatórios). Desligado, o treino some de todas as telas e indicadores. Reclamação registrada com o modo ligado nasce como treino.
- **Tela Treino** (`/admin/treino`): "Carregar dados de demonstração" (administrador; cerca de 18 reclamações fictícias nas três marcas e nos sete estados, com relógios, atrasos, uma perto do prazo do marketplace e uma reaberta; rodar de novo não duplica), "Apagar dados de treino" (administrador, com confirmação; apaga só treino) e os simuladores "Simular reclamação do Mercado Livre" e "Simular devolução da Shopee" (criam uma reclamação de treino em Triagem a partir de uma carga fictícia no formato da API do canal, com pedido, SKU, texto, prazo do marketplace e comprador; a Shopee com e-mail mascarado).
- **ClickUp:** reclamação de treino não cria nem atualiza card. O administrador pode ligar "Criar cards para reclamações de treino" em Integrações (padrão desligado, com aviso de que o treino vai aparecer no ClickUp configurado).
- **Roteiro** (`/admin/roteiro-treino`): passo a passo de 10 minutos para apresentar ao dono, cada passo com link direto para a tela certa.

Os dados de treino só têm gente inventada: nome "Fictício", e-mail `.invalid` e telefone com DDD 00.

## 2. Jornadas principais

### Jornada 1: Registro assistido pelo site

Perfil: Operação

1. A pessoa abre "Nova reclamação" e descreve o caso ao cliente em texto livre ou conversa guiada. A triagem só coleta e combina com o consumidor (13 campos); solução, laudo e causa final são do setor.
2. A IA faz perguntas curtas para completar o que falta (pedido, produto, canal, o que aconteceu, fotos).
3. A IA propõe o rascunho: produto, **bancada de origem**, causa e tipo de ocorrência.
4. Decisão: se a IA tem confiança alta, o rascunho vem preenchido; se não, fica marcado "revisar causa" e não direciona sozinho.
5. A pessoa confere, corrige e registra.
6. O sistema sugere o **setor responsável** pela causa, cria o card no ClickUp e marca a reclamação como em tratativa. O gestor pode trocar o setor, e a troca fica registrada com autor e motivo. A ficha mostra a jornada: entrada, triagem, encaminhamento, análise, produto, resolução.

Telas: nova reclamação, conferência do rascunho, detalhe da reclamação.
Exceção: se a IA estiver fora do ar, o formulário funciona sem sugestão, com as regras de causa e setor do sistema.

### Jornada 2: Captura automática do marketplace

Perfil: Operação (recebe), Gestor (é avisado)

1. O sistema consulta o Mercado Livre e a Shopee de tempos em tempos e traz as reclamações novas.
2. A IA pré-trata cada uma e cria um **rascunho pendente** na fila da operação.
3. A operação abre o rascunho, confere e registra, como na jornada 1 a partir do passo 5.
4. Decisão: se o rascunho passar do limite sem ser registrado, o gestor é notificado. Sugestão de limite: 24 h (a definir).

Telas: fila de rascunhos, conferência do rascunho.
Exceção: se a API do canal falhar, a captura tenta de novo e avisa o gestor depois de falhar por um período. Reclamação duplicada é reconhecida pelo código do canal.

### Jornada 3: Estágio 1, resolver o problema do cliente

Perfil: Responsável de setor, Operação, Gestor

1. O responsável recebe o card no ClickUp e a reclamação na sua fila (Encaminhada ao setor) e a assume com o botão "Assumir" (Recebida pelo setor).
2. Ele analisa o caso. **Se o produto precisa voltar, isso é decidido nesta análise**, antes de finalizar. Sem essa análise, o produto físico volta e não é avaliado.
3. Decisão: com devolução, a situação vira "aguardando produto" e depois "recebido", e a análise do produto é feita antes da conclusão. Sem devolução, segue direto.
4. O setor registra a causa final, o laudo, a solução, o custo e a **data de ação**, na aba "Análise e solução" da ficha.
5. O setor marca "Resolvida no setor técnico" e devolve ao SAC, que responde o cliente e marca "Finalizada no SAC". O card acompanha cada passo (ver 1.1).

Prazos: meta de 2 dias até a ação; alerta aos 7 dias em "aguardando produto" e aos 3 dias nos demais casos. Custo acima de R$ 500 notifica o gestor na hora. Valores são sugestão do sistema atual.
Telas: fila do setor, detalhe da reclamação, registro de análise e solução.
Exceção: se o card no ClickUp for movido sem registro aqui, o sistema reflete a mudança e marca "atualizado pelo ClickUp". Se o setor não tiver lista no ClickUp, o card cai numa lista padrão e o administrador é avisado.

### Jornada 4: Estágio 2, melhorar o produto ou o processo

Perfil: Responsável de setor, Gestor

1. A partir de uma ocorrência ou de um padrão (muitas reclamações do mesmo produto ou causa), o responsável ou o gestor abre um **plano de ação**.
2. O plano diz o que será melhorado: produto, componente ou lote, processo de montagem, embalagem ou anúncio.
3. O plano tem responsável, prazo e prioridade, e é acompanhado no ClickUp.
4. Ao concluir, o sistema **acompanha o efeito**: a ocorrência desse produto e dessa causa caiu nas semanas seguintes?
5. Decisão: se não caiu, o plano é reaberto; se caiu, é encerrado com o resultado registrado.

Telas: lista de planos, detalhe do plano com gráfico do efeito.
Exceção: um defeito de componente ou lote não é atribuído à bancada que montou; a origem da causa é registrada junto.

### Jornada 5: O gestor decide com dados

Perfil: Gestor (e dono, em leitura)

1. O gestor abre o painel e vê o resumo: abertas, atrasadas, aguardando produto, custo.
2. Ele filtra por canal, empresa, período, produto, **bancada** e **setor responsável**.
3. Os cruzamentos principais: **bancada de origem × tipo de ocorrência**, tempo de resposta por setor, setores com mais reclamações, produtos problemáticos por categoria (modelagem, embalagem, elétrica e outras).
4. Ele abre um item, troca o setor se estiver errado, aprova estorno ou abre um plano de ação.
5. O sistema envia alertas pendentes ao gestor (painel e WhatsApp).

Telas: painel, relatórios, detalhe, planos de ação.
Relatórios (`/relatorios`, permissão `relatorios.ver`): filtro por período, marca, setor e causa; totais, tempo médio por etapa, ocorrências por setor e por produto e bancada × tipo de ocorrência; botões Imprimir (A4) e Baixar CSV. Responsável de setor vê só o próprio setor. A ficha da reclamação tem o botão Imprimir, que abre a folha em A4.
Exceção: se faltar dado de bancada ou de causa, o painel mostra a reclamação como "sem bancada" ou "a classificar", sem escondê-la.

## 3. Diagrama

```
Chegada (site | Mercado Livre | Shopee)
   -> IA monta o rascunho
   -> Operação confere e registra          (alerta ao gestor se demorar)
   -> Sistema define setor responsável + cria card no ClickUp
   -> ESTÁGIO 1  Setor analisa
        - produto volta?  sim -> aguardando produto -> recebido -> análise do produto
                          não -> segue
        -> registra solução e data de ação -> resolvida, cliente respondido
   -> ESTÁGIO 2  Plano de melhoria (produto, lote, processo)
        -> acompanha o efeito -> caiu? sim: encerra | não: reabre
Painel do gestor lê tudo: bancada x ocorrência, setor, produto, tempo
```

---

## Gaps & Recomendações (sistema atual, sac-renato)

- [ ] O sistema atual não separa os dois estágios: o plano de ação existe, mas sem acompanhamento do efeito. Recomendação: indicador de queda da ocorrência por produto e causa após o plano.
- [ ] A análise antes de finalizar, com decisão de retorno do produto, não está formalizada. Recomendação: etapa obrigatória de análise no estágio 1.
- [ ] Bancada e setor responsável sem ligação, e a bancada tratada como responsável pelo defeito. Recomendação: cruzar bancada com a origem da causa.
- [ ] Sem fila para rascunhos vindos de canais externos. Recomendação: fila de rascunhos pendentes com alerta de atraso.
