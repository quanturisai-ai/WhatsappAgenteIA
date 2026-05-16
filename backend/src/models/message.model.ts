import pool from '../config/database';
import { Message, Reaction } from '../types';
import logger from '../utils/logger';
import { ReactionModel } from './reaction.model';

export class MessageModel {
  private reactionModel: ReactionModel;

  constructor() {
    this.reactionModel = new ReactionModel();
  }

  /**
   * Adiciona reações a uma mensagem ou array de mensagens
   */
  private async addReactionsToMessages(messages: Message | Message[]): Promise<Message | Message[]> {
    const messageArray = Array.isArray(messages) ? messages : [messages];
    
    for (const message of messageArray) {
      try {
        // Usar message_id (string) em vez de id (number) para buscar reações
        if (message.message_id) {
          const reactions = await this.reactionModel.findByMessageId(message.message_id);
          // Garantir que reactions seja sempre um array
          message.reactions = Array.isArray(reactions) ? reactions : (reactions ? [reactions] : []);
        } else {
          message.reactions = [];
        }
      } catch (error: any) {
        logger.warn(`Erro ao buscar reações para mensagem ${message.id} (message_id: ${message.message_id}): ${error.message}`);
        // Garantir que reactions seja sempre um array mesmo em caso de erro
        message.reactions = [];
      }
      
      // Garantir que reactions seja sempre um array (segurança extra)
      if (!Array.isArray(message.reactions)) {
        logger.warn(`Reações não são um array para mensagem ${message.id}, convertendo...`);
        message.reactions = message.reactions ? [message.reactions] : [];
      }
    }
    
    return Array.isArray(messages) ? messageArray : messageArray[0];
  }

