import pool from '../config/database';
import logger from '../utils/logger';

export type TipoSincronizacao = 'clientes' | 'pedidos' | 'ambos';

export interface VmLavSincronizacaoLog {
  id: number;
  user_id: number;
  tipo: TipoSincronizacao;
  data_execucao: Date;
  registros_novos: number;
  registros_alterados: number;
  registros_total: number;
  sucesso: boolean;
  erro: string | null;
  duracao_segundos: number | null;
  created_at: Date;
}

export class VmLavSincronizacaoLogModel {
  /**
   * Cria um novo log de sincronização
   */
  async create(log: Omit<VmLavSincronizacaoLog, 'id' | 'created_at'>): Promise<VmLavSincronizacaoLog> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `INSERT INTO vm_lav_sincronizacoes_log 
         (user_id, tipo, data_execucao, registros_novos, registros_alterados, registros_total, 
          sucesso, erro, duracao_segundos) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          log.user_id,
          log.tipo,
          log.data_execucao,
          log.registros_novos,
          log.registros_alterados,
          log.registros_total,
          log.sucesso ? 1 : 0,
          log.erro,
          log.duracao_segundos,
        ]
      ) as any;

      let result: any;
      if (Array.isArray(queryResult)) {
        result = queryResult[0] || queryResult;
      } else if (queryResult && typeof queryResult === 'object') {
        result = queryResult;
      } else {
        result = queryResult;
      }

      const insertId = result?.insertId || result?.insertid || (Array.isArray(result) && result[0]?.insertId);

      if (!insertId) {
        throw new Error('Não foi possível obter o ID do registro inserido');
      }

      const created = await this.findById(insertId);
      if (!created) {
        throw new Error('Erro ao criar log de sincronização');
      }
      return created;
    } finally {
      conn.release();
    }
  }

  /**
   * Busca log por ID
   */
  async findById(id: number): Promise<VmLavSincronizacaoLog | null> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT id, user_id, tipo, data_execucao, registros_novos, registros_alterados, 
         registros_total, sucesso, erro, duracao_segundos, created_at 
         FROM vm_lav_sincronizacoes_log WHERE id = ?`,
        [id]
      ) as any;

      let rows: any[] = [];
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
        rows = Array.from(queryResult as any);
      }

      if (rows && rows.length > 0) {
        return this.mapRowToLog(rows[0]);
      }
      return null;
    } finally {
      conn.release();
    }
  }

  /**
   * Lista logs por usuário
   */
  async findByUserId(userId: number, limit: number = 50): Promise<VmLavSincronizacaoLog[]> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT id, user_id, tipo, data_execucao, registros_novos, registros_alterados, 
         registros_total, sucesso, erro, duracao_segundos, created_at 
         FROM vm_lav_sincronizacoes_log 
         WHERE user_id = ? 
         ORDER BY data_execucao DESC 
         LIMIT ?`,
        [userId, limit]
      ) as any;

      let rows: any[] = [];
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
        rows = Array.from(queryResult as any);
      }

      return Array.isArray(rows) ? rows.map((row: any) => this.mapRowToLog(row)) : [];
    } finally {
      conn.release();
    }
  }

  private mapRowToLog(row: any): VmLavSincronizacaoLog {
    return {
      id: row.id,
      user_id: row.user_id,
      tipo: row.tipo as TipoSincronizacao,
      data_execucao: row.data_execucao,
      registros_novos: row.registros_novos || 0,
      registros_alterados: row.registros_alterados || 0,
      registros_total: row.registros_total || 0,
      sucesso: row.sucesso === 1 || row.sucesso === true,
      erro: row.erro,
      duracao_segundos: row.duracao_segundos,
      created_at: row.created_at,
    };
  }
}

