import pool from '../config/database';
import logger from '../utils/logger';

export interface PremioCliente {
  id: number;
  user_id: number;
  cpf_cliente: string;
  premio_id: number;
  data_conquista: Date;
  data_validade: Date | null;
  data_utilizacao: Date | null;
  utilizado: boolean;
  observacao: string | null;
  created_at: Date;
  updated_at: Date;
}

export class PremioClienteModel {
  async findById(id: number): Promise<PremioCliente | null> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT id, user_id, cpf_cliente, premio_id, data_conquista, data_validade, 
         data_utilizacao, utilizado, observacao, created_at, updated_at 
         FROM premios_clientes WHERE id = ?`,
        [id]
      ) as any;

      let rows: any[] = [];
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
        rows = Array.from(queryResult as any);
      }

      if (rows && rows.length > 0) {
        return this.mapRowToPremioCliente(rows[0]);
      }
      return null;
    } finally {
      conn.release();
    }
  }

  async findByCpf(userId: number, cpf: string): Promise<PremioCliente[]> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT id, user_id, cpf_cliente, premio_id, data_conquista, data_validade, 
         data_utilizacao, utilizado, observacao, created_at, updated_at 
         FROM premios_clientes 
         WHERE user_id = ? AND cpf_cliente = ? 
         ORDER BY data_conquista DESC`,
        [userId, cpf]
      ) as any;

      let rows: any[] = [];
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
        rows = Array.from(queryResult as any);
      }

      return Array.isArray(rows) ? rows.map((row: any) => this.mapRowToPremioCliente(row)) : [];
    } finally {
      conn.release();
    }
  }

  async findByPremioId(userId: number, premioId: number): Promise<PremioCliente[]> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT id, user_id, cpf_cliente, premio_id, data_conquista, data_validade, 
         data_utilizacao, utilizado, observacao, created_at, updated_at 
         FROM premios_clientes 
         WHERE user_id = ? AND premio_id = ? 
         ORDER BY data_conquista DESC`,
        [userId, premioId]
      ) as any;

      let rows: any[] = [];
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
        rows = Array.from(queryResult as any);
      }

      return Array.isArray(rows) ? rows.map((row: any) => this.mapRowToPremioCliente(row)) : [];
    } finally {
      conn.release();
    }
  }

  async verificarSeJaConquistado(userId: number, cpf: string, premioId: number): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT COUNT(*) as count FROM premios_clientes 
         WHERE user_id = ? AND cpf_cliente = ? AND premio_id = ?`,
        [userId, cpf, premioId]
      ) as any;

      let rows: any[] = [];
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
        rows = Array.from(queryResult as any);
      }

      const count = rows && rows[0] ? rows[0].count : 0;
      return Number(count) > 0;
    } finally {
      conn.release();
    }
  }

  /**
   * Obtém a última data de conquista de um prêmio para um cliente
   * Retorna null se nunca foi conquistado
   */
  async obterUltimaDataConquista(userId: number, cpf: string, premioId: number): Promise<Date | null> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT MAX(data_conquista) as ultima_data FROM premios_clientes 
         WHERE user_id = ? AND cpf_cliente = ? AND premio_id = ?`,
        [userId, cpf, premioId]
      ) as any;

      let rows: any[] = [];
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
        rows = Array.from(queryResult as any);
      }

      if (rows && rows[0] && rows[0].ultima_data) {
        return new Date(rows[0].ultima_data);
      }
      return null;
    } finally {
      conn.release();
    }
  }

  /**
   * Conta quantas vezes um prêmio foi conquistado por um cliente
   */
  async contarConquistas(userId: number, cpf: string, premioId: number): Promise<number> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT COUNT(*) as count FROM premios_clientes 
         WHERE user_id = ? AND cpf_cliente = ? AND premio_id = ?`,
        [userId, cpf, premioId]
      ) as any;

      let rows: any[] = [];
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
        rows = Array.from(queryResult as any);
      }

      const count = rows && rows[0] ? rows[0].count : 0;
      return Number(count);
    } finally {
      conn.release();
    }
  }

  async create(premioCliente: Omit<PremioCliente, 'id' | 'created_at' | 'updated_at'>): Promise<PremioCliente> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `INSERT INTO premios_clientes 
         (user_id, cpf_cliente, premio_id, data_conquista, data_validade, data_utilizacao, utilizado, observacao) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          premioCliente.user_id,
          premioCliente.cpf_cliente,
          premioCliente.premio_id,
          premioCliente.data_conquista,
          premioCliente.data_validade,
          premioCliente.data_utilizacao,
          premioCliente.utilizado ? 1 : 0,
          premioCliente.observacao,
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
        throw new Error('Erro ao criar prêmio do cliente');
      }
      return created;
    } finally {
      conn.release();
    }
  }

  async marcarComoUtilizado(id: number, dataUtilizacao: Date, observacao?: string): Promise<PremioCliente> {
    const conn = await pool.getConnection();
    try {
      await conn.query(
        `UPDATE premios_clientes 
         SET utilizado = 1, data_utilizacao = ?, observacao = COALESCE(?, observacao) 
         WHERE id = ?`,
        [dataUtilizacao, observacao, id]
      );

      const updated = await this.findById(id);
      if (!updated) {
        throw new Error('Erro ao atualizar prêmio do cliente');
      }
      return updated;
    } finally {
      conn.release();
    }
  }

  private mapRowToPremioCliente(row: any): PremioCliente {
    return {
      id: row.id,
      user_id: row.user_id,
      cpf_cliente: row.cpf_cliente,
      premio_id: row.premio_id,
      data_conquista: row.data_conquista,
      data_validade: row.data_validade,
      data_utilizacao: row.data_utilizacao,
      utilizado: row.utilizado === 1 || row.utilizado === true,
      observacao: row.observacao,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}

