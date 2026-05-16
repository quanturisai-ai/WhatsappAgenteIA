-- Migration: Melhorias na autenticação e sincronização VM Lav
-- Data: 2025-01-XX

-- Adicionar campo de intervalo de sincronização na tabela de credenciais
-- (Será adicionado via verificação no código TypeScript)

-- Tabela de log de sincronizações
CREATE TABLE IF NOT EXISTS vm_lav_sincronizacoes_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL COMMENT 'ID do usuário',
    tipo ENUM('clientes', 'pedidos', 'ambos') NOT NULL COMMENT 'Tipo de sincronização',
    data_execucao DATETIME NOT NULL COMMENT 'Data/hora da execução',
    registros_novos INT DEFAULT 0 COMMENT 'Quantidade de registros novos inseridos',
    registros_alterados INT DEFAULT 0 COMMENT 'Quantidade de registros alterados/atualizados',
    registros_total INT DEFAULT 0 COMMENT 'Total de registros processados',
    sucesso BOOLEAN DEFAULT TRUE COMMENT 'Se a sincronização foi bem-sucedida',
    erro TEXT NULL COMMENT 'Mensagem de erro se houver falha',
    duracao_segundos INT NULL COMMENT 'Duração da sincronização em segundos',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_tipo (tipo),
    INDEX idx_data_execucao (data_execucao),
    INDEX idx_sucesso (sucesso)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

