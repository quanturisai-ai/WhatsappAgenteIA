-- Migration: Adicionar tabelas para sistema de fidelização
-- Data: 2025-11-14

-- Tabela de prêmios
CREATE TABLE IF NOT EXISTS premios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL COMMENT 'ID do usuário que criou o prêmio',
    servico ENUM('SECAGEM', 'LAVAGEM', 'TOTAL') NOT NULL COMMENT 'Tipo de serviço que conta para o prêmio',
    objetivo INT NOT NULL COMMENT 'Quantidade necessária de utilizações',
    descricao VARCHAR(255) NOT NULL COMMENT 'Descrição do prêmio (ex: "Cupom 30%")',
    data_inicio_utilizacoes DATE NOT NULL COMMENT 'Data a partir da qual as utilizações contam para este prêmio',
    data_fim_utilizacoes DATE NULL COMMENT 'Data até a qual as utilizações contam para este prêmio (NULL = sem data de fim)',
    tipo_atingimento ENUM('UNICO', 'PERPETUO') DEFAULT 'UNICO' COMMENT 'Tipo de atingimento: UNICO (conquista uma vez) ou PERPETUO (pode conquistar múltiplas vezes)',
    validade_dias INT NULL COMMENT 'Validade do prêmio em dias (NULL = sem validade)',
    ativo BOOLEAN DEFAULT TRUE COMMENT 'Se o prêmio está ativo',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_servico (user_id, servico),
    INDEX idx_ativo (ativo),
    INDEX idx_data_inicio (data_inicio_utilizacoes)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de prêmios conquistados pelos clientes
CREATE TABLE IF NOT EXISTS premios_clientes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL COMMENT 'ID do usuário',
    cpf_cliente VARCHAR(20) NOT NULL COMMENT 'CPF do cliente',
    premio_id INT NOT NULL COMMENT 'ID do prêmio conquistado',
    data_conquista DATE NOT NULL COMMENT 'Data em que o prêmio foi conquistado',
    data_validade DATE NULL COMMENT 'Data de validade do prêmio (calculada a partir de validade_dias)',
    data_utilizacao DATE NULL COMMENT 'Data em que o cliente utilizou o prêmio',
    utilizado BOOLEAN DEFAULT FALSE COMMENT 'Se o prêmio já foi utilizado',
    observacao TEXT COMMENT 'Observações sobre o prêmio',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (premio_id) REFERENCES premios(id) ON DELETE CASCADE,
    INDEX idx_cpf (cpf_cliente),
    INDEX idx_premio (premio_id),
    INDEX idx_user_cpf (user_id, cpf_cliente),
    INDEX idx_data_conquista (data_conquista),
    INDEX idx_utilizado (utilizado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

