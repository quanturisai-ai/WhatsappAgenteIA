-- Migration: Vigência (vigencia_inicio/vigencia_fim), Segmentação (segmentacao JSON) e novo gatilho INCENTIVO_DIA_UTIL
-- Remove dependência de :data_ativacao nas query_templates (filtro de público passa para segmentação no motor).

-- 1. Renomear data_ativacao → vigencia_inicio
ALTER TABLE fidelizacao_regras
  CHANGE COLUMN data_ativacao vigencia_inicio DATE NOT NULL DEFAULT (CURDATE());

-- 2. Adicionar vigencia_fim e segmentacao
ALTER TABLE fidelizacao_regras
  ADD COLUMN vigencia_fim DATE NULL DEFAULT NULL AFTER vigencia_inicio;

ALTER TABLE fidelizacao_regras
  ADD COLUMN segmentacao JSON NULL DEFAULT NULL AFTER parametros;

-- 3. Remover :data_ativacao das query_templates (INATIVIDADE, ANIVERSARIO, DATA_FIXA, QTD_COMPRAS)
UPDATE fidelizacao_tipos_gatilho
SET query_template = REPLACE(query_template, ' AND (c.data_cadastro >= :data_ativacao OR c.data_cadastro IS NULL)', '')
WHERE codigo IN ('INATIVIDADE', 'ANIVERSARIO', 'DATA_FIXA', 'QTD_COMPRAS');

-- 4. REATIVACAO_TIPO_SERVICO: remover p.data_venda >= :data_ativacao e cláusula data_cadastro
UPDATE fidelizacao_tipos_gatilho
SET query_template = REPLACE(
  REPLACE(query_template, ' AND p.data_venda >= :data_ativacao', ''),
  ' AND (c.data_cadastro >= :data_ativacao OR c.data_cadastro IS NULL)', '')
WHERE codigo = 'REATIVACAO_TIPO_SERVICO';

-- 5. Inserir novo tipo INCENTIVO_DIA_UTIL (clientes com % alto de pedidos no fim de semana)
INSERT INTO fidelizacao_tipos_gatilho (codigo, nome_exibicao, descricao, query_template, parametros_schema, placeholders_disponiveis, frequencia_minima_dias_default) VALUES
('INCENTIVO_DIA_UTIL', 'Incentivo dia útil', 'Clientes que usam a lavanderia predominantemente no fim de semana. Ideal para oferecer descontos em dias úteis e equilibrar a ocupação.',
 'SELECT c.id, c.user_id, c.nome, c.cpf, c.telefone, c.data_nascimento, c.data_cadastro, c.data_ultima_compra, c.qtd_compras, c.valor_total_compras, c.email, DATEDIFF(NOW(), c.data_ultima_compra) AS dias_ausente, SUM(CASE WHEN DAYOFWEEK(p.data_venda) IN (1, 7) THEN 1 ELSE 0 END) AS pedidos_fds, COUNT(p.id) AS pedidos_total, ROUND(SUM(CASE WHEN DAYOFWEEK(p.data_venda) IN (1, 7) THEN 1 ELSE 0 END) * 100.0 / COUNT(p.id), 1) AS percentual_fds FROM vm_lav_clientes c INNER JOIN vm_lav_pedidos p ON p.cliente_cpf = c.cpf AND p.user_id = c.user_id AND p.situacao_venda = "Sucesso" WHERE c.user_id = :user_id AND c.data_ultima_compra >= NOW() - INTERVAL 90 DAY AND c.telefone IS NOT NULL AND TRIM(c.telefone) != "" GROUP BY c.id, c.user_id, c.nome, c.cpf, c.telefone, c.data_nascimento, c.data_cadastro, c.data_ultima_compra, c.qtd_compras, c.valor_total_compras, c.email HAVING percentual_fds >= :param_percentual_fds_minimo AND COUNT(p.id) >= :param_min_pedidos',
 '{"campos":[{"nome":"percentual_fds_minimo","tipo":"number","label":"% mínimo de pedidos no fim de semana","obrigatorio":true,"default":70,"min":50,"max":100,"placeholder_sql":":param_percentual_fds_minimo"},{"nome":"min_pedidos","tipo":"number","label":"Mínimo de pedidos totais","obrigatorio":true,"default":3,"min":1,"max":999,"placeholder_sql":":param_min_pedidos"}]}',
 '["nome","primeiro_nome","dias_ausente","data_ultima_visita","qtd_compras","valor_total","pedidos_fds","pedidos_total","percentual_fds"]',
 30);
