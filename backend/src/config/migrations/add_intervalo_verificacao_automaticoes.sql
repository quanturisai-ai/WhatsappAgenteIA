-- Migration: Campos para scheduler de automações em fidelizacao_regras_config
-- intervalo_verificacao_minutos: intervalo em minutos entre verificações
-- ultima_verificacao_automaticoes: timestamp da última execução do processamento de regras
-- Executar após add_fidelizacao_regras.sql (ou usar migrateVmLavTables que aplica automaticamente)

ALTER TABLE fidelizacao_regras_config
ADD COLUMN intervalo_verificacao_minutos INT NOT NULL DEFAULT 60 COMMENT 'Intervalo em minutos entre verificações de automações',
ADD COLUMN ultima_verificacao_automaticoes TIMESTAMP NULL COMMENT 'Última execução do processamento de regras de automação';
