-- Migration: Adicionar campo pedido_id na tabela fidelizacao_notificacoes
-- Data: 2025-01-XX
-- Descrição: Permite rastrear qual pedido gerou cada notificação automatizada

-- Adicionar coluna pedido_id
ALTER TABLE fidelizacao_notificacoes 
ADD COLUMN pedido_id INT NULL COMMENT 'ID do pedido que gerou esta notificação (apenas para notificações automatizadas, NULL para notificações manuais)';

-- Adicionar índices para performance
ALTER TABLE fidelizacao_notificacoes
ADD INDEX idx_pedido_id (pedido_id),
ADD INDEX idx_user_pedido_tipo (user_id, pedido_id, tipo_notificacao);

-- Adicionar foreign key (opcional, mas recomendado para integridade)
ALTER TABLE fidelizacao_notificacoes
ADD FOREIGN KEY (pedido_id) REFERENCES vm_lav_pedidos(id) ON DELETE SET NULL;

