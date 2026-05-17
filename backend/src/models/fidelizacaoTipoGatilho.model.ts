import pool from '../config/database';

export interface ParametroCampo {
  nome: string;
  tipo: string;
  label: string;
  obrigatorio?: boolean;
  default?: number | string;
  min?: number;
  max?: number;
  placeholder?: string;
  placeholder_sql: string;
}

export interface ParametrosSchema {
  campos: ParametroCampo[];
}

export interface FidelizacaoTipoGatilho {
  id: number;
  codigo: string;
  nome_exibicao: string;
  descricao: string | null;
  query_template: string;
  parametros_schema: ParametrosSchema;
  placeholders_disponiveis: string[];
  frequencia_minima_dias_default: number;
  ativo: boolean;
  created_at: Date;
  updated_at: Date;
}

export class FidelizacaoTipoGatilhoModel {
  async findAll(apenasAtivos: boolean = true): Promise<FidelizacaoTipoGatilho[]> {
    const conn = await pool.getConnection();
    try {
      const where = apenasAtivos ? ' WHERE ativo = 1' : '';
      const queryResult = await conn.query(
        `SELECT id, codigo, nome_exibicao, descricao, query_template, parametros_schema, placeholders_disponiveis,
         frequencia_minima_dias_default, ativo, created_at, updated_at
         FROM fidelizacao_tipos_gatilho${where}
         ORDER BY nome_exibicao ASC`,
        []
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

  async findById(id: number): Promise<FidelizacaoTipoGatilho | null> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT id, codigo, nome_exibicao, descricao, query_template, parametros_schema, placeholders_disponiveis,
         frequencia_minima_dias_default, ativo, created_at, updated_at
         FROM fidelizacao_tipos_gatilho WHERE id = ?`,
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

  async findByCodigo(codigo: string): Promise<FidelizacaoTipoGatilho | null> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT id, codigo, nome_exibicao, descricao, query_template, parametros_schema, placeholders_disponiveis,
         frequencia_minima_dias_default, ativo, created_at, updated_at
         FROM fidelizacao_tipos_gatilho WHERE codigo = ? LIMIT 1`,
        [codigo]
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

  private mapRow(row: any): FidelizacaoTipoGatilho {
    let parametros_schema: ParametrosSchema = { campos: [] };
    if (row.parametros_schema) {
      try {
        parametros_schema = typeof row.parametros_schema === 'string'
          ? JSON.parse(row.parametros_schema) : row.parametros_schema;
      } catch {
        parametros_schema = { campos: [] };
      }
    }

    let placeholders_disponiveis: string[] = [];
    if (row.placeholders_disponiveis) {
      try {
        placeholders_disponiveis = typeof row.placeholders_disponiveis === 'string'
          ? JSON.parse(row.placeholders_disponiveis) : row.placeholders_disponiveis;
      } catch {
        placeholders_disponiveis = [];
      }
    }

    return {
      id: row.id,
      codigo: row.codigo,
      nome_exibicao: row.nome_exibicao,
      descricao: row.descricao,
      query_template: row.query_template,
      parametros_schema,
      placeholders_disponiveis,
      frequencia_minima_dias_default: Number(row.frequencia_minima_dias_default) || 30,
      ativo: row.ativo === 1 || row.ativo === true,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
