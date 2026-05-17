import pool from '../config/database';
import logger from './logger';

async function migrateVouchersTable(): Promise<void> {
    const conn = await pool.getConnection();
    try {
        logger.info('Iniciando migração para criar tabela vm_lav_vouchers...');

        // Criar a tabela se não existir
        await conn.query(`
      CREATE TABLE IF NOT EXISTS \`vm_lav_vouchers\` (
        \`id\` INT(11) NOT NULL AUTO_INCREMENT,
        \`user_id\` INT(11) NOT NULL COMMENT 'ID do usuário proprietário',
        \`id_voucher_vm\` INT(11) NOT NULL COMMENT 'ID do voucher no sistema VM-lav',
        \`codigo\` VARCHAR(50) NOT NULL COMMENT 'Código do voucher',
        \`categoria_id\` INT(11) NULL COMMENT 'ID da categoria do voucher',
        \`categoria_nome\` VARCHAR(100) NULL COMMENT 'Nome da categoria do voucher',
        \`data_gerado\` DATETIME NULL COMMENT 'Data de criação do voucher',
        \`validade_inicio\` DATETIME NULL COMMENT 'Início da validade',
        \`validade_fim\` DATETIME NULL COMMENT 'Fim da validade',
        \`valor\` DECIMAL(10,2) NOT NULL DEFAULT '0.00' COMMENT 'Valor total do voucher',
        \`saldo\` DECIMAL(10,2) NOT NULL DEFAULT '0.00' COMMENT 'Saldo restante do voucher',
        \`responsavel\` VARCHAR(255) NULL COMMENT 'Responsável/Local da criação',
        \`carteira\` INT(11) NULL COMMENT 'ID da carteira associada',
        \`cliente_cpf\` VARCHAR(20) NULL COMMENT 'CPF do cliente extraído',
        \`cliente_nome\` VARCHAR(255) NULL COMMENT 'Nome do cliente extraído',
        \`ativo\` TINYINT(1) NOT NULL DEFAULT '1' COMMENT 'Status do voucher (ativo/inativo)',
        \`created_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`) USING BTREE,
        UNIQUE INDEX \`idx_user_voucher_vm\` (\`user_id\`, \`id_voucher_vm\`) USING BTREE,
        INDEX \`idx_cliente_cpf\` (\`cliente_cpf\`) USING BTREE,
        INDEX \`idx_codigo\` (\`codigo\`) USING BTREE,
        CONSTRAINT \`vm_lav_vouchers_ibfk_1\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON UPDATE RESTRICT ON DELETE CASCADE
      ) ENGINE=InnoDB COLLATE='utf8mb4_unicode_ci';
    `);

        logger.info('Tabela vm_lav_vouchers criada ou já existente.');
    } catch (err: any) {
        logger.error('Erro ao criar tabela vm_lav_vouchers: ' + err.message);
        throw err;
    } finally {
        conn.release();
    }
}

export default migrateVouchersTable;
