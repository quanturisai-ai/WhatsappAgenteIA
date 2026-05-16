import pool from '../config/database';
import { Conversation } from '../types';
import logger from '../utils/logger';

export class ConversationModel {
  async findById(id: number): Promise<Conversation | null> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT 
           c.id, 
           c.user_id, 
           c.contact_number, 
           COALESCE(
             GROUP_CONCAT(DISTINCT 
               CASE 
                 WHEN cl.nome IS NOT NULL AND cl.nome != '' THEN 
                   CONCAT(
                     SUBSTRING_INDEX(TRIM(cl.nome), ' ', 1),
                     CASE 
                       WHEN SUBSTRING_INDEX(TRIM(cl.nome), ' ', 2) != SUBSTRING_INDEX(TRIM(cl.nome), ' ', 1) 
                       THEN CONCAT(' ', SUBSTRING_INDEX(SUBSTRING_INDEX(TRIM(cl.nome), ' ', 2), ' ', -1))
                       ELSE ''
                     END
                   )
                 ELSE NULL
               END
             SEPARATOR ' / '),
             c.contact_name 
           ) as contact_name,
           c.status, 
           c.auto_responding, 
           c.last_message_at, 
           c.needs_intervention, 
           c.intervention_resolved_at,
           c.created_at, 
           c.updated_at,
           -- Dados do cliente VM Lav (do primeiro encontrado no grupo)
           MIN(cl.id) as cliente_id,
           MIN(cl.nome) as cliente_nome_completo,
           MIN(cl.cpf) as cliente_cpf,
           MIN(cl.telefone) as cliente_telefone,
           MIN(cl.email) as cliente_email,
           MIN(cl.data_ultima_compra) as cliente_ultima_compra,
           MIN(cl.data_cadastro) as cliente_data_cadastro,
           MIN(cl.qtd_compras) as cliente_total_compras,
           MIN(cl.valor_total_compras) as cliente_valor_total_compras
         FROM conversations c
         LEFT JOIN vm_lav_clientes cl ON 
           cl.user_id = c.user_id AND
           (
             normaliza_telefone(cl.telefone) = normaliza_telefone(c.contact_number)
           )
         WHERE c.id = ?
         GROUP BY c.id`,
        [id]
      ) as any;

      let rows: any;
      if (Array.isArray(queryResult)) {
        if (queryResult.length > 0 && Array.isArray(queryResult[0])) {
          rows = queryResult[0];
        } else {
          rows = queryResult;
        }
      } else if (queryResult && typeof queryResult === 'object') {
        rows = queryResult;
      } else {
        return null;
      }

      if (Array.isArray(rows) && rows.length > 0) {
        return rows[0];
      } else if (rows && !Array.isArray(rows) && rows.id) {
        return rows;
      }
      return null;
    } finally {
      conn.release();
    }
  }

  async findByUserId(userId: number): Promise<Conversation[]> {
    const conn = await pool.getConnection();
    try {
      // Função SQL para normalizar telefone (remover todos caracteres não numéricos)
      // Vamos fazer o JOIN e normalizar os números para comparar
      // O número pode estar como "556299112697" ou "(62) 99477-0224", precisamos normalizar ambos
      const queryResult = await conn.query(
        `SELECT 
           c.id, 
           c.user_id, 
           c.contact_number, 
           COALESCE(
             GROUP_CONCAT(DISTINCT 
               CASE 
                 WHEN cl.nome IS NOT NULL AND cl.nome != '' THEN 
                   CONCAT(
                     SUBSTRING_INDEX(TRIM(cl.nome), ' ', 1),
                     CASE 
                       WHEN SUBSTRING_INDEX(TRIM(cl.nome), ' ', 2) != SUBSTRING_INDEX(TRIM(cl.nome), ' ', 1) 
                       THEN CONCAT(' ', SUBSTRING_INDEX(SUBSTRING_INDEX(TRIM(cl.nome), ' ', 2), ' ', -1))
                       ELSE ''
                     END
                   )
                 ELSE NULL
               END
             SEPARATOR ' / '),
             c.contact_name 
           ) as contact_name,
           c.status, 
           c.auto_responding, 
           c.last_message_at, 
           c.needs_intervention, 
           c.intervention_resolved_at,
           c.created_at, 
           c.updated_at 
         FROM conversations c
         LEFT JOIN vm_lav_clientes cl ON 
           cl.user_id = c.user_id AND
           (
             -- Usar função normaliza_telefone() para normalizar ambos os números
             -- Formato final: 55 + DDD + 9 + número (13 dígitos)
             normaliza_telefone(cl.telefone) = normaliza_telefone(c.contact_number)
           )
         WHERE c.user_id = ? 
           AND (
             -- Mostrar conversas não-finalizadas normalmente
             c.status != 'finished'
             OR
             -- Para conversas finalizadas, mostrar apenas as dos últimos 30 dias
             (c.status = 'finished' AND c.updated_at >= DATE_SUB(NOW(), INTERVAL 30 DAY))
           )
         GROUP BY c.id
         ORDER BY c.last_message_at DESC, c.created_at DESC`,
        [userId]
      ) as any;

      let rows: any;
      if (Array.isArray(queryResult)) {
        // Verificar se o primeiro elemento é um objeto (conversa) ou outro array
        if (queryResult.length > 0 && Array.isArray(queryResult[0])) {
          // Se queryResult[0] é um array, então é [rows, metadata]
          rows = queryResult[0];
        } else {
          // Se queryResult já é o array de conversas diretamente
          rows = queryResult;
        }
      } else if (queryResult && typeof queryResult === 'object') {
        // Objeto único
        rows = [queryResult];
      } else {
        logger.warn(`findByUserId - Resultado inesperado do banco`);
        return [];
      }

      // Garantir que sempre retorne um array e normalizar contact_name
      if (Array.isArray(rows)) {
        // Log detalhado para debug: verificar se contact_name está sendo retornado
        if (rows.length > 0) {
          const firstRow = rows[0];
          logger.info(`findByUserId - Primeira conversa: id=${firstRow.id}, contact_name="${firstRow.contact_name || 'NULL'}", contact_number="${firstRow.contact_number}"`);
          
          // Log de todas as conversas para debug
          rows.slice(0, 5).forEach((row: any, index: number) => {
            logger.debug(`findByUserId - Conversa ${index + 1}: id=${row.id}, contact_name="${row.contact_name || 'NULL'}", contact_number="${row.contact_number}"`);
          });
        }
        
        // Normalizar contact_name: se for null ou string vazia, manter como está (será tratado no frontend)
        return rows.map((row: any) => ({
          ...row,
          contact_name: row.contact_name && row.contact_name.trim() !== '' ? row.contact_name.trim() : (row.contact_name || null),
        }));
      }
      
      return [];
    } finally {
      conn.release();
    }
  }

  async findByUserAndContact(userId: number, contactNumber: string): Promise<Conversation | null> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT id, user_id, contact_number, contact_name, status, 
         auto_responding, last_message_at, needs_intervention, intervention_resolved_at,
         created_at, updated_at 
         FROM conversations WHERE user_id = ? AND contact_number = ?`,
        [userId, contactNumber]
      ) as any;

      let rows: any;
      if (Array.isArray(queryResult)) {
        [rows] = queryResult;
      } else if (queryResult && typeof queryResult === 'object') {
        rows = queryResult;
      } else {
        return null;
      }

      if (Array.isArray(rows) && rows.length > 0) {
        return rows[0];
      } else if (rows && !Array.isArray(rows) && rows.id) {
        return rows;
      }
      return null;
    } finally {
      conn.release();
    }
  }

  /**
   * Busca conversa por usuário e número de telefone usando normalização
   * Usa a função SQL normaliza_telefone() para comparar números em diferentes formatos
   */
  async findByUserAndContactNormalized(userId: number, contactNumber: string): Promise<Conversation | null> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT 
           c.id, 
           c.user_id, 
           c.contact_number, 
           c.contact_name, 
           c.status, 
           c.auto_responding, 
           c.last_message_at, 
           c.needs_intervention, 
           c.intervention_resolved_at,
           c.created_at, 
           c.updated_at 
         FROM conversations c
         WHERE c.user_id = ? 
           AND normaliza_telefone(c.contact_number) = normaliza_telefone(?)
         LIMIT 1`,
        [userId, contactNumber]
      ) as any;

      let rows: any;
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      } else if (queryResult && typeof queryResult === 'object') {
        rows = queryResult;
      } else {
        return null;
      }

      if (Array.isArray(rows) && rows.length > 0) {
        const row = rows[0];
        return {
          id: row.id,
          user_id: row.user_id,
          contact_number: row.contact_number,
          contact_name: row.contact_name,
          status: row.status,
          auto_responding: row.auto_responding === 1 || row.auto_responding === true,
          last_message_at: row.last_message_at,
          needs_intervention: row.needs_intervention === 1 || row.needs_intervention === true,
          intervention_resolved_at: row.intervention_resolved_at,
          created_at: row.created_at,
          updated_at: row.updated_at,
        };
      }
      return null;
    } finally {
      conn.release();
    }
  }

  async create(conversation: Omit<Conversation, 'id' | 'created_at' | 'updated_at'>): Promise<Conversation> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        'INSERT INTO conversations (user_id, contact_number, contact_name, status, auto_responding, last_message_at) VALUES (?, ?, ?, ?, ?, ?)',
        [
          conversation.user_id,
          conversation.contact_number,
          conversation.contact_name || null,
          conversation.status || 'new',
          conversation.auto_responding !== undefined ? (conversation.auto_responding ? 1 : 0) : 1, // Default: true
          conversation.last_message_at || null,
        ]
      ) as any;

      let result: any;
      if (Array.isArray(queryResult)) {
        [result] = queryResult;
      } else if (queryResult && typeof queryResult === 'object') {
        result = queryResult;
      } else {
        throw new Error('Formato de resultado inesperado do banco de dados');
      }

      let insertId: number | undefined;
      if (result?.insertId !== undefined) {
        insertId = typeof result.insertId === 'bigint' 
          ? Number(result.insertId) 
          : Number(result.insertId);
      }

      if (!insertId || isNaN(insertId)) {
        // Tentar buscar pela combinação user_id + contact_number como fallback
        const existing = await this.findByUserAndContact(conversation.user_id, conversation.contact_number);
        if (existing) {
          logger.info('Conversa encontrada pelo user_id e contact_number como fallback');
          return existing;
        }
        throw new Error('Erro ao obter ID da conversa criada');
      }

      const created = await this.findById(insertId);
      if (!created) {
        // Tentar buscar pela combinação user_id + contact_number como fallback
        const fallback = await this.findByUserAndContact(conversation.user_id, conversation.contact_number);
        if (fallback) {
          logger.info('Conversa encontrada pelo user_id e contact_number após erro no findById');
          return fallback;
        }
        throw new Error('Erro ao criar conversa');
      }
      return created;
    } finally {
      conn.release();
    }
  }

  async update(id: number, updates: Partial<Omit<Conversation, 'id' | 'created_at' | 'updated_at'>>): Promise<Conversation | null> {
    const conn = await pool.getConnection();
    try {
      const fields: string[] = [];
      const values: any[] = [];

      if (updates.contact_name !== undefined) {
        fields.push('contact_name = ?');
        values.push(updates.contact_name);
      }
      if (updates.status !== undefined) {
        fields.push('status = ?');
        values.push(updates.status);
      }
      if (updates.auto_responding !== undefined) {
        fields.push('auto_responding = ?');
        values.push(updates.auto_responding ? 1 : 0);
      }
      if (updates.last_message_at !== undefined) {
        fields.push('last_message_at = ?');
        values.push(updates.last_message_at);
      }
      if (updates.needs_intervention !== undefined) {
        fields.push('needs_intervention = ?');
        values.push(updates.needs_intervention ? 1 : 0);
      }
      if (updates.intervention_resolved_at !== undefined) {
        fields.push('intervention_resolved_at = ?');
        values.push(updates.intervention_resolved_at || null);
      }

      if (fields.length === 0) {
        return await this.findById(id);
      }

      values.push(id);
      await conn.query(
        `UPDATE conversations SET ${fields.join(', ')} WHERE id = ?`,
        values
      );

      return await this.findById(id);
    } finally {
      conn.release();
    }
  }

  async updateLastMessage(id: number): Promise<void> {
    const conn = await pool.getConnection();
    try {
      await conn.query(
        'UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = ?',
        [id]
      );
    } finally {
      conn.release();
    }
  }

  async delete(id: number): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        'DELETE FROM conversations WHERE id = ?',
        [id]
      ) as any;

      let result: any;
      if (Array.isArray(queryResult)) {
        [result] = queryResult;
      } else if (queryResult && typeof queryResult === 'object') {
        result = queryResult;
      } else {
        return false;
      }

      return result?.affectedRows > 0;
    } finally {
      conn.release();
    }
  }

  /**
   * Buscar todas as conversas ativas (new ou in_progress) com última mensagem
   * @returns Array de conversas ativas
   */
  async findActiveConversations(): Promise<Conversation[]> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT id, user_id, contact_number, contact_name, status, 
         auto_responding, last_message_at, needs_intervention, intervention_resolved_at,
         created_at, updated_at 
         FROM conversations 
         WHERE status IN ('new', 'in_progress') 
         AND last_message_at IS NOT NULL 
         ORDER BY last_message_at ASC`
      ) as any;

      let rows: any;
      if (Array.isArray(queryResult)) {
        if (queryResult.length > 0 && Array.isArray(queryResult[0])) {
          rows = queryResult[0];
        } else {
          rows = queryResult;
        }
      } else if (queryResult && typeof queryResult === 'object') {
        rows = [queryResult];
      } else {
        return [];
      }

      if (Array.isArray(rows)) {
        return rows;
      }
      
      return [];
    } finally {
      conn.release();
    }
  }

  /**
   * Buscar conversas ativas (new ou in_progress) com última mensagem anterior à data fornecida
   * @param beforeDate Data limite - conversas com última mensagem antes desta data
   * @returns Array de conversas antigas
   */
  async findOldConversations(beforeDate: Date): Promise<Conversation[]> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT id, user_id, contact_number, contact_name, status, 
         auto_responding, last_message_at, created_at, updated_at 
         FROM conversations 
         WHERE status IN ('new', 'in_progress') 
         AND last_message_at IS NOT NULL 
         AND last_message_at < ?
         ORDER BY last_message_at ASC`,
        [beforeDate]
      ) as any;

      let rows: any;
      if (Array.isArray(queryResult)) {
        if (queryResult.length > 0 && Array.isArray(queryResult[0])) {
          rows = queryResult[0];
        } else {
          rows = queryResult;
        }
      } else if (queryResult && typeof queryResult === 'object') {
        rows = [queryResult];
      } else {
        return [];
      }

      if (Array.isArray(rows)) {
        return rows;
      }
      
      return [];
    } finally {
      conn.release();
    }
  }

  /**
   * Buscar conversas por termo de busca (nome, telefone ou conteúdo das mensagens)
   * @param userId ID do usuário
   * @param searchTerm Termo de busca
   * @returns Array de conversas que correspondem à busca
   */
  async searchByTerm(userId: number, searchTerm: string): Promise<Conversation[]> {
    const conn = await pool.getConnection();
    try {
      const searchPattern = `%${searchTerm}%`;
      
      // Query que busca em nome, telefone e conteúdo das mensagens
      // Também inclui JOIN com vm_lav_clientes para usar o nome do cliente
      const queryResult = await conn.query(
        `SELECT 
           c.id, 
           c.user_id, 
           c.contact_number, 
           COALESCE(
             GROUP_CONCAT(DISTINCT 
               CASE 
                 WHEN cl.nome IS NOT NULL AND cl.nome != '' THEN 
                   CONCAT(
                     SUBSTRING_INDEX(TRIM(cl.nome), ' ', 1),
                     CASE 
                       WHEN SUBSTRING_INDEX(TRIM(cl.nome), ' ', 2) != SUBSTRING_INDEX(TRIM(cl.nome), ' ', 1) 
                       THEN CONCAT(' ', SUBSTRING_INDEX(SUBSTRING_INDEX(TRIM(cl.nome), ' ', 2), ' ', -1))
                       ELSE ''
                     END
                   )
                 ELSE NULL
               END
             SEPARATOR ' / '),
             c.contact_name 
           ) as contact_name,
           c.status,
           c.auto_responding, 
           c.last_message_at, 
           c.needs_intervention, 
           c.intervention_resolved_at,
           c.created_at, 
           c.updated_at
         FROM conversations c
         LEFT JOIN messages m ON c.id = m.conversation_id
         LEFT JOIN vm_lav_clientes cl ON 
           cl.user_id = c.user_id AND
           (
             -- Usar função normaliza_telefone() para normalizar ambos os números
             -- Formato final: 55 + DDD + 9 + número (13 dígitos)
             normaliza_telefone(cl.telefone) = normaliza_telefone(c.contact_number)
           )
         WHERE c.user_id = ?
         AND (
           c.contact_name LIKE ?
           OR c.contact_number LIKE ?
           OR m.content LIKE ?
           OR cl.nome LIKE ?
           OR cl.cpf LIKE ?
           OR cl.email LIKE ?
         )
         GROUP BY c.id
         ORDER BY c.last_message_at DESC, c.created_at DESC`,
        [userId, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern]
      ) as any;

      let rows: any;
      if (Array.isArray(queryResult)) {
        if (queryResult.length > 0 && Array.isArray(queryResult[0])) {
          rows = queryResult[0];
        } else {
          rows = queryResult;
        }
      } else if (queryResult && typeof queryResult === 'object') {
        rows = [queryResult];
      } else {
        return [];
      }

      if (Array.isArray(rows)) {
        return rows;
      }
      
      return [];
    } finally {
      conn.release();
    }
  }
}

