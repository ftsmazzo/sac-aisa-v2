# UI/UX Design — SAC AISA v2

> Direção visual e de experiência.
> Fonte: [x] Entrevista com usuário  [x] Leitura de código existente (sac-renato)  [x] Áudio do cliente (21/10/2026)
> Depende de: [Fluxo do App](FLUXO-APP.md)

**Data**: 21/10/2026

Estado geral: **rascunho**. A identidade das marcas espera as logos. O resto foi aprovado como sugestão ("gostei das sugestões").

## 1. Referências e tom

- Referência do cliente: um painel de informações com gráficos dinâmicos, no qual clicar em um dado filtra todos os outros, com filtros simples por período, problema, setor e produto. A lista de reclamações em formato de lista, e o clique abre uma página na frente da lista, usada tanto para cadastro quanto para edição. O nome do produto citado no áudio (algo como "campiais") não ficou claro na transcrição; confirmar com o cliente para tomar como referência visual.
- Referências complementares propostas: painéis de operação modernos (Linear, ClickUp, Notion).
- Tom: limpo, denso em informação, sério e amigável. Cartões, tabelas legíveis, gráficos discretos, muito espaço em branco, sem enfeite.

Dois princípios do cliente guiam o resto: **painel que filtra clicando** e **lista com ficha na frente**.

## 2. Plataformas-alvo

- [x] Web responsivo. A operação usa o computador; gestor e responsável de setor também abrem no celular, a partir do alerta no WhatsApp.
- [ ] Mobile nativo. Não.
- [ ] Desktop. Não. PWA instalável pode entrar depois.

## 3. Sistema visual

### Marcas e paleta

- Marcas citadas pelo cliente: AISA, ARTMAQ e ARAUCA. Nos dados do sistema atual também aparece WORK (19 de 402); confirmar se é marca.
- O cliente lembra de azul, rosa e cinza como cores das marcas, e de uma versão anterior só com azul e rosa para ARTMAQ e AISA, que ele achou "arrochada" mas interessante. Risco apontado por ele: ficar estranho misturar tudo.
- Proposta: **tema por marca com tokens de cor**. Uma base neutra (cinza e branco) igual para todas, e cada marca troca só a cor de destaque e o cabeçalho. Assim o sistema parece uma coisa só, sem mistura de paletas na mesma tela.
  - Cabeçalho dedicado por marca, com a logo e a cor da marca, e seletor de marca ou "todas" no painel.
  - Cores de estado fixas e independentes da marca: verde resolvido, laranja atenção, vermelho atrasado ou custo alto.
  - Enquanto as logos não chegam, valem azul `#004fea` (herdado do sistema atual) e um rosa e cinza provisórios, a trocar.
- Modo escuro opcional.

### Tipografia

- Inter. Boa leitura de números em tabelas e gráficos, números tabulares nos indicadores.

### Componentes centrais

- **Painel com filtro cruzado.** Gráficos ligados entre si: clicar em uma barra, fatia ou célula filtra todos os outros e a lista. Filtros globais no topo: período, problema (causa), setor responsável, produto, e também canal, marca e bancada. Filtros ativos aparecem como chips removíveis, com um "limpar tudo".
- **Lista de reclamações.** Tabela com busca, ordenação e colunas escolhidas. Cor e texto indicam a situação e o atraso. Seleção em massa para o gestor.
- **Ficha na frente da lista.** Clicar numa linha abre um painel lateral largo (ou página sobreposta, em tela cheia no celular). É a mesma ficha para **cadastro e edição**. A lista continua visível por trás.
- **Conversa guiada da IA.** Para registrar, a pessoa conversa e a IA preenche a ficha ao lado, campo a campo, com destaque no que foi sugerido.
- **Mapa de calor bancada × ocorrência**, barras por setor, tempo de resposta e linha do tempo da reclamação.

### Como preencher sem 200 tags

O cliente prevê que, com muitas tags, a tela fica impossível de escolher. Decisão proposta para a ficha:

1. **A IA preenche primeiro.** Causa, produto e bancada chegam sugeridos; a operação só confirma ou troca.
2. **Campo de busca com sugestões**, não uma parede de tags. A pessoa digita e escolhe de uma lista filtrada, com os mais usados e os recentes no topo.
3. **Hierarquia**: categoria, depois causa. Hoje o sistema tem 22 causas em categorias (Fabricação, Envio errado, Item faltando, Transporte, Produto, Venda e cadastro, Prazo e entrega, Outros). A escolha é em dois passos curtos.
4. **Chips só para as 3 a 5 sugestões da IA**, nunca para o catálogo inteiro.
5. **Tags livres ficam em segundo plano**, para atributos extras, com busca e criação controlada pelo administrador para não duplicar.

## 4. Acessibilidade

- Alvo: WCAG 2.2 nível AA.
- Contraste adequado, navegação completa por teclado, foco visível, rótulos de campo e leitor de tela nos gráficos.
- Cor nunca sozinha: estado sempre com texto ou ícone.
- Sem requisito legal ou de público específico informado.

## 5. Telas principais

| Tela | Jornada relacionada | Estado |
|---|---|---|
| Login | todas | rascunho |
| Painel do gestor (filtro cruzado) | 5 | rascunho |
| Lista de reclamações com ficha lateral | 1, 2, 3 | rascunho |
| Nova reclamação com IA | 1 | rascunho |
| Fila de rascunhos (marketplace) | 2 | rascunho |
| Conferência do rascunho | 1, 2 | rascunho |
| Ficha da reclamação (cadastro e edição) | 1, 3 | rascunho |
| Fila do setor | 3 | rascunho |
| Planos de ação e efeito | 4 | rascunho |
| Relatórios (bancada × ocorrência) | 5 | rascunho |
| Integrações (ClickUp e marketplaces) | 2, 3 | rascunho |
| Cadastros: setores, bancadas, causas, marcas, usuários | todas | rascunho |

---

## Gaps & Recomendações (sistema atual, sac-renato)

- [ ] Interface em um arquivo de 3.403 linhas, sem componentes reutilizáveis. Recomendação: sistema de design com componentes e tokens de tema.
- [ ] Escolha de causa e dados por muitas opções na tela. Recomendação: busca com sugestão da IA e hierarquia.
- [ ] Painel sem filtro cruzado entre gráficos. Recomendação: estado de filtro único compartilhado por gráficos e lista.
- [ ] Sem identidade por marca. Recomendação: tokens por marca e cabeçalho dedicado, quando as logos chegarem.
