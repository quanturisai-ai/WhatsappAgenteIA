-- Migration: Adicionar tabelas para sistema de notificações de fidelização
-- Data: 2025-01-XX

-- Tabela de configuração de notificações de fidelização
CREATE TABLE IF NOT EXISTS fidelizacao_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE COMMENT 'ID do usuário (um registro por usuário)',
    notificar_conquistas BOOLEAN DEFAULT TRUE COMMENT 'Se deve notificar quando cliente conquista prêmio',
    notificar_progresso BOOLEAN DEFAULT TRUE COMMENT 'Se deve notificar progresso da fidelidade',
    frequencia_progresso ENUM('sempre', 'marcos', 'mudanca_significativa') DEFAULT 'marcos' COMMENT 'Frequência de notificação de progresso',
    percentual_mudanca_minima INT DEFAULT 10 COMMENT 'Percentual mínimo de mudança para notificar (usado com mudanca_significativa)',
    template_mensagem_conquista TEXT COMMENT 'Template da mensagem de conquista de prêmio',
    template_mensagem_progresso TEXT COMMENT 'Template da mensagem de progresso',
    simulacao BOOLEAN DEFAULT TRUE COMMENT 'Se está em modo simulação (não envia WhatsApp, apenas salva histórico)',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user (user_id),
    INDEX idx_simulacao (simulacao)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de histórico de notificações de fidelização
CREATE TABLE IF NOT EXISTS fidelizacao_notificacoes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL COMMENT 'ID do usuário',
    cpf_cliente VARCHAR(20) NOT NULL COMMENT 'CPF do cliente notificado',
    tipo_notificacao ENUM('CONQUISTA', 'PROGRESSO') NOT NULL COMMENT 'Tipo da notificação',
    premio_id INT NULL COMMENT 'ID do prêmio (se for notificação de conquista)',
    mensagem_enviada TEXT NOT NULL COMMENT 'Conteúdo da mensagem enviada',
    enviado_whatsapp BOOLEAN DEFAULT FALSE COMMENT 'Se foi enviado via WhatsApp (false se simulação)',
    data_envio DATETIME NOT NULL COMMENT 'Data/hora do envio',
    erro TEXT NULL COMMENT 'Mensagem de erro se houver falha no envio',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (premio_id) REFERENCES premios(id) ON DELETE SET NULL,
    INDEX idx_user_cpf (user_id, cpf_cliente),
    INDEX idx_tipo (tipo_notificacao),
    INDEX idx_data_envio (data_envio),
    INDEX idx_enviado (enviado_whatsapp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

