import pool from '../config/database';

export interface SegmentacaoPublico {
  genero?: string | null;
  idade_min?: number | null;
  idade_max?: number | null;
  tempo_cadastro_min_dias?: number | null;
  qtd_compras_min?: number | null;
  qtd_compras_max?: number | null;
  valor_gasto_min?: number | null;
  valor_gasto_max?: number | null;
  qtd_compras_90_min?: number | null;
  cadastro_de?: string | null;
  cadastro_ate?: string | null;
  pedido_de?: string | null;
  pedido_ate?: string | null;
}

export interface FidelizacaoRegra {
  id: number;
  user_id: number;
  tipo_gatilho_id: number;
  nome_regra: string;
  parametros: Record<string, number | string>;
  segmentacao: SegmentacaoPublico | null;
  mensagem_template: string;
  frequencia_minima_dias: number;
  horario_inicio: string;
  horario_fim: string;
  vigencia_inicio: Date;
  vigencia_fim: Date | null;
  ativo: boolean;
  created_at: Date;
  updated_at: Date;
}

export type FidelizacaoRegraCreate = Omit<FidelizacaoRegra, 'id' | 'created_at' | 'updated_at'>;
export type FidelizacaoRegraUpdate = Partial<Omit<FidelizacaoRegra, 'id' | 'user_id' | 'created_at'>>;

