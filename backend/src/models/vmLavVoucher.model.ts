import pool from '../config/database';
import logger from '../utils/logger';
import { normalizeCpfToDigits, normalizeCpfColumnSql } from '../utils/cpfUtils';

export interface VmLavVoucher {
    id: number;
    user_id: number;
    id_voucher_vm: number;
    codigo: string;
    categoria_id: number | null;
    categoria_nome: string | null;
    data_gerado: Date | null;
    validade_inicio: Date | null;
    validade_fim: Date | null;
    valor: number;
    saldo: number;
    responsavel: string | null;
    carteira: number | null;
    cliente_cpf: string | null;
    cliente_nome: string | null;
    ativo: boolean;
    created_at: Date;
    updated_at: Date;
}

export class VmLavVoucherModel {
    async findById(id: number): Promise<VmLavVoucher | null> {
        const conn = await pool.getConnection();
        try {
            const queryResult = await conn.query(
                'SELECT * FROM vm_lav_vouchers WHERE id = ?',
                [id]
            );

            let rows: any[] = [];
            if (Array.isArray(queryResult)) {
                rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
            } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
                rows = Array.from(queryResult as any);
            }

            if (rows && rows.length > 0) {
                return this.mapRowToVoucher(rows[0]);
            }
            return null;
        } finally {
            conn.release();
        }
    }

    async findByIdVoucherVm(idVoucherVm: number, userId: number): Promise<VmLavVoucher | null> {
        const conn = await pool.getConnection();
        try {
            const queryResult = await conn.query(
                'SELECT * FROM vm_lav_vouchers WHERE id_voucher_vm = ? AND user_id = ?',
                [idVoucherVm, userId]
            );

            let rows: any[] = [];
            if (Array.isArray(queryResult)) {
                rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
            } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
                rows = Array.from(queryResult as any);
            }

            if (rows && rows.length > 0) {
                return this.mapRowToVoucher(rows[0]);
            }
            return null;
        } finally {
            conn.release();
        }
    }

    async findByCodigo(codigo: string, userId: number): Promise<VmLavVoucher | null> {
        const conn = await pool.getConnection();
        try {
            const queryResult = await conn.query(
                'SELECT * FROM vm_lav_vouchers WHERE codigo = ? AND user_id = ?',
                [codigo, userId]
            );

            let rows: any[] = [];
            if (Array.isArray(queryResult)) {
                rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
            } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
                rows = Array.from(queryResult as any);
            }

            if (rows && rows.length > 0) {
                return this.mapRowToVoucher(rows[0]);
            }
            return null;
        } finally {
            conn.release();
        }
    }

    /**
     * Lista todos os vouchers já gerados para o cliente (por user_id e CPF normalizado).
     * Inclui vouchers com saldo zerado. Ordenado por data_gerado DESC.
     */
    async findByUserIdAndClienteCpf(userId: number, cpf: string): Promise<VmLavVoucher[]> {
        const cpfNorm = normalizeCpfToDigits(cpf);
        if (!cpfNorm) return [];
        const conn = await pool.getConnection();
        try {
            const cpfCol = normalizeCpfColumnSql('cliente_cpf');
            const queryResult = await conn.query(
                `SELECT * FROM vm_lav_vouchers WHERE user_id = ? AND ${cpfCol} = ? ORDER BY data_gerado DESC`,
                [userId, cpfNorm]
            );

            let rows: any[] = [];
            if (Array.isArray(queryResult)) {
                rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
            } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
                rows = Array.from(queryResult as any);
            }

            return (rows || []).map((r: any) => this.mapRowToVoucher(r));
        } finally {
            conn.release();
        }
    }

    async bulkUpsert(vouchers: Omit<VmLavVoucher, 'id' | 'created_at' | 'updated_at'>[]): Promise<void> {
        if (vouchers.length === 0) return;

        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();

            const batchSize = 100;
            let novos = 0;
            let alterados = 0;

            for (let i = 0; i < vouchers.length; i += batchSize) {
                const chunk = vouchers.slice(i, i + batchSize);

                // UNIQUE KEY: user_id, id_voucher_vm
                const searchValues: any[] = [];
                const placeholders = chunk.map(v => {
                    searchValues.push(v.id_voucher_vm, v.user_id);
                    return '(?, ?)';
                }).join(',');

                const queryResult = await conn.query(
                    `SELECT id, id_voucher_vm, user_id FROM vm_lav_vouchers WHERE (id_voucher_vm, user_id) IN (${placeholders})`,
                    searchValues
                );

                let existingRows: any[] = [];
                if (Array.isArray(queryResult)) {
                    existingRows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
                } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
                    existingRows = Array.from(queryResult as any);
                }

                const existingMap = new Map<string, number>();
                for (const row of existingRows) {
                    existingMap.set(`${row.id_voucher_vm}_${row.user_id}`, row.id);
                }

                const toInsert: any[][] = [];
                const toUpdate: any[][] = [];

                for (const v of chunk) {
                    const existingId = existingMap.get(`${v.id_voucher_vm}_${v.user_id}`);
                    const values = [
                        v.codigo, v.categoria_id, v.categoria_nome, v.data_gerado,
                        v.validade_inicio, v.validade_fim, v.valor, v.saldo,
                        v.responsavel, v.carteira, v.cliente_cpf, v.cliente_nome,
                        v.ativo ? 1 : 0
                    ];

                    if (existingId) {
                        toUpdate.push([...values, v.id_voucher_vm, v.user_id]);
                    } else {
                        toInsert.push([v.user_id, v.id_voucher_vm, ...values]);
                    }
                }

                if (toInsert.length > 0) {
                    await conn.batch(
                        `INSERT INTO vm_lav_vouchers 
             (user_id, id_voucher_vm, codigo, categoria_id, categoria_nome, data_gerado, 
              validade_inicio, validade_fim, valor, saldo, responsavel, carteira, 
              cliente_cpf, cliente_nome, ativo) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        toInsert
                    );
                    novos += toInsert.length;
                }

                if (toUpdate.length > 0) {
                    await conn.batch(
                        `UPDATE vm_lav_vouchers SET 
             codigo = ?, categoria_id = ?, categoria_nome = ?, data_gerado = ?,
             validade_inicio = ?, validade_fim = ?, valor = ?, saldo = ?,
             responsavel = ?, carteira = ?, cliente_cpf = ?, cliente_nome = ?,
             ativo = ?
             WHERE id_voucher_vm = ? AND user_id = ?`,
                        toUpdate
                    );
                    alterados += toUpdate.length;
                }
            }

            await conn.commit();
            logger.info(`Bulk upsert vouchers: ${novos} inseridos, ${alterados} atualizados. Total: ${vouchers.length}`);
        } catch (error: any) {
            await conn.rollback();
            logger.error(`Erro ao fazer bulk upsert de vouchers: ${error.message}`);
            throw error;
        } finally {
            conn.release();
        }
    }

    private mapRowToVoucher(row: any): VmLavVoucher {
        return {
            id: row.id,
            user_id: row.user_id,
            id_voucher_vm: row.id_voucher_vm,
            codigo: row.codigo,
            categoria_id: row.categoria_id,
            categoria_nome: row.categoria_nome,
            data_gerado: row.data_gerado,
            validade_inicio: row.validade_inicio,
            validade_fim: row.validade_fim,
            valor: parseFloat(row.valor) || 0,
            saldo: parseFloat(row.saldo) || 0,
            responsavel: row.responsavel,
            carteira: row.carteira,
            cliente_cpf: row.cliente_cpf,
            cliente_nome: row.cliente_nome,
            ativo: row.ativo === 1 || row.ativo === true,
            created_at: row.created_at,
            updated_at: row.updated_at,
        };
    }
}
