import pool from '../config/database';

export type TipoServico = 'SECAGEM' | 'LAVAGEM' | 'TOTAL';
export type TipoAtingimento = 'UNICO' | 'PERPETUO';

export interface Premio {
  id: number;
  user_id: number;
  servico: TipoServico;
  objetivo: number;
  descricao: string;
  data_inicio_utilizacoes: Date;
  data_fim_utilizacoes: Date | null;
  tipo_atingimento: TipoAtingimento;
  validade_dias: number | null;
  valor_voucher: number | null;
  quantidade_utilizacoes: number | null;
  gerar_automatico: boolean;
  entrega_automatico: boolean;
  ativo: boolean;
  created_at: Date;
  updated_at: Date;
}

export class PremioModel {
  async findById(id: number): Promise<Premio | null> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT id, user_id, servico, objetivo, descricao, data_inicio_utilizacoes, data_fim_utilizacoes, tipo_atingimento, validade_dias, valor_voucher, quantidade_utilizacoes, gerar_automatico, entrega_automatico, ativo, created_at, updated_at 
         FROM premios WHERE id = ?`,
        [id]
      ) as any;

      let rows: any[] = [];
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
        rows = Array.from(queryResult as any);
      }

      if (rows && rows.length > 0) {
        return this.mapRowToPremio(rows[0]);
      }
      return null;
    } finally {
      conn.release();
    }
  }

  async findByUserId(userId: number, ativo?: boolean): Promise<Premio[]> {
    const conn = await pool.getConnection();
    try {
      let query = `SELECT id, user_id, servico, objetivo, descricao, data_inicio_utilizacoes, data_fim_utilizacoes, tipo_atingimento, validade_dias, valor_voucher, quantidade_utilizacoes, gerar_automatico, entrega_automatico, ativo, created_at, updated_at 
                   FROM premios WHERE user_id = ?`;
      const params: any[] = [userId];

      if (ativo !== undefined) {
        query += ' AND ativo = ?';
        params.push(ativo ? 1 : 0);
      }

      query += ' ORDER BY servico, objetivo ASC';

      const queryResult = await conn.query(query, params) as any;

      let rows: any[] = [];
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
        rows = Array.from(queryResult as any);
      }

      return Array.isArray(rows) ? rows.map((row: any) => this.mapRowToPremio(row)) : [];
    } finally {
      conn.release();
    }
  }

  async create(premio: Omit<Premio, 'id' | 'created_at' | 'updated_at'>): Promise<Premio> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `INSERT INTO premios (user_id, servico, objetivo, descricao, data_inicio_utilizacoes, data_fim_utilizacoes, tipo_atingimento, validade_dias, valor_voucher, quantidade_utilizacoes, gerar_automatico, entrega_automatico, ativo) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          premio.user_id,
          premio.servico,
          premio.objetivo,
          premio.descricao,
          premio.data_inicio_utilizacoes,
          premio.data_fim_utilizacoes || null,
          premio.tipo_atingimento || 'UNICO',
          premio.validade_dias,
          premio.valor_voucher ?? null,
          premio.quantidade_utilizacoes ?? null,
          (premio.gerar_automatico ?? false) ? 1 : 0,
          (premio.entrega_automatico ?? false) ? 1 : 0,
          premio.ativo !== undefined ? (premio.ativo ? 1 : 0) : 1,
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
        throw new Error('Erro ao criar prêmio');
      }
      return created;
    } finally {
      conn.release();
    }
  }

  async update(id: number, premio: Partial<Omit<Premio, 'id' | 'user_id' | 'created_at' | 'updated_at'>>): Promise<Premio> {
    const conn = await pool.getConnection();
    try {
      const updates: string[] = [];
      const params: any[] = [];

      if (premio.servico !== undefined) {
        updates.push('servico = ?');
        params.push(premio.servico);
      }
      if (premio.objetivo !== undefined) {
        updates.push('objetivo = ?');
        params.push(premio.objetivo);
      }
      if (premio.descricao !== undefined) {
        updates.push('descricao = ?');
        params.push(premio.descricao);
      }
      if (premio.data_inicio_utilizacoes !== undefined) {
        updates.push('data_inicio_utilizacoes = ?');
        params.push(premio.data_inicio_utilizacoes);
      }
      if (premio.data_fim_utilizacoes !== undefined) {
        updates.push('data_fim_utilizacoes = ?');
        params.push(premio.data_fim_utilizacoes);
      }
      if (premio.tipo_atingimento !== undefined) {
        updates.push('tipo_atingimento = ?');
        params.push(premio.tipo_atingimento);
      }
      if (premio.validade_dias !== undefined) {
        updates.push('validade_dias = ?');
        params.push(premio.validade_dias);
      }
      if (premio.valor_voucher !== undefined) {
        updates.push('valor_voucher = ?');
        params.push(premio.valor_voucher);
      }
      if (premio.quantidade_utilizacoes !== undefined) {
        updates.push('quantidade_utilizacoes = ?');
        params.push(premio.quantidade_utilizacoes);
      }
      if (premio.gerar_automatico !== undefined) {
        updates.push('gerar_automatico = ?');
        params.push(premio.gerar_automatico ? 1 : 0);
      }
      if (premio.entrega_automatico !== undefined) {
        updates.push('entrega_automatico = ?');
        params.push(premio.entrega_automatico ? 1 : 0);
      }
      if (premio.ativo !== undefined) {
        updates.push('ativo = ?');
        params.push(premio.ativo ? 1 : 0);
      }

      if (updates.length === 0) {
        const existing = await this.findById(id);
        if (!existing) {
          throw new Error('Prêmio não encontrado');
        }
        return existing;
      }

      params.push(id);
      await conn.query(
        `UPDATE premios SET ${updates.join(', ')} WHERE id = ?`,
        params
      );

      const updated = await this.findById(id);
      if (!updated) {
        throw new Error('Erro ao atualizar prêmio');
      }
      return updated;
    } finally {
      conn.release();
    }
  }

  async delete(id: number): Promise<void> {
    const conn = await pool.getConnection();
    try {
      await conn.query('DELETE FROM premios WHERE id = ?', [id]);
    } finally {
      conn.release();
    }
  }

  private mapRowToPremio(row: any): Premio {
    return {
      id: row.id,
      user_id: row.user_id,
      servico: row.servico,
      objetivo: row.objetivo,
      descricao: row.descricao,
      data_inicio_utilizacoes: row.data_inicio_utilizacoes,
      data_fim_utilizacoes: row.data_fim_utilizacoes || null,
      tipo_atingimento: (row.tipo_atingimento || 'UNICO') as TipoAtingimento,
      validade_dias: row.validade_dias,
      valor_voucher: row.valor_voucher != null ? parseFloat(row.valor_voucher) : null,
      quantidade_utilizacoes: row.quantidade_utilizacoes != null ? parseInt(row.quantidade_utilizacoes, 10) : null,
      gerar_automatico: row.gerar_automatico === 1 || row.gerar_automatico === true,
      entrega_automatico: row.entrega_automatico === 1 || row.entrega_automatico === true,
      ativo: row.ativo === 1 || row.ativo === true,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}

