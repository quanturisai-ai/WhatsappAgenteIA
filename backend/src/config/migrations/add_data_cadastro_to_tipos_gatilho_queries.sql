-- Adiciona c.data_cadastro ao SELECT (e ao GROUP BY onde aplicável) dos query_templates
-- para que a pré-visualização e o motor de regras retornem data_cadastro.

-- Padrão: "c.data_ultima_compra, c.qtd_compras" -> "c.data_ultima_compra, c.data_cadastro, c.qtd_compras"
UPDATE fidelizacao_tipos_gatilho
SET query_template = REPLACE(query_template, 'c.data_ultima_compra, c.qtd_compras', 'c.data_ultima_compra, c.data_cadastro, c.qtd_compras')
WHERE codigo IN ('INATIVIDADE', 'ANIVERSARIO', 'DATA_FIXA', 'QTD_COMPRAS');

-- REATIVACAO_TIPO_SERVICO: SELECT e GROUP BY
UPDATE fidelizacao_tipos_gatilho
SET query_template = REPLACE(
  REPLACE(query_template, 'c.data_ultima_compra, c.qtd_compras', 'c.data_ultima_compra, c.data_cadastro, c.qtd_compras'),
  'GROUP BY c.id, c.user_id, c.nome, c.cpf, c.telefone, c.data_nascimento, c.data_ultima_compra, c.qtd_compras, c.valor_total_compras, c.email',
  'GROUP BY c.id, c.user_id, c.nome, c.cpf, c.telefone, c.data_nascimento, c.data_ultima_compra, c.data_cadastro, c.qtd_compras, c.valor_total_compras, c.email'
)
WHERE codigo = 'REATIVACAO_TIPO_SERVICO';
