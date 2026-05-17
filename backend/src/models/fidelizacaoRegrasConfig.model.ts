import pool from '../config/database';

export interface FidelizacaoRegrasConfig {
  id: number;
  user_id: number;
  ativo: boolean;
  max_mensagens_por_cliente_semana: number;
  max_mensagens_por_cliente_mes: number;
  simulacao: boolean;
  intervalo_verificacao_minutos: number;
  ultima_verificacao_automaticoes: Date | null;
  created_at: Date;
  updated_at: Date;
}

export type FidelizacaoRegrasConfigUpsert = Omit<FidelizacaoRegrasConfig, 'id' | 'created_at' | 'updated_at' | 'ultima_verificacao_automaticoes'> & {
  intervalo_verificacao_minutos?: number;
};

export class FidelizacaoRegrasConfigModel {
  async findByUserId(userId: number): Promise<FidelizacaoRegrasConfig | null> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT id, user_id, ativo, max_mensagens_por_cliente_semana, max_mensagens_por_cliente_mes, simulacao,
         COALESCE(intervalo_verificacao_minutos, 60) AS intervalo_verificacao_minutos,
         ultima_verificacao_automaticoes, created_at, updated_at
         FROM fidelizacao_regras_config WHERE user_id = ?`,
        [userId]
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

  async getOrCreateDefault(userId: number): Promise<FidelizacaoRegrasConfig> {
    const existing = await this.findByUserId(userId);
    if (existing) return existing;
    return this.upsert({
      user_id: userId,
      ativo: false,
      max_mensagens_por_cliente_semana: 2,
      max_mensagens_por_cliente_mes: 4,
      simulacao: true,
      intervalo_verificacao_minutos: 60,
    });
  }

  async upsert(config: FidelizacaoRegrasConfigUpsert): Promise<FidelizacaoRegrasConfig> {
    const conn = await pool.getConnection();
    try {
      const existing = await this.findByUserId(config.user_id);
      if (existing) {
        await conn.query(
          `UPDATE fidelizacao_regras_config SET
           ativo = ?, max_mensagens_por_cliente_semana = ?, max_mensagens_por_cliente_mes = ?, simulacao = ?,
           intervalo_verificacao_minutos = COALESCE(?, intervalo_verificacao_minutos, 60)
           WHERE user_id = ?`,
          [
            config.ativo ? 1 : 0,
            config.max_mensagens_por_cliente_semana,
            config.max_mensagens_por_cliente_mes,
            config.simulacao ? 1 : 0,
            config.intervalo_verificacao_minutos ?? 60,
            config.user_id,
          ]
        );
        const updated = await this.findByUserId(config.user_id);
        if (!updated) throw new Error('Erro ao atualizar config');
        return updated;
      }

      await conn.query(
        `INSERT INTO fidelizacao_regras_config (user_id, ativo, max_mensagens_por_cliente_semana, max_mensagens_por_cliente_mes, simulacao, intervalo_verificacao_minutos)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          config.user_id,
          config.ativo ? 1 : 0,
          config.max_mensagens_por_cliente_semana,
          config.max_mensagens_por_cliente_mes,
          config.simulacao ? 1 : 0,
          config.intervalo_verificacao_minutos ?? 60,
        ]
      );
      const created = await this.findByUserId(config.user_id);
      if (!created) throw new Error('Erro ao criar config');
      return created;
    } finally {
      conn.release();
    }
  }

  private mapRow(row: any): FidelizacaoRegrasConfig {
    return {
      id: row.id,
      user_id: row.user_id,
      ativo: row.ativo === 1 || row.ativo === true,
      max_mensagens_por_cliente_semana: Number(row.max_mensagens_por_cliente_semana) ?? 2,
      max_mensagens_por_cliente_mes: Number(row.max_mensagens_por_cliente_mes) ?? 4,
      simulacao: row.simulacao === 1 || row.simulacao === true,
      intervalo_verificacao_minutos: Number(row.intervalo_verificacao_minutos) ?? 60,
      ultima_verificacao_automaticoes: row.ultima_verificacao_automaticoes ? new Date(row.ultima_verificacao_automaticoes) : null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  /**
   * Lista usuários com automações ativas que precisam ser verificados
   * (ultima_verificacao + intervalo já passou ou nunca foi executado).
   */
  async findUsuariosParaVerificacao(): Promise<{ user_id: number }[]> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT user_id FROM fidelizacao_regras_config
         WHERE ativo = 1
         AND (
           ultima_verificacao_automaticoes IS NULL
           OR ultima_verificacao_automaticoes <= NOW() - INTERVAL COALESCE(intervalo_verificacao_minutos, 60) MINUTE
         )`
      ) as any;

      let rows: any[] = [];
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
        rows = Array.from(queryResult as any);
      }
      return rows.map((r: any) => ({ user_id: r.user_id }));
    } finally {
      conn.release();
    }
  }

  /**
   * Atualiza o timestamp da última verificação de automações.
   */
  async atualizarUltimaVerificacao(userId: number): Promise<void> {
    const conn = await pool.getConnection();
    try {
      await conn.query(
        `UPDATE fidelizacao_regras_config SET ultima_verificacao_automaticoes = NOW() WHERE user_id = ?`,
        [userId]
      );
    } finally {
      conn.release();
    }
  }
}
