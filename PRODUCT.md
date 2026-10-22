# Product

<!-- impeccable:product-schema 1 -->

> Registro montado a partir de `docs/PRD.md`, `docs/UIUX.md` e do código, sem entrevista nova (init rodou numa sessão sem o usuário no ar). Tudo aqui vem desses documentos; confirmar com o usuário quando ele puder.

## Platform

web

## Users

- **Operação:** registra reclamações no computador, o dia todo. Quer preencher rápido e errar pouco.
- **Gestor e responsável de setor:** acompanham andamento e atrasos, no computador e no celular (abrem pelo alerta no WhatsApp).
- **Administrador:** importa dados, cadastra usuários e catálogos.
- **Dono da AISA:** destinatário final das avaliações e dos indicadores.

## Product Purpose

Sistema de reclamações da AISA (marcas AISA, ARTMAQ e ARAUCA). Captura a reclamação, a IA prepara o registro, o sistema direciona ao setor certo, abre o card no ClickUp e mede cada etapa, para o gestor decidir com dados e o cliente receber solução rápido. O modelo de IA sugere; quem grava é a regra do sistema.

## Positioning

Reconstrução do SAC atual (sac-renato) com a mesma regra de negócio, direcionamento por causa e setor, alertas por demora e painel que filtra clicando. Fase 1 no ar: login, perfis, base de dados importada, tela de importação. Fase 2: lista de reclamações com a ficha na frente.

## Operating Context

Uso diário de trabalho, em escritório e em celular. O usuário final não é técnico. Textos em português do Brasil, números e datas no formato brasileiro, valores em reais.

## Capabilities and Constraints

- Perfis: administrador, gestor, operação, responsável de setor. Permissão conferida no servidor.
- Tema por marca: base neutra única, cada marca troca só o destaque. Logos e cores definitivas ainda não chegaram (azul `#004fea` herdado; rosa e cinza provisórios).
- Modo escuro existe e acompanha o sistema operacional.
- Situação, custo e direcionamento seguem as regras de `CLAUDE.md`.

## Brand Commitments

Nome "SAC". Tom pedido no UIUX: limpo, denso em informação, sério e amigável; sem enfeite. Referências do cliente: painel com filtro cruzado e lista com ficha na frente. Estado nunca só por cor (sempre texto ou ícone).

## Evidence on Hand

Nenhum depoimento, métrica de uso ou logo definitiva no repositório. Não inventar.

## Product Principles

1. A tarefa vem antes da expressão: quem registra reclamações precisa saber onde está tudo sem pensar.
2. Informação densa, mas legível: números alinhados, estados com texto, nada de ornamento sem função.
3. Uma identidade só, trocando o destaque por marca, nunca misturando paletas na mesma tela.
4. A IA sugere e a pessoa confirma; a interface deixa claro o que é sugestão.
5. Linguagem simples, em português, que diz o que o botão faz e o que fazer no erro.

## Accessibility & Inclusion

WCAG 2.2 nível AA: contraste, teclado completo, foco visível, rótulos de campo. Cor nunca sozinha para indicar estado.
