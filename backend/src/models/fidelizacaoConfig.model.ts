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
  template_mensagem_entrega: string | null;
  template_mensagem_progresso: string | null;
  simulacao: boolean;
  simulacao_desativada_em: Date | null;
  created_at: Date;
  updated_at: Date;
}

export class FidelizacaoConfigModel {
  /**
   * Busca configuração por user_id.
   * Se a coluna simulacao_desativada_em não existir, usa SELECT sem ela.
   */
  async findByUserId(userId: number): Promise<FidelizacaoConfig | null> {
    const conn = await pool.getConnection();
    try {
      const fullSelect = `SELECT id, user_id, notificar_conquistas, notificar_progresso, frequencia_progresso, 
         percentual_mudanca_minima, template_mensagem_conquista, template_mensagem_entrega, template_mensagem_progresso, 
         simulacao, simulacao_desativada_em, created_at, updated_at 
         FROM fidelizacao_config WHERE user_id = ?`;
      const selectSemEntregaComBarreira = `SELECT id, user_id, notificar_conquistas, notificar_progresso, frequencia_progresso, 
         percentual_mudanca_minima, template_mensagem_conquista, template_mensagem_progresso, 
         simulacao, simulacao_desativada_em, created_at, updated_at 
         FROM fidelizacao_config WHERE user_id = ?`;
      const fallbackSelect = `SELECT id, user_id, notificar_conquistas, notificar_progresso, frequencia_progresso, 
         percentual_mudanca_minima, template_mensagem_conquista, template_mensagem_progresso, 
         simulacao, created_at, updated_at 
         FROM fidelizacao_config WHERE user_id = ?`;

      let queryResult: any;
      try {
        queryResult = await conn.query(fullSelect, [userId]);
      } catch (err: any) {
        const msg = err?.message || '';
        if (msg.includes('template_mensagem_entrega')) {
          try {
            queryResult = await conn.query(selectSemEntregaComBarreira, [userId]);
          } catch (err2: any) {
            if ((err2?.message || '').includes('simulacao_desativada_em') || (err2?.message || '').includes('Unknown column')) {
              queryResult = await conn.query(fallbackSelect, [userId]);
            } else {
              throw err2;
            }
          }
        } else if (msg.includes('simulacao_desativada_em') || msg.includes('Unknown column')) {
          queryResult = await conn.query(fallbackSelect, [userId]);
        } else {
          throw err;
        }
      }

      let rows: any[] = [];
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
        rows = Array.from(queryResult as any);
      }

      if (rows && rows.length > 0) {
        const row = rows[0];
        if (row.simulacao_desativada_em === undefined) {
          row.simulacao_desativada_em = null;
        }
        return this.mapRowToConfig(row);
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
        // Atualizar — se simulacao estiver sendo desativada (era true, agora é false), registrar o timestamp
        const desativandoSimulacao = existing.simulacao === true && config.simulacao === false;
        const simulacaoDesativadaEm = desativandoSimulacao ? new Date() : existing.simulacao_desativada_em;

        try {
          await conn.query(
            `UPDATE fidelizacao_config SET 
             notificar_conquistas = ?, notificar_progresso = ?, frequencia_progresso = ?, 
             percentual_mudanca_minima = ?, template_mensagem_conquista = ?, template_mensagem_entrega = ?,
             template_mensagem_progresso = ?, simulacao = ?, simulacao_desativada_em = ?
             WHERE user_id = ?`,
            [
              config.notificar_conquistas ? 1 : 0,
              config.notificar_progresso ? 1 : 0,
              config.frequencia_progresso,
              config.percentual_mudanca_minima,
              config.template_mensagem_conquista,
              config.template_mensagem_entrega ?? null,
              config.template_mensagem_progresso,
              config.simulacao ? 1 : 0,
              simulacaoDesativadaEm || null,
              config.user_id,
            ]
          );
        } catch (err: any) {
          const msg = err?.message || String(err);
          if (msg.includes('template_mensagem_entrega')) {
            try {
              await conn.query(
                `UPDATE fidelizacao_config SET 
                 notificar_conquistas = ?, notificar_progresso = ?, frequencia_progresso = ?, 
                 percentual_mudanca_minima = ?, template_mensagem_conquista = ?, 
                 template_mensagem_progresso = ?, simulacao = ?, simulacao_desativada_em = ?
                 WHERE user_id = ?`,
                [
                  config.notificar_conquistas ? 1 : 0,
                  config.notificar_progresso ? 1 : 0,
                  config.frequencia_progresso,
                  config.percentual_mudanca_minima,
                  config.template_mensagem_conquista,
                  config.template_mensagem_progresso,
                  config.simulacao ? 1 : 0,
                  simulacaoDesativadaEm || null,
                  config.user_id,
                ]
              );
            } catch (err2: any) {
              const msg2 = err2?.message || String(err2);
              if (msg2.includes('simulacao_desativada_em') || msg2.includes('Unknown column')) {
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
              } else {
                throw err2;
              }
            }
          } else if (msg.includes('simulacao_desativada_em') || msg.includes('Unknown column')) {
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
          } else {
            throw err;
          }
        }
        const updated = await this.findByUserId(config.user_id);
        if (!updated) {
          throw new Error('Erro ao atualizar configuração');
        }
        return updated;
      } else {
        // Criar
        let queryResult: any;
        try {
          queryResult = await conn.query(
            `INSERT INTO fidelizacao_config 
             (user_id, notificar_conquistas, notificar_progresso, frequencia_progresso, 
              percentual_mudanca_minima, template_mensagem_conquista, template_mensagem_entrega, template_mensagem_progresso, simulacao) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              config.user_id,
              config.notificar_conquistas ? 1 : 0,
              config.notificar_progresso ? 1 : 0,
              config.frequencia_progresso,
              config.percentual_mudanca_minima,
              config.template_mensagem_conquista,
              config.template_mensagem_entrega ?? null,
              config.template_mensagem_progresso,
              config.simulacao ? 1 : 0,
            ]
          ) as any;
        } catch (insErr: any) {
          const im = insErr?.message || '';
          if (im.includes('template_mensagem_entrega')) {
            queryResult = await conn.query(
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
          } else {
            throw insErr;
          }
        }

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

    // Template padrão de entrega (voucher) — distinto do de conquista
    const templateEntregaPadrao = `Olá, {nome}!

Segue a entrega do seu prêmio: {descricao_premio}

{data_validade}

Use o código e a validade informados abaixo ao utilizar o voucher.`;

    // Template padrão de progresso
    const templateProgressoPadrao = `Olá, {primeiro_nome}! 👋
Veja seu progresso na fidelidade:

Prêmio: {lavagens_proximo_premio}
{lavagens_barra}
• {lavagens_faltam_texto}

Prêmio: {secagens_proximo_premio}
{secagens_barra}
• {secagens_faltam_texto}

Continue assim! 🚀`;

    return await this.upsert({
      user_id: userId,
      notificar_conquistas: true,
      notificar_progresso: true,
      frequencia_progresso: 'marcos',
      percentual_mudanca_minima: 10,
      template_mensagem_conquista: templateConquistaPadrao,
      template_mensagem_entrega: templateEntregaPadrao,
      template_mensagem_progresso: templateProgressoPadrao,
      simulacao: true, // Iniciar em modo simulação
      simulacao_desativada_em: null,
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
      template_mensagem_entrega: row.template_mensagem_entrega ?? null,
      template_mensagem_progresso: row.template_mensagem_progresso,
      simulacao: row.simulacao === 1 || row.simulacao === true,
      simulacao_desativada_em: row.simulacao_desativada_em ? new Date(row.simulacao_desativada_em) : null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}

