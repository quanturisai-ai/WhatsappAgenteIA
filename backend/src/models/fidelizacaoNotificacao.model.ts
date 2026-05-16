import pool from '../config/database';

export type TipoNotificacao = 'CONQUISTA' | 'PROGRESSO';

export interface FidelizacaoNotificacao {
  id: number;
  user_id: number;
  cpf_cliente: string;
  pedido_id: number | null; // ID do pedido que gerou esta notificação (apenas para notificações automatizadas)
  tipo_notificacao: TipoNotificacao;
  premio_id: number | null;
  mensagem_enviada: string;
  enviado_whatsapp: boolean;
  data_envio: Date;
  erro: string | null;
  created_at: Date;
}

export class FidelizacaoNotificacaoModel {
  /**
   * Cria uma nova notificação no histórico
   */
  async create(notificacao: Omit<FidelizacaoNotificacao, 'id' | 'created_at'>): Promise<FidelizacaoNotificacao> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `INSERT INTO fidelizacao_notificacoes 
         (user_id, cpf_cliente, pedido_id, tipo_notificacao, premio_id, mensagem_enviada, 
          enviado_whatsapp, data_envio, erro) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          notificacao.user_id,
          notificacao.cpf_cliente,
          notificacao.pedido_id || null,
          notificacao.tipo_notificacao,
          notificacao.premio_id,
          notificacao.mensagem_enviada,
          notificacao.enviado_whatsapp ? 1 : 0,
          notificacao.data_envio,
          notificacao.erro,
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
        throw new Error('Erro ao criar notificação');
      }
      return created;
    } finally {
      conn.release();
    }
  }

  /**
   * Busca notificação por ID
   */
  async findById(id: number): Promise<FidelizacaoNotificacao | null> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT id, user_id, cpf_cliente, pedido_id, tipo_notificacao, premio_id, mensagem_enviada, 
         enviado_whatsapp, data_envio, erro, created_at 
         FROM fidelizacao_notificacoes WHERE id = ?`,
        [id]
      ) as any;

      let rows: any[] = [];
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
        rows = Array.from(queryResult as any);
      }

      if (rows && rows.length > 0) {
        return this.mapRowToNotificacao(rows[0]);
      }
      return null;
    } finally {
      conn.release();
    }
  }

  /**
   * Busca última notificação de progresso para um cliente
   */
  async findUltimaNotificacaoProgresso(userId: number, cpf: string): Promise<FidelizacaoNotificacao | null> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT id, user_id, cpf_cliente, pedido_id, tipo_notificacao, premio_id, mensagem_enviada, 
         enviado_whatsapp, data_envio, erro, created_at 
         FROM fidelizacao_notificacoes 
         WHERE user_id = ? AND cpf_cliente = ? AND tipo_notificacao = 'PROGRESSO'
         ORDER BY data_envio DESC LIMIT 1`,
        [userId, cpf]
      ) as any;

      let rows: any[] = [];
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
        rows = Array.from(queryResult as any);
      }

      if (rows && rows.length > 0) {
        return this.mapRowToNotificacao(rows[0]);
      }
      return null;
    } finally {
      conn.release();
    }
  }

  /**
   * Lista notificações por usuário e cliente
   */
  async findByCliente(userId: number, cpf: string, limit: number = 50): Promise<FidelizacaoNotificacao[]> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT id, user_id, cpf_cliente, pedido_id, tipo_notificacao, premio_id, mensagem_enviada, 
         enviado_whatsapp, data_envio, erro, created_at 
         FROM fidelizacao_notificacoes 
         WHERE user_id = ? AND cpf_cliente = ? 
         ORDER BY data_envio DESC LIMIT ?`,
        [userId, cpf, limit]
      ) as any;

      let rows: any[] = [];
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
        rows = Array.from(queryResult as any);
      }

      return Array.isArray(rows) ? rows.map((row: any) => this.mapRowToNotificacao(row)) : [];
    } finally {
      conn.release();
    }
  }

  /**
   * Atualiza uma notificação (marca como enviada ou adiciona erro)
   */
  async update(id: number, updates: { enviado_whatsapp?: boolean; erro?: string | null }): Promise<FidelizacaoNotificacao> {
    const conn = await pool.getConnection();
    try {
      const updateFields: string[] = [];
      const params: any[] = [];

      if (updates.enviado_whatsapp !== undefined) {
        updateFields.push('enviado_whatsapp = ?');
        params.push(updates.enviado_whatsapp ? 1 : 0);
      }

      if (updates.erro !== undefined) {
        updateFields.push('erro = ?');
        params.push(updates.erro);
      }

      if (updateFields.length === 0) {
        const existing = await this.findById(id);
        if (!existing) {
          throw new Error('Notificação não encontrada');
        }
        return existing;
      }

      params.push(id);
      await conn.query(
        `UPDATE fidelizacao_notificacoes SET ${updateFields.join(', ')} WHERE id = ?`,
        params
      );

      const updated = await this.findById(id);
      if (!updated) {
        throw new Error('Erro ao atualizar notificação');
      }
      return updated;
    } finally {
      conn.release();
    }
  }

  /**
   * Busca IDs de pedidos que ainda não foram notificados (para notificações automatizadas)
   * @param userId ID do usuário
   * @param tipoNotificacao Tipo de notificação ('CONQUISTA' ou 'PROGRESSO')
   * @param pedidosIds IDs dos pedidos a verificar (opcional, se não fornecido busca todos do usuário)
   */
  async findPedidosNaoNotificados(
    userId: number,
    tipoNotificacao: TipoNotificacao,
    pedidosIds?: number[]
  ): Promise<number[]> {
    const conn = await pool.getConnection();
    try {
      let query: string;
      let params: any[];

      if (pedidosIds && pedidosIds.length > 0) {
        // Verificar apenas os pedidos fornecidos
        const placeholders = pedidosIds.map(() => '?').join(',');
        query = `
          SELECT DISTINCT p.id
          FROM vm_lav_pedidos p
          WHERE p.user_id = ?
            AND p.id IN (${placeholders})
            AND p.cliente_cpf IS NOT NULL
            AND p.cliente_cpf != ''
            AND NOT EXISTS (
              SELECT 1 
              FROM fidelizacao_notificacoes n
              WHERE n.user_id = p.user_id
                AND n.pedido_id = p.id
                AND n.tipo_notificacao = ?
                AND n.pedido_id IS NOT NULL
            )
        `;
        params = [userId, ...pedidosIds, tipoNotificacao];
      } else {
        // Buscar todos os pedidos do usuário que não foram notificados
        query = `
          SELECT DISTINCT p.id
          FROM vm_lav_pedidos p
          WHERE p.user_id = ?
            AND p.cliente_cpf IS NOT NULL
            AND p.cliente_cpf != ''
            AND NOT EXISTS (
              SELECT 1 
              FROM fidelizacao_notificacoes n
              WHERE n.user_id = p.user_id
                AND n.pedido_id = p.id
                AND n.tipo_notificacao = ?
                AND n.pedido_id IS NOT NULL
            )
          ORDER BY p.data_venda DESC
        `;
        params = [userId, tipoNotificacao];
      }

      const queryResult = await conn.query(query, params) as any;

      let rows: any[] = [];
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
        rows = Array.from(queryResult as any);
      }

      return rows.map((row: any) => row.id).filter((id: any): id is number => id !== null && id !== undefined);
    } finally {
      conn.release();
    }
  }

  private mapRowToNotificacao(row: any): FidelizacaoNotificacao {
    return {
      id: row.id,
      user_id: row.user_id,
      cpf_cliente: row.cpf_cliente,
      pedido_id: row.pedido_id || null,
      tipo_notificacao: row.tipo_notificacao as TipoNotificacao,
      premio_id: row.premio_id,
      mensagem_enviada: row.mensagem_enviada,
      enviado_whatsapp: row.enviado_whatsapp === 1 || row.enviado_whatsapp === true,
      data_envio: row.data_envio,
      erro: row.erro,
      created_at: row.created_at,
    };
  }
}

