import pool from '../config/database';

export type FrequenciaProgresso = 'sempre' | 'marcos' | 'mudanca_significativa';

export interface FidelizacaoConfig {
  id: number;
  user_id: number;
  notificar_conquistas: boolean;
  notificar_progresso: boolean;
  frequencia_progresso: FrequenciaProgresso;
  percentual_mudanca_minima: number;
  template_mensagem_conquista: string | null;
  template_mensagem_progresso: string | null;
  simulacao: boolean;
  created_at: Date;
  updated_at: Date;
}

export class FidelizacaoConfigModel {
  /**
   * Busca configuração por user_id
   */
  async findByUserId(userId: number): Promise<FidelizacaoConfig | null> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT id, user_id, notificar_conquistas, notificar_progresso, frequencia_progresso, 
         percentual_mudanca_minima, template_mensagem_conquista, template_mensagem_progresso, 
         simulacao, created_at, updated_at 
         FROM fidelizacao_config WHERE user_id = ?`,
        [userId]
      ) as any;

      let rows: any[] = [];
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
        rows = Array.from(queryResult as any);
      }

      if (rows && rows.length > 0) {
        return this.mapRowToConfig(rows[0]);
      }
      return null;
    } finally {
      conn.release();
    }
  }

  /**
   * Cria ou atualiza configuração (upsert)
   */
  async upsert(config: Omit<FidelizacaoConfig, 'id' | 'created_at' | 'updated_at'>): Promise<FidelizacaoConfig> {
    const conn = await pool.getConnection();
    try {
      // Verificar se já existe
      const existing = await this.findByUserId(config.user_id);

      if (existing) {
        // Atualizar
        await conn.query(
          `UPDATE fidelizacao_config SET 
           notificar_conquistas = ?, notificar_progresso = ?, frequencia_progresso = ?, 
           percentual_mudanca_minima = ?, template_mensagem_conquista = ?, 
           template_mensagem_progresso = ?, simulacao = ? 
           WHERE user_id = ?`,
          [
            config.notificar_conquistas ? 1 : 0,
            config.notificar_progresso ? 1 : 0,
            config.frequencia_progresso,
            config.percentual_mudanca_minima,
            config.template_mensagem_conquista,
            config.template_mensagem_progresso,
            config.simulacao ? 1 : 0,
            config.user_id,
          ]
        );
        const updated = await this.findByUserId(config.user_id);
        if (!updated) {
          throw new Error('Erro ao atualizar configuração');
        }
        return updated;
      } else {
        // Criar
        const queryResult = await conn.query(
          `INSERT INTO fidelizacao_config 
           (user_id, notificar_conquistas, notificar_progresso, frequencia_progresso, 
            percentual_mudanca_minima, template_mensagem_conquista, template_mensagem_progresso, simulacao) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            config.user_id,
            config.notificar_conquistas ? 1 : 0,
            config.notificar_progresso ? 1 : 0,
            config.frequencia_progresso,
            config.percentual_mudanca_minima,
            config.template_mensagem_conquista,
            config.template_mensagem_progresso,
            config.simulacao ? 1 : 0,
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

        const created = await this.findByUserId(config.user_id);
        if (!created) {
          throw new Error('Erro ao criar configuração');
        }
        return created;
      }
    } finally {
      conn.release();
    }
  }

  /**
   * Obtém ou cria configuração padrão para um usuário
   */
  async getOrCreateDefault(userId: number): Promise<FidelizacaoConfig> {
    const existing = await this.findByUserId(userId);
    if (existing) {
      return existing;
    }

    // Template padrão de conquista
    const templateConquistaPadrao = `🎉 Parabéns, {nome}!

Você conquistou um novo prêmio:
{descricao_premio}

{data_validade}

Continue utilizando nossos serviços para ganhar mais prêmios!`;

    // Template padrão de progresso
    const templateProgressoPadrao = `Olá, {nome}! 👋

Seu progresso na fidelidade:
• Lavagens: {lavagens_atual}/{lavagens_objetivo} → {lavagens_percentual}% completo
• Secagens: {secagens_atual}/{secagens_objetivo} → {secagens_percentual}% completo
• Total: {total_atual}/{total_objetivo} → {total_percentual}% completo

Próximo prêmio: {lavagens_proximo_premio}
Faltam apenas {lavagens_faltam} utilizações!

Continue assim! 🚀`;

    return await this.upsert({
      user_id: userId,
      notificar_conquistas: true,
      notificar_progresso: true,
      frequencia_progresso: 'marcos',
      percentual_mudanca_minima: 10,
      template_mensagem_conquista: templateConquistaPadrao,
      template_mensagem_progresso: templateProgressoPadrao,
      simulacao: true, // Iniciar em modo simulação
    });
  }

  private mapRowToConfig(row: any): FidelizacaoConfig {
    return {
      id: row.id,
      user_id: row.user_id,
      notificar_conquistas: row.notificar_conquistas === 1 || row.notificar_conquistas === true,
      notificar_progresso: row.notificar_progresso === 1 || row.notificar_progresso === true,
      frequencia_progresso: row.frequencia_progresso as FrequenciaProgresso,
      percentual_mudanca_minima: row.percentual_mudanca_minima,
      template_mensagem_conquista: row.template_mensagem_conquista,
      template_mensagem_progresso: row.template_mensagem_progresso,
      simulacao: row.simulacao === 1 || row.simulacao === true,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}

