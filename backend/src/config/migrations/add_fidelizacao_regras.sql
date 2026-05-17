-- Migration: Módulo de Automações de Fidelização (regras parametrizáveis)
-- Inclui: fidelizacao_tipos_gatilho, fidelizacao_regras, fidelizacao_regras_config
-- e alterações em fidelizacao_notificacoes (tipo_notificacao VARCHAR, regra_id)

-- 1. Tabela de tipos de gatilho (queries e schema por tipo)
CREATE TABLE IF NOT EXISTS fidelizacao_tipos_gatilho (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(50) NOT NULL UNIQUE,
    nome_exibicao VARCHAR(100) NOT NULL,
    descricao TEXT,
    query_template TEXT NOT NULL,
    parametros_schema JSON NOT NULL,
    placeholders_disponiveis JSON NOT NULL,
    frequencia_minima_dias_default INT NOT NULL DEFAULT 30,
    ativo TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Tabela de regras por usuário
CREATE TABLE IF NOT EXISTS fidelizacao_regras (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    tipo_gatilho_id INT NOT NULL,
    nome_regra VARCHAR(150) NOT NULL,
    parametros JSON NOT NULL,
    mensagem_template TEXT NOT NULL,
    frequencia_minima_dias INT NOT NULL DEFAULT 30,
    horario_inicio TIME NOT NULL DEFAULT '08:00:00',
    horario_fim TIME NOT NULL DEFAULT '20:00:00',
    data_ativacao DATE NOT NULL DEFAULT (CURDATE()),
    ativo TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_fidelizacao_regras_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_fidelizacao_regras_tipo FOREIGN KEY (tipo_gatilho_id) REFERENCES fidelizacao_tipos_gatilho(id),
    INDEX idx_user_ativo (user_id, ativo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Config global do módulo (anti-saturação)
CREATE TABLE IF NOT EXISTS fidelizacao_regras_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    ativo TINYINT(1) DEFAULT 0,
    max_mensagens_por_cliente_semana INT DEFAULT 2,
    max_mensagens_por_cliente_mes INT DEFAULT 4,
    simulacao TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_fidelizacao_regras_config_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Alterar fidelizacao_notificacoes para suportar tipos dinâmicos e regra_id
ALTER TABLE fidelizacao_notificacoes
MODIFY COLUMN tipo_notificacao VARCHAR(50) NOT NULL;

ALTER TABLE fidelizacao_notificacoes
ADD COLUMN IF NOT EXISTS regra_id INT NULL COMMENT 'ID da regra de automação que gerou esta notificação' AFTER pedido_id;

-- Índices para anti-spam e preview (ignorar erro se já existirem)
ALTER TABLE fidelizacao_notificacoes ADD INDEX idx_regra_id (regra_id);
ALTER TABLE fidelizacao_notificacoes ADD INDEX idx_regra_cpf_data (regra_id, cpf_cliente, data_envio);

-- 5. Dados iniciais: tipos de gatilho (query_template usa placeholders :user_id, :data_ativacao, :param_*)
INSERT INTO fidelizacao_tipos_gatilho (codigo, nome_exibicao, descricao, query_template, parametros_schema, placeholders_disponiveis, frequencia_minima_dias_default) VALUES
('INATIVIDADE', 'Inatividade', 'Clientes que não realizam compras há X dias. Útil para campanhas de reativação e cupons de retorno.',
 'SELECT c.id, c.user_id, c.nome, c.cpf, c.telefone, c.data_nascimento, c.data_ultima_compra, c.qtd_compras, c.valor_total_compras, c.email, DATEDIFF(NOW(), c.data_ultima_compra) AS dias_ausente FROM vm_lav_clientes c WHERE c.user_id = :user_id AND c.data_ultima_compra <= NOW() - INTERVAL :param_dias DAY AND (c.data_cadastro >= :data_ativacao OR c.data_cadastro IS NULL) AND c.telefone IS NOT NULL AND TRIM(c.telefone) != ""',
 '{"campos":[{"nome":"dias","tipo":"number","label":"Dias sem compra","obrigatorio":true,"default":30,"min":1,"max":365,"placeholder_sql":":param_dias"}]}',
 '["nome","primeiro_nome","dias_ausente","data_ultima_visita","qtd_compras","valor_total"]',
 30),

('ANIVERSARIO', 'Aniversário', 'Clientes que fazem aniversário no dia de hoje. Ideal para mensagens de parabéns e ofertas especiais.',
 'SELECT c.id, c.user_id, c.nome, c.cpf, c.telefone, c.data_nascimento, c.data_ultima_compra, c.qtd_compras, c.valor_total_compras, c.email, DATEDIFF(NOW(), c.data_ultima_compra) AS dias_ausente FROM vm_lav_clientes c WHERE c.user_id = :user_id AND c.data_nascimento IS NOT NULL AND MONTH(c.data_nascimento) = MONTH(CURDATE()) AND DAY(c.data_nascimento) = DAY(CURDATE()) AND (c.data_cadastro >= :data_ativacao OR c.data_cadastro IS NULL) AND c.telefone IS NOT NULL AND TRIM(c.telefone) != ""',
 '{"campos":[]}',
 '["nome","primeiro_nome","data_ultima_visita","qtd_compras","valor_total"]',
 365),

('REATIVACAO_TIPO_SERVICO', 'Reativação por tipo de serviço', 'Clientes que usaram um tipo de máquina/serviço específico há mais de X dias e não usaram novamente desde então.',
 'SELECT c.id, c.user_id, c.nome, c.cpf, c.telefone, c.data_nascimento, c.data_ultima_compra, c.qtd_compras, c.valor_total_compras, c.email, DATEDIFF(NOW(), MAX(p.data_venda)) AS dias_ausente FROM vm_lav_clientes c INNER JOIN vm_lav_pedidos p ON p.user_id = c.user_id AND (p.cliente_cpf = c.cpf OR REPLACE(REPLACE(REPLACE(COALESCE(p.cliente_cpf,""),".",""),"-","")," ","") = REPLACE(REPLACE(REPLACE(COALESCE(c.cpf,""),".",""),"-","")," ","")) AND p.situacao_venda = "Sucesso" AND p.data_venda >= :data_ativacao AND (p.maquina_descricao LIKE CONCAT("%", :param_maquina_keyword, "%") OR p.servico LIKE CONCAT("%", :param_maquina_keyword, "%")) WHERE c.user_id = :user_id AND (c.data_cadastro >= :data_ativacao OR c.data_cadastro IS NULL) AND c.telefone IS NOT NULL AND TRIM(c.telefone) != "" GROUP BY c.id, c.user_id, c.nome, c.cpf, c.telefone, c.data_nascimento, c.data_ultima_compra, c.qtd_compras, c.valor_total_compras, c.email HAVING MAX(p.data_venda) <= NOW() - INTERVAL :param_dias_apos_uso DAY',
 '{"campos":[{"nome":"dias_apos_uso","tipo":"number","label":"Dias desde último uso","obrigatorio":true,"default":21,"min":1,"max":365,"placeholder_sql":":param_dias_apos_uso"},{"nome":"maquina_keyword","tipo":"text","label":"Palavra-chave na máquina/serviço","obrigatorio":true,"default":"","placeholder":"Ex: Secadora Grande, Edredom","placeholder_sql":":param_maquina_keyword"}]}',
 '["nome","primeiro_nome","dias_ausente","data_ultima_visita","qtd_compras","valor_total"]',
 30),

('DATA_FIXA', 'Data fixa', 'Dispara em uma data específica do ano (mês e dia). Público: clientes ativos (com compra nos últimos 90 dias).',
 'SELECT c.id, c.user_id, c.nome, c.cpf, c.telefone, c.data_nascimento, c.data_ultima_compra, c.qtd_compras, c.valor_total_compras, c.email, DATEDIFF(NOW(), c.data_ultima_compra) AS dias_ausente FROM vm_lav_clientes c WHERE c.user_id = :user_id AND MONTH(CURDATE()) = :param_mes AND DAY(CURDATE()) = :param_dia AND c.data_ultima_compra >= NOW() - INTERVAL 90 DAY AND (c.data_cadastro >= :data_ativacao OR c.data_cadastro IS NULL) AND c.telefone IS NOT NULL AND TRIM(c.telefone) != ""',
 '{"campos":[{"nome":"mes","tipo":"number","label":"Mês (1-12)","obrigatorio":true,"default":1,"min":1,"max":12,"placeholder_sql":":param_mes"},{"nome":"dia","tipo":"number","label":"Dia (1-31)","obrigatorio":true,"default":1,"min":1,"max":31,"placeholder_sql":":param_dia"}]}',
 '["nome","primeiro_nome","data_ultima_visita","qtd_compras","valor_total"]',
 365),

('QTD_COMPRAS', 'Quantidade de compras', 'Clientes que atingiram uma quantidade mínima de compras. Útil para campanhas de indicação ou boas-vindas.',
 'SELECT c.id, c.user_id, c.nome, c.cpf, c.telefone, c.data_nascimento, c.data_ultima_compra, c.qtd_compras, c.valor_total_compras, c.email, DATEDIFF(NOW(), c.data_ultima_compra) AS dias_ausente FROM vm_lav_clientes c WHERE c.user_id = :user_id AND c.qtd_compras >= :param_qtd_minima AND (c.data_cadastro >= :data_ativacao OR c.data_cadastro IS NULL) AND c.telefone IS NOT NULL AND TRIM(c.telefone) != ""',
 '{"campos":[{"nome":"qtd_minima","tipo":"number","label":"Quantidade mínima de compras","obrigatorio":true,"default":10,"min":1,"max":9999,"placeholder_sql":":param_qtd_minima"}]}',
 '["nome","primeiro_nome","dias_ausente","data_ultima_visita","qtd_compras","valor_total"]',
 30);