  async findById(id: number): Promise<Message | null> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query(
        'SELECT id, conversation_id, message_id, content, message_type, media_id, direction, is_from_ai, created_at, received_at, read_at FROM messages WHERE id = ?',
        [id]
      ) as any[];
      const message = rows && rows.length > 0 ? rows[0] : null;
      if (message) {
        return await this.addReactionsToMessages(message) as Message;
      }
      return null;
    } finally {
      conn.release();
    }
  }

  async findByConversationId(conversationId: number, limit: number = 100, maxAgeHours?: number): Promise<Message[]> {
    const conn = await pool.getConnection();
    try {
      // Se maxAgeHours não for fornecido ou for null/undefined, buscar todas as mensagens
      // Caso contrário, filtrar por data
      let query: string;
      let params: any[];
      
      if (maxAgeHours !== undefined && maxAgeHours !== null) {
        // Calcular data limite (últimas X horas)
        const maxAgeDate = new Date();
        maxAgeDate.setHours(maxAgeDate.getHours() - maxAgeHours);
        
        // Buscar últimas mensagens com filtro de tempo
        query = `SELECT id, conversation_id, message_id, content, message_type, media_id, direction, is_from_ai, created_at, received_at, read_at 
                 FROM messages 
                 WHERE conversation_id = ? 
                   AND created_at >= ?
                 ORDER BY created_at DESC 
                 LIMIT ?`;
        params = [conversationId, maxAgeDate, limit];
      } else {
        // Buscar todas as mensagens sem filtro de tempo
        query = `SELECT id, conversation_id, message_id, content, message_type, media_id, direction, is_from_ai, created_at, received_at, read_at 
                 FROM messages 
                 WHERE conversation_id = ? 
                 ORDER BY created_at DESC 
                 LIMIT ?`;
        params = [conversationId, limit];
      }
      
      const queryResult = await conn.execute(query, params) as any;

      logger.debug(`findByConversationId - conversationId=${conversationId}, queryResult type=${typeof queryResult}, isArray=${Array.isArray(queryResult)}`);

      let rows: any;
      
      // conn.execute() retorna [rows, metadata] onde rows é um array
      if (Array.isArray(queryResult) && queryResult.length > 0) {
        // Se o primeiro elemento é um array, é o formato [rows, metadata]
        if (Array.isArray(queryResult[0])) {
          [rows] = queryResult;
        } else {
          // Se é um array direto de resultados (raro com execute)
          rows = queryResult;
        }
      } else if (queryResult && typeof queryResult === 'object' && !Array.isArray(queryResult)) {
        // Se retornou objeto direto, tentar extrair rows
        rows = queryResult.rows || queryResult;
      } else {
        logger.warn(`findByConversationId - formato inesperado de queryResult: ${typeof queryResult}`);
        return [];
      }

      logger.debug(`findByConversationId - rows type=${typeof rows}, isArray=${Array.isArray(rows)}, length=${Array.isArray(rows) ? rows.length : 'N/A'}`);

      // Garantir que sempre retorne um array
      if (Array.isArray(rows)) {
        // Reverter ordem para cronológica (mais antiga primeiro) para o histórico
        const sortedRows = rows.reverse();
        if (maxAgeHours !== undefined && maxAgeHours !== null) {
          logger.debug(`findByConversationId - retornando ${sortedRows.length} mensagens para conversationId=${conversationId} (últimas ${maxAgeHours}h)`);
        } else {
          logger.debug(`findByConversationId - retornando ${sortedRows.length} mensagens para conversationId=${conversationId} (todas as mensagens)`);
        }
        if (sortedRows.length > 0) {
          logger.debug(`Primeira mensagem: id=${sortedRows[0].id}, última mensagem: id=${sortedRows[sortedRows.length - 1].id}`);
          // Adicionar reações a todas as mensagens
          return await this.addReactionsToMessages(sortedRows) as Message[];
        }
        return sortedRows;
      } else if (rows && !Array.isArray(rows) && typeof rows === 'object') {
        // Se retornou um único objeto, retornar como array
        logger.debug(`findByConversationId - retornando 1 mensagem (objeto único)`);
        return [rows];
      }
      
      logger.warn(`findByConversationId - nenhuma mensagem encontrada ou formato inválido`);
      return [];
    } catch (error: any) {
      logger.error(`findByConversationId - erro: ${error.message}`, error);
      return [];
    } finally {
      conn.release();
    }
  }

  async findByMessageId(messageId: string): Promise<Message | null> {
    const conn = await pool.getConnection();
    try {
      logger.debug(`Buscando mensagem por message_id: "${messageId}" (tamanho: ${messageId.length})`);
      
      const [rows] = await conn.query(
        'SELECT id, conversation_id, message_id, content, message_type, media_id, direction, is_from_ai, created_at, received_at, read_at FROM messages WHERE message_id = ?',
        [messageId]
      ) as any[];
      
      logger.debug(`Resultado da busca: ${rows ? rows.length : 0} mensagem(s) encontrada(s)`);
      
      if (rows && rows.length > 0) {
        logger.debug(`Mensagem encontrada: id=${rows[0].id}, message_id="${rows[0].message_id}"`);
      } else {
        // Tentar buscar sem case sensitivity e verificar se há mensagens similares
        const [allRows] = await conn.query(
          'SELECT id, message_id FROM messages WHERE message_id LIKE ? LIMIT 5',
          [`%${messageId.substring(messageId.length - 20)}%`]
        ) as any[];
        if (allRows && allRows.length > 0) {
          logger.debug(`Mensagens similares encontradas:`, allRows.map((r: any) => ({ id: r.id, message_id: r.message_id })));
        }
      }
      
      const message = rows && rows.length > 0 ? rows[0] : null;
      if (message) {
        return await this.addReactionsToMessages(message) as Message;
      }
      return null;
    } finally {
      conn.release();
    }
  }

  async create(message: Omit<Message, 'id' | 'created_at'>): Promise<Message> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        'INSERT INTO messages (conversation_id, message_id, content, message_type, media_id, direction, is_from_ai) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          message.conversation_id,
          message.message_id || null,
          message.content,
          message.message_type || 'text',
          message.media_id || null,
          message.direction,
          message.is_from_ai || false,
        ]
      ) as any;

      // Extrair result de forma segura (padrão usado em outros models)
      let result: any;
      if (Array.isArray(queryResult)) {
        result = queryResult[0] || queryResult;
      } else if (queryResult && typeof queryResult === 'object') {
        result = queryResult;
      } else {
        result = queryResult;
      }

      const insertId = result?.insertId || result?.insertid;
      
      if (!insertId) {
        throw new Error('Não foi possível obter o ID da mensagem inserida');
      }

      const created = await this.findById(insertId);
      if (!created) {
        throw new Error('Erro ao criar mensagem');
      }
      return created;
    } finally {
      conn.release();
    }
  }

  async update(id: number, data: Partial<Omit<Message, 'id' | 'created_at'>>): Promise<Message> {
    const conn = await pool.getConnection();
    try {
      const updates: string[] = [];
      const values: any[] = [];

      if (data.conversation_id !== undefined) {
        updates.push('conversation_id = ?');
        values.push(data.conversation_id);
      }
      if (data.message_id !== undefined) {
        updates.push('message_id = ?');
        values.push(data.message_id);
      }
      if (data.content !== undefined) {
        updates.push('content = ?');
        values.push(data.content);
      }
      if (data.direction !== undefined) {
        updates.push('direction = ?');
        values.push(data.direction);
      }
      if (data.is_from_ai !== undefined) {
        updates.push('is_from_ai = ?');
        values.push(data.is_from_ai ? 1 : 0);
      }

      if (updates.length === 0) {
        const message = await this.findById(id);
        if (!message) {
          throw new Error('Mensagem não encontrada');
        }
        return message;
      }

      values.push(id);

      await conn.query(
        `UPDATE messages SET ${updates.join(', ')} WHERE id = ?`,
        values
      );

      const updated = await this.findById(id);
      if (!updated) {
        throw new Error('Erro ao atualizar mensagem');
      }

      return updated;
    } finally {
      conn.release();
    }
  }

  /**
   * Atualiza o status de ack de uma mensagem
   * @param messageId - ID da mensagem (message_id da tabela, não id)
   * @param ack - Status do ack: 1 = recebida, 2 = lida
   */
  async updateAckStatus(messageId: string, ack: number): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
      const now = new Date();
      
      if (ack === 1) {
        // Mensagem recebida
        await conn.query(
          'UPDATE messages SET received_at = ? WHERE message_id = ? AND received_at IS NULL',
          [now, messageId]
        );
        logger.debug(`Mensagem ${messageId}: marcada como recebida (ack=1)`);
      } else if (ack === 2) {
        // Mensagem lida
        await conn.query(
          'UPDATE messages SET read_at = ? WHERE message_id = ? AND read_at IS NULL',
          [now, messageId]
        );
        logger.debug(`Mensagem ${messageId}: marcada como lida (ack=2)`);
      } else {
        logger.warn(`Ack status desconhecido: ${ack} para mensagem ${messageId}`);
        return false;
      }
      
      return true;
    } catch (error: any) {
      logger.error(`Erro ao atualizar ack status da mensagem ${messageId}: ${error.message}`);
      throw error;
    } finally {
      conn.release();
    }
  }

  async delete(id: number): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query(
        'DELETE FROM messages WHERE id = ?',
        [id]
      ) as any;
      return result.affectedRows > 0;
    } finally {
      conn.release();
    }
  }

  async countByConversation(conversationId: number): Promise<number> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        'SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?',
        [conversationId]
      ) as any;

      logger.debug(`countByConversation - conversationId=${conversationId}, queryResult type=${typeof queryResult}, isArray=${Array.isArray(queryResult)}`);

      let rows: any;
      
      // Extrair rows do resultado (pode vir em diferentes formatos)
      if (Array.isArray(queryResult)) {
        if (queryResult.length > 0 && Array.isArray(queryResult[0])) {
          [rows] = queryResult;
        } else {
          rows = queryResult;
        }
      } else if (queryResult && typeof queryResult === 'object') {
        rows = queryResult;
      } else {
        logger.warn(`countByConversation - formato inesperado de queryResult: ${typeof queryResult}`);
        return 0;
      }

      // Garantir que rows seja um array
      if (!Array.isArray(rows)) {
        rows = [rows];
      }

      if (rows && rows.length > 0) {
        const count = rows[0].count;
        // Converter para número (pode vir como string ou BigInt)
        const countNumber = typeof count === 'bigint' ? Number(count) : Number(count);
        logger.debug(`countByConversation - conversationId=${conversationId}, count=${countNumber}`);
        return isNaN(countNumber) ? 0 : countNumber;
      }

      logger.debug(`countByConversation - conversationId=${conversationId}, nenhum resultado encontrado`);
      return 0;
    } catch (error: any) {
      logger.error(`countByConversation - erro: ${error.message}`, error);
      return 0;
    } finally {
      conn.release();
    }
  }

  /**
   * Buscar última mensagem da IA na conversa (is_from_ai: true, direction: 'outgoing')
   */
  async findLastAIMessage(conversationId: number): Promise<Message | null> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query(
        `SELECT id, conversation_id, message_id, content, direction, is_from_ai, created_at 
         FROM messages 
         WHERE conversation_id = ? 
           AND is_from_ai = 1 
           AND direction = 'outgoing'
         ORDER BY created_at DESC 
         LIMIT 1`,
        [conversationId]
      ) as any[];

      if (rows && rows.length > 0) {
        logger.debug(`findLastAIMessage - encontrada última mensagem da IA para conversationId=${conversationId}, id=${rows[0].id}`);
        return rows[0];
      }

      logger.debug(`findLastAIMessage - nenhuma mensagem da IA encontrada para conversationId=${conversationId}`);
      return null;
    } catch (error: any) {
      logger.error(`findLastAIMessage - erro: ${error.message}`, error);
      return null;
    } finally {
      conn.release();
    }
  }

  /**
   * Buscar penúltima mensagem do cliente na conversa (direction: 'incoming')
   * Retorna a mensagem anterior à atual, pois a mensagem atual já foi salva no banco
   * quando este método é chamado durante o processamento
   */
  async findLastClientMessage(conversationId: number): Promise<Message | null> {
    const conn = await pool.getConnection();
    try {
      // Buscar a penúltima mensagem do cliente (OFFSET 1 para pular a mensagem atual)
      // Usar execute() para garantir formato consistente de retorno
      const queryResult = await conn.execute(
        `SELECT id, conversation_id, message_id, content, direction, is_from_ai, created_at 
         FROM messages 
         WHERE conversation_id = ? 
           AND direction = 'incoming'
         ORDER BY created_at DESC 
         LIMIT 1 OFFSET 1`,
        [conversationId]
      ) as any;

      logger.debug(`findLastClientMessage - conversationId=${conversationId}, queryResult type=${typeof queryResult}, isArray=${Array.isArray(queryResult)}`);

      let rows: any;
      
      // conn.execute() retorna [rows, metadata] onde rows é um array
      if (Array.isArray(queryResult) && queryResult.length > 0) {
        // Se o primeiro elemento é um array, é o formato [rows, metadata]
        if (Array.isArray(queryResult[0])) {
          [rows] = queryResult;
        } else {
          // Se é um array direto de resultados (raro com execute)
          rows = queryResult;
        }
      } else if (queryResult && typeof queryResult === 'object' && !Array.isArray(queryResult)) {
        // Se retornou objeto direto, tentar extrair rows
        rows = queryResult.rows || queryResult;
      } else {
        logger.warn(`findLastClientMessage - formato inesperado de queryResult: ${typeof queryResult}`);
        return null;
      }

      logger.debug(`findLastClientMessage - rows type=${typeof rows}, isArray=${Array.isArray(rows)}, length=${Array.isArray(rows) ? rows.length : 'N/A'}`);

      // Garantir que sempre retorne um array
      if (Array.isArray(rows) && rows.length > 0) {
        logger.debug(`findLastClientMessage - encontrada penúltima mensagem do cliente para conversationId=${conversationId}, id=${rows[0].id}, content="${rows[0].content.substring(0, 50)}..."`);
        return rows[0];
      } else if (rows && !Array.isArray(rows) && typeof rows === 'object') {
        // Se retornou um único objeto, retornar como está
        logger.debug(`findLastClientMessage - encontrada penúltima mensagem do cliente (objeto único) para conversationId=${conversationId}, id=${rows.id}`);
        return rows;
      }

      logger.debug(`findLastClientMessage - nenhuma mensagem anterior do cliente encontrada para conversationId=${conversationId}`);
      return null;
    } catch (error: any) {
      logger.error(`findLastClientMessage - erro: ${error.message}`, error);
      return null;
    } finally {
      conn.release();
    }
  }
}