export class FidelizacaoRegraModel {
  async findByUserId(userId: number): Promise<FidelizacaoRegra[]> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT id, user_id, tipo_gatilho_id, nome_regra, parametros, segmentacao, mensagem_template, frequencia_minima_dias,
         horario_inicio, horario_fim, vigencia_inicio, vigencia_fim, ativo, created_at, updated_at
         FROM fidelizacao_regras WHERE user_id = ? ORDER BY nome_regra ASC`,
        [userId]
      ) as any;

      let rows: any[] = [];
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
        rows = Array.from(queryResult as any);
      }

      return (rows || []).map((row: any) => this.mapRow(row));
    } finally {
      conn.release();
    }
  }

  async findById(id: number): Promise<FidelizacaoRegra | null> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT id, user_id, tipo_gatilho_id, nome_regra, parametros, segmentacao, mensagem_template, frequencia_minima_dias,
         horario_inicio, horario_fim, vigencia_inicio, vigencia_fim, ativo, created_at, updated_at
         FROM fidelizacao_regras WHERE id = ?`,
        [id]
      ) as any;

      let rows: any[] = [];
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      }
      if (rows && rows.length > 0) {
        return this.mapRow(rows[0]);
      }
      return null;
    } finally {
      conn.release();
    }
  }

  async findAtivasByUserId(userId: number): Promise<FidelizacaoRegra[]> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT id, user_id, tipo_gatilho_id, nome_regra, parametros, segmentacao, mensagem_template, frequencia_minima_dias,
         horario_inicio, horario_fim, vigencia_inicio, vigencia_fim, ativo, created_at, updated_at
         FROM fidelizacao_regras WHERE user_id = ? AND ativo = 1 ORDER BY nome_regra ASC`,
        [userId]
      ) as any;

      let rows: any[] = [];
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      }
      return (rows || []).map((row: any) => this.mapRow(row));
    } finally {
      conn.release();
    }
  }

  async create(regra: FidelizacaoRegraCreate): Promise<FidelizacaoRegra> {
    const conn = await pool.getConnection();
    try {
      const parametrosJson = JSON.stringify(regra.parametros || {});
      const segmentacaoJson = regra.segmentacao && Object.keys(regra.segmentacao).length > 0
        ? JSON.stringify(regra.segmentacao)
        : null;
      const vigenciaFim = regra.vigencia_fim ?? null;
      const queryResult = await conn.query(
        `INSERT INTO fidelizacao_regras
         (user_id, tipo_gatilho_id, nome_regra, parametros, segmentacao, mensagem_template, frequencia_minima_dias,
          horario_inicio, horario_fim, vigencia_inicio, vigencia_fim, ativo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          regra.user_id,
          regra.tipo_gatilho_id,
          regra.nome_regra,
          parametrosJson,
          segmentacaoJson,
          regra.mensagem_template,
          regra.frequencia_minima_dias,
          regra.horario_inicio,
          regra.horario_fim,
          regra.vigencia_inicio,
          vigenciaFim,
          regra.ativo ? 1 : 0,
        ]
      ) as any;

      const insertId = this.getInsertId(queryResult);
      if (!insertId) throw new Error('Não foi possível obter o ID da regra inserida');
      const created = await this.findById(insertId);
      if (!created) throw new Error('Erro ao buscar regra criada');
      return created;
    } finally {
      conn.release();
    }
  }

  async update(id: number, updates: FidelizacaoRegraUpdate): Promise<FidelizacaoRegra> {
    const conn = await pool.getConnection();
    try {
      const fields: string[] = [];
      const values: any[] = [];

      if (updates.nome_regra !== undefined) {
        fields.push('nome_regra = ?');
        values.push(updates.nome_regra);
      }
      if (updates.parametros !== undefined) {
        fields.push('parametros = ?');
        values.push(JSON.stringify(updates.parametros));
      }
      if (updates.segmentacao !== undefined) {
        fields.push('segmentacao = ?');
        values.push(updates.segmentacao && Object.keys(updates.segmentacao).length > 0 ? JSON.stringify(updates.segmentacao) : null);
      }
      if (updates.mensagem_template !== undefined) {
        fields.push('mensagem_template = ?');
        values.push(updates.mensagem_template);
      }
      if (updates.frequencia_minima_dias !== undefined) {
        fields.push('frequencia_minima_dias = ?');
        values.push(updates.frequencia_minima_dias);
      }
      if (updates.horario_inicio !== undefined) {
        fields.push('horario_inicio = ?');
        values.push(updates.horario_inicio);
      }
      if (updates.horario_fim !== undefined) {
        fields.push('horario_fim = ?');
        values.push(updates.horario_fim);
      }
      if (updates.vigencia_inicio !== undefined) {
        fields.push('vigencia_inicio = ?');
        values.push(updates.vigencia_inicio);
      }
      if (updates.vigencia_fim !== undefined) {
        fields.push('vigencia_fim = ?');
        values.push(updates.vigencia_fim);
      }
      if (updates.ativo !== undefined) {
        fields.push('ativo = ?');
        values.push(updates.ativo ? 1 : 0);
      }
      if (updates.tipo_gatilho_id !== undefined) {
        fields.push('tipo_gatilho_id = ?');
        values.push(updates.tipo_gatilho_id);
      }

      if (fields.length === 0) {
        const existing = await this.findById(id);
        if (!existing) throw new Error('Regra não encontrada');
        return existing;
      }

      values.push(id);
      await conn.query(
        `UPDATE fidelizacao_regras SET ${fields.join(', ')} WHERE id = ?`,
        values
      );

      const updated = await this.findById(id);
      if (!updated) throw new Error('Regra não encontrada após update');
      return updated;
    } finally {
      conn.release();
    }
  }

  async delete(id: number): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query('DELETE FROM fidelizacao_regras WHERE id = ?', [id]) as any;
      return result?.affectedRows > 0;
    } finally {
      conn.release();
    }
  }

  private getInsertId(queryResult: any): number | null {
    let result: any;
    if (Array.isArray(queryResult)) {
      result = queryResult[0] || queryResult;
    } else {
      result = queryResult;
    }
    const insertId = result?.insertId ?? result?.insertid ?? (Array.isArray(result) && result[0]?.insertId);
    return insertId != null ? Number(insertId) : null;
  }

  private mapRow(row: any): FidelizacaoRegra {
    let parametros: Record<string, number | string> = {};
    if (row.parametros) {
      try {
        parametros = typeof row.parametros === 'string' ? JSON.parse(row.parametros) : row.parametros;
      } catch {
        parametros = {};
      }
    }
    let segmentacao: SegmentacaoPublico | null = null;
    if (row.segmentacao) {
      try {
        const seg = typeof row.segmentacao === 'string' ? JSON.parse(row.segmentacao) : row.segmentacao;
        if (seg && typeof seg === 'object' && Object.keys(seg).length > 0) segmentacao = seg;
      } catch {
        segmentacao = null;
      }
    }

    const horarioInicio = row.horario_inicio;
    const horarioFim = row.horario_fim;

    return {
      id: row.id,
      user_id: row.user_id,
      tipo_gatilho_id: row.tipo_gatilho_id,
      nome_regra: row.nome_regra,
      parametros,
      segmentacao,
      mensagem_template: row.mensagem_template,
      frequencia_minima_dias: Number(row.frequencia_minima_dias) || 30,
      horario_inicio: typeof horarioInicio === 'string' ? horarioInicio.substring(0, 8) : (horarioInicio?.toString?.() || '08:00:00'),
      horario_fim: typeof horarioFim === 'string' ? horarioFim.substring(0, 8) : (horarioFim?.toString?.() || '20:00:00'),
      vigencia_inicio: row.vigencia_inicio ? new Date(row.vigencia_inicio) : new Date(),
      vigencia_fim: row.vigencia_fim ? new Date(row.vigencia_fim) : null,
      ativo: row.ativo === 1 || row.ativo === true,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
