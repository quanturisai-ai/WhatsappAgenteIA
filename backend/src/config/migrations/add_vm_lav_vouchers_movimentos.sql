-- Tabela para armazenar movimentações (retiradas, etc.) dos vouchers vindas da API VM Hub.
-- Vincula-se a vm_lav_vouchers pelo id do voucher no VM-Lav (id_voucher_vm).
-- Execute este script no banco antes de rodar o script de popular movimentos.

CREATE TABLE IF NOT EXISTS `vm_lav_vouchers_movimentos` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `id_voucher_vm` INT(11) NOT NULL COMMENT 'ID do voucher no sistema VM-Lav (vm_lav_vouchers.id_voucher_vm)',
  `user_id` INT(11) NOT NULL COMMENT 'ID do usuário',
  `tipo_movimento` VARCHAR(50) NULL COMMENT 'Ex: RETIRADA, ENTRADA',
  `data_movimentacao` DATETIME NULL COMMENT 'Data/hora da movimentação na API',
  `valor` DECIMAL(12,2) NULL COMMENT 'Valor da movimentação (retirada em valor absoluto)',
  `equipamento_numero_serie` VARCHAR(100) NULL COMMENT 'Número de série do equipamento (máquina)',
  `local_nome` VARCHAR(255) NULL COMMENT 'Nome do local/lavanderia quando disponível',
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `idx_user_voucher_data_valor` (`user_id`, `id_voucher_vm`, `data_movimentacao`, `valor`) USING BTREE,
  INDEX `idx_user_id` (`user_id`) USING BTREE,
  INDEX `idx_id_voucher_vm` (`id_voucher_vm`) USING BTREE,
  INDEX `idx_data_movimentacao` (`data_movimentacao`) USING BTREE,
  CONSTRAINT `vm_lav_vouchers_movimentos_ibfk_1`
    FOREIGN KEY (`user_id`, `id_voucher_vm`) REFERENCES `vm_lav_vouchers` (`user_id`, `id_voucher_vm`) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT `vm_lav_vouchers_movimentos_ibfk_2`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE=InnoDB COLLATE='utf8mb4_unicode_ci'
COMMENT='Movimentações dos vouchers (API VM Hub), vinculadas a vm_lav_vouchers por id_voucher_vm';
