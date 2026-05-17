-- Adiciona coluna simulacao_desativada_em em fidelizacao_config (quando simulação é desativada).
-- Se a coluna já existir, ignore o erro.

ALTER TABLE fidelizacao_config 
ADD COLUMN simulacao_desativada_em DATETIME NULL DEFAULT NULL 
COMMENT 'Data/hora em que a simulação foi desativada';
