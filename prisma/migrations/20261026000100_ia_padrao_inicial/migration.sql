-- Padrão inicial para testar. É exemplo de teste e precisa ser validado com o dono: não traz política comercial.

INSERT INTO "perfil_empresa" ("id", "versao", "descricao", "missao", "valores", "metas", "tomDeVoz", "dizer", "evitar", "assinatura", "exemplos", "padrao", "nota", "publicadaPorNome")
VALUES (
  'padrao-perfil-v1', 1,
  '',
  '',
  '',
  '',
  'Cordial, direto e humano. Trata o cliente por "você", em frases curtas, sem gíria e sem emoji.',
  'Agradecer o contato, reconhecer o transtorno em uma frase e pedir só o que falta para tratar o caso.',
  'Prometer prazo, estorno, troca ou peça. Culpar transportadora, setor ou o próprio cliente. Pedir dado pessoal ou número de pedido.',
  'Equipe SAC {marca}',
  '[{"situacao": "Faltou um item no kit", "resposta": "Olá, {{nome_cliente}}! Sentimos muito pelo transtorno. Para resolver mais rápido, pode nos dizer quais itens não vieram e enviar uma foto de tudo o que chegou na caixa? Equipe SAC {marca}"}, {"situacao": "Produto chegou com dano", "resposta": "Olá, {{nome_cliente}}! Que pena que o produto chegou assim. Pode nos enviar uma foto da caixa por fora e do dano no produto? Com isso seguimos com o seu caso. Equipe SAC {marca}"}]'::jsonb,
  true,
  'Exemplo de teste, validar com o dono.',
  'Padrão inicial'
);

INSERT INTO "perguntas_obrigatorias" ("id", "chave", "categoria", "texto", "tipo", "opcoes", "obrigatoria", "exemplo", "ordem", "ativa", "regras", "padrao", "atualizadaEm")
VALUES
  ('padrao-voltagem_tomada', 'voltagem_tomada', 'eletrica', 'Qual a voltagem da tomada onde o produto foi ligado?', 'escolha', ARRAY['110 V','127 V','220 V','Não sei']::TEXT[], true, '220 V', 10, true, '[{"causaIds": ["eletrico", "voltagem"]}]'::jsonb, true, CURRENT_TIMESTAMP),
  ('padrao-extensao_estabilizador', 'extensao_estabilizador', 'eletrica', 'Você usa extensão, benjamim ou estabilizador? Qual?', 'texto', ARRAY[]::TEXT[], true, 'Sim, estabilizador', 20, true, '[{"causaIds": ["eletrico", "voltagem"]}]'::jsonb, true, CURRENT_TIMESTAMP),
  ('padrao-modelo_serie', 'modelo_serie', 'eletrica', 'Qual é o modelo ou o número de série do produto?', 'texto', ARRAY[]::TEXT[], false, 'Série 12345', 30, true, '[{"causaIds": ["eletrico", "voltagem"]}]'::jsonb, true, CURRENT_TIMESTAMP),
  ('padrao-foto_etiqueta_produto', 'foto_etiqueta_produto', 'eletrica', 'Pode enviar uma foto da etiqueta do produto?', 'foto', ARRAY[]::TEXT[], true, 'Foto enviada', 40, true, '[{"causaIds": ["eletrico", "voltagem"]}]'::jsonb, true, CURRENT_TIMESTAMP),
  ('padrao-local_dano_caixa', 'local_dano_caixa', 'embalagem', 'Em que local da caixa estava o dano?', 'escolha', ARRAY['Topo','Base','Lateral','Canto','Toda a caixa']::TEXT[], true, 'Canto inferior', 10, true, '[{"causaIds": ["avaria"]}]'::jsonb, true, CURRENT_TIMESTAMP),
  ('padrao-foto_caixa_externa', 'foto_caixa_externa', 'embalagem', 'Pode enviar uma foto da caixa externa, de todos os lados?', 'foto', ARRAY[]::TEXT[], true, 'Foto enviada', 20, true, '[{"causaIds": ["avaria"]}]'::jsonb, true, CURRENT_TIMESTAMP),
  ('padrao-foto_etiqueta_transporte', 'foto_etiqueta_transporte', 'embalagem', 'Pode enviar uma foto da etiqueta de transporte colada na caixa?', 'foto', ARRAY[]::TEXT[], false, 'Foto enviada', 30, true, '[{"causaIds": ["avaria"]}]'::jsonb, true, CURRENT_TIMESTAMP),
  ('padrao-passo_manual', 'passo_manual', 'montagem', 'Em que passo do manual você parou?', 'numero', ARRAY[]::TEXT[], true, '6', 10, true, '[{"familias": ["PRATELEIRA", "MESA", "ESTANTE", "BANCADA"], "causaIds": ["furacao", "kit", "item"]}, {"causaIds": ["furacao"]}]'::jsonb, true, CURRENT_TIMESTAMP),
  ('padrao-foto_peca', 'foto_peca', 'montagem', 'Pode enviar uma foto da peça ou do encaixe com problema?', 'foto', ARRAY[]::TEXT[], true, 'Foto enviada', 20, true, '[{"familias": ["PRATELEIRA", "MESA", "ESTANTE", "BANCADA"], "causaIds": ["furacao", "kit", "item"]}, {"causaIds": ["furacao"]}]'::jsonb, true, CURRENT_TIMESTAMP),
  ('padrao-ferramenta_usada', 'ferramenta_usada', 'montagem', 'Qual ferramenta você usou na montagem?', 'texto', ARRAY[]::TEXT[], false, 'Chave Phillips', 30, true, '[{"familias": ["PRATELEIRA", "MESA", "ESTANTE", "BANCADA"], "causaIds": ["furacao", "kit", "item"]}, {"causaIds": ["furacao"]}]'::jsonb, true, CURRENT_TIMESTAMP),
  ('padrao-pecas_faltando', 'pecas_faltando', 'peca_faltante', 'Quais peças estão faltando, conforme a lista do manual ou do anúncio?', 'texto', ARRAY[]::TEXT[], true, '4 parafusos M6', 10, true, '[{"causaIds": ["kit", "item", "unidade"]}]'::jsonb, true, CURRENT_TIMESTAMP),
  ('padrao-foto_inventario', 'foto_inventario', 'peca_faltante', 'Pode enviar uma foto de tudo o que veio na caixa, lado a lado?', 'foto', ARRAY[]::TEXT[], true, 'Foto enviada', 20, true, '[{"causaIds": ["kit", "item", "unidade"]}]'::jsonb, true, CURRENT_TIMESTAMP),
  ('padrao-data_recebimento', 'data_recebimento', 'transporte', 'Em que data você recebeu o produto?', 'data', ARRAY[]::TEXT[], true, '2026-10-15', 10, true, '[{"causaCategorias": ["Transporte"]}]'::jsonb, true, CURRENT_TIMESTAMP),
  ('padrao-foto_dano', 'foto_dano', 'transporte', 'Pode enviar uma foto do dano no produto?', 'foto', ARRAY[]::TEXT[], true, 'Foto enviada', 20, true, '[{"causaIds": ["avaria"]}]'::jsonb, true, CURRENT_TIMESTAMP);
