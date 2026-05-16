-- Migration: Adicionar tabela para pedidos do VM Lav
-- Data: 2025-11-14

-- Tabela de pedidos do VM Lav
CREATE TABLE IF NOT EXISTS vm_lav_pedidos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL COMMENT 'ID do usuário que possui estes pedidos',
    id_pedido_vm INT COMMENT 'ID original do pedido no sistema VM Lav (pode ser null se não disponível)',
    
    -- Dados da Lavanderia
    id_lavanderia INT COMMENT 'ID da lavanderia',
    lavanderia_descricao VARCHAR(255) COMMENT 'Descrição da lavanderia',
    lavanderia_localizador VARCHAR(100) COMMENT 'Localizador da lavanderia',
    
    -- Dados da Empresa
    id_empresa INT COMMENT 'ID da empresa',
    empresa_nome VARCHAR(255) COMMENT 'Nome da empresa',
    empresa_documento VARCHAR(50) COMMENT 'Documento da empresa (CNPJ)',
    
    -- Dados da Venda
    data_venda DATETIME COMMENT 'Data e hora da venda',
    situacao_venda VARCHAR(50) COMMENT 'Situação da venda (ex: Sucesso)',
    tipo_pagamento VARCHAR(50) COMMENT 'Tipo de pagamento (ex: QRCode)',
    valor DECIMAL(15, 2) COMMENT 'Valor da venda',
    valor_sem_desconto DECIMAL(15, 2) COMMENT 'Valor sem desconto',
    
    -- Dados do Equipamento
    id_equipamento INT COMMENT 'ID do equipamento',
    equipamento_descricao VARCHAR(255) COMMENT 'Descrição do equipamento',
    equipamento_numero_serie VARCHAR(100) COMMENT 'Número de série do equipamento',
    equipamento_numero_etiqueta VARCHAR(100) COMMENT 'Número da etiqueta do equipamento',
    pdv VARCHAR(100) COMMENT 'PDV (ponto de venda)',
    
    -- Dados da Máquina
    id_maquina INT COMMENT 'ID da máquina',
    maquina_descricao VARCHAR(255) COMMENT 'Descrição da máquina',
    maquina_localizador VARCHAR(100) COMMENT 'Localizador da máquina',
    
    -- Dados do Serviço
    tipo_servico VARCHAR(100) COMMENT 'Tipo de serviço (ex: Secagem, Lavagem)',
    servico VARCHAR(255) COMMENT 'Serviço',
    
    -- Dados do Cartão (se aplicável)
    numero_cartao VARCHAR(50) COMMENT 'Número do cartão',
    bandeira_cartao VARCHAR(50) COMMENT 'Bandeira do cartão',
    tipo_cartao VARCHAR(50) COMMENT 'Tipo do cartão',
    
    -- Dados do Cliente (vinculado)
    cliente_cpf VARCHAR(20) COMMENT 'CPF do cliente',
    cliente_nome VARCHAR(255) COMMENT 'Nome do cliente',
    cliente_data_nascimento DATE COMMENT 'Data de nascimento do cliente',
    cliente_telefone VARCHAR(50) COMMENT 'Telefone do cliente',
    cliente_email VARCHAR(255) COMMENT 'Email do cliente',
    
    -- Relacionamento com cliente (opcional, via CPF ou telefone)
    cliente_id INT NULL COMMENT 'ID do cliente na tabela vm_lav_clientes (vinculado por CPF ou telefone)',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_user_id (user_id),
    INDEX idx_id_pedido_vm (id_pedido_vm),
    INDEX idx_data_venda (data_venda),
    INDEX idx_cliente_cpf (cliente_cpf),
    INDEX idx_cliente_telefone (cliente_telefone),
    INDEX idx_cliente_id (cliente_id),
    INDEX idx_lavanderia_localizador (lavanderia_localizador),
    INDEX idx_situacao_venda (situacao_venda),
    INDEX idx_tipo_pagamento (tipo_pagamento),
    INDEX idx_created_at (created_at),
    INDEX idx_updated_at (updated_at),
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (cliente_id) REFERENCES vm_lav_clientes(id) ON DELETE SET NULL,
    
    -- Índice composto para evitar duplicatas (se houver id_pedido_vm)
    INDEX idx_user_pedido_vm (user_id, id_pedido_vm)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

