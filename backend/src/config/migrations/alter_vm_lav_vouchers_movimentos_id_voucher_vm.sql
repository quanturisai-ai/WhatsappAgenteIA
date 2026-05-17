-- Migração: trocar voucher_id por id_voucher_vm na tabela vm_lav_vouchers_movimentos.
-- Execute apenas se a tabela já existir com a coluna voucher_id (versão antiga).

-- 1. Adicionar coluna id_voucher_vm
ALTER TABLE `vm_lav_vouchers_movimentos`
  ADD COLUMN `id_voucher_vm` INT(11) NULL COMMENT 'ID do voucher no sistema VM-Lav' AFTER `id`;

-- 2. Preencher id_voucher_vm a partir de vm_lav_vouchers
UPDATE `vm_lav_vouchers_movimentos` m
INNER JOIN `vm_lav_vouchers` v ON v.id = m.voucher_id AND v.user_id = m.user_id
SET m.id_voucher_vm = v.id_voucher_vm;

-- 3. Remover FK e índice antigos, ajustar coluna
ALTER TABLE `vm_lav_vouchers_movimentos`
  DROP FOREIGN KEY `vm_lav_vouchers_movimentos_ibfk_1`,
  DROP INDEX `idx_voucher_data_valor`,
  DROP COLUMN `voucher_id`,
  MODIFY COLUMN `id_voucher_vm` INT(11) NOT NULL COMMENT 'ID do voucher no sistema VM-Lav (vm_lav_vouchers.id_voucher_vm)';

-- 4. Novo índice único e FK
ALTER TABLE `vm_lav_vouchers_movimentos`
  ADD UNIQUE INDEX `idx_user_voucher_data_valor` (`user_id`, `id_voucher_vm`, `data_movimentacao`, `valor`) USING BTREE,
  ADD INDEX `idx_id_voucher_vm` (`id_voucher_vm`) USING BTREE,
  ADD CONSTRAINT `vm_lav_vouchers_movimentos_ibfk_1`
    FOREIGN KEY (`user_id`, `id_voucher_vm`) REFERENCES `vm_lav_vouchers` (`user_id`, `id_voucher_vm`) ON UPDATE RESTRICT ON DELETE CASCADE;
