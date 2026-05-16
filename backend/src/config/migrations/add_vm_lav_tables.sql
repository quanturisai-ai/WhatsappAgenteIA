-- Migration: Adicionar tabelas para integração com VM Lav
-- Data: 2025-11-14

-- Tabela de credenciais e tokens do VM Lav
CREATE TABLE IF NOT EXISTS vm_lav_credentials (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    email VARCHAR(255) NOT NULL,
    senha_criptografada TEXT NOT NULL COMMENT 'Senha criptografada usando bcrypt ou similar',
    token_inicial TEXT COMMENT 'Token JWT inicial obtido do login',
    token_aplicacao TEXT COMMENT 'Token JWT da aplicação com clientId vmlav',
    dados_localstorage JSON COMMENT 'Dados do localStorage se necessário',
    cookies JSON COMMENT 'Cookies da sessão se necessário',
    token_expira_em TIMESTAMP NULL COMMENT 'Data/hora de expiração do token',
    ultima_sincronizacao TIMESTAMP NULL COMMENT 'Última vez que os clientes foram sincronizados',
    ultimo_erro TEXT COMMENT 'Última mensagem de erro se houver',
    status ENUM('ativo', 'inativo', 'erro') DEFAULT 'inativo',
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_ativo (ativo),
    INDEX idx_token_expira_em (token_expira_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de clientes do VM Lav
CREATE TABLE IF NOT EXISTS vm_lav_clientes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL COMMENT 'ID do usuário que possui estes clientes',
    id_cliente_vm INT NOT NULL COMMENT 'ID original do cliente no sistema VM Lav',
    nome VARCHAR(255),
    data_nascimento DATE,
    cpf VARCHAR(20),
    telefone VARCHAR(50),
    email VARCHAR(255),
    genero VARCHAR(20),
    data_cadastro DATETIME,
    data_ultima_compra DATETIME,
    qtd_compras INT DEFAULT 0,
    valor_total_compras DECIMAL(15, 2) DEFAULT 0.00,
    qtd_compras_90 INT DEFAULT 0,
    valor_total_compras_90 DECIMAL(15, 2) DEFAULT 0.00,
    qtd_compras_30 INT DEFAULT 0,
    valor_total_compras_30 DECIMAL(15, 2) DEFAULT 0.00,
    qtd_compras_7 INT DEFAULT 0,
    valor_total_compras_7 DECIMAL(15, 2) DEFAULT 0.00,
    lavanderia VARCHAR(255),
    acoes JSON COMMENT 'Dados de ações do cliente (objeto JSON)',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_id_cliente_vm (id_cliente_vm),
    INDEX idx_nome (nome),
    INDEX idx_cpf (cpf),
    INDEX idx_email (email),
    INDEX idx_telefone (telefone),
    INDEX idx_data_cadastro (data_cadastro),
    INDEX idx_data_ultima_compra (data_ultima_compra),
    INDEX idx_updated_at (updated_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_vm_cliente (user_id, id_cliente_vm),
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

