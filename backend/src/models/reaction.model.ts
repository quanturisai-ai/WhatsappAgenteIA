import pool from '../config/database';
import { Reaction } from '../types';
import logger from '../utils/logger';

export class ReactionModel {
  /**
   * Criar uma nova reação
   */
  async create(reaction: Omit<Reaction, 'id' | 'created_at'>): Promise<Reaction> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        'INSERT INTO reactions (message_id, reaction_emoji, reacted_by) VALUES (?, ?, ?)',
        [
          reaction.message_id,
          reaction.reaction_emoji,
          reaction.reacted_by,
        ]
      ) as any;

      // Extrair result de forma segura
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
        throw new Error('Não foi possível obter o ID da reação inserida');
      }

      const created = await this.findById(insertId);
      if (!created) {
        throw new Error('Erro ao criar reação');
      }
      return created;
    } catch (error: any) {
      // Se for erro de duplicata, buscar a reação existente
      if (error.code === 'ER_DUP_ENTRY') {
        logger.debug(`Reação já existe, buscando existente...`);
        const existing = await this.findByMessageAndReactedBy(
          reaction.message_id,
          reaction.reacted_by
        );
        if (existing) {
          return existing;
        }
      }
      // Log detalhado do erro para debug
      logger.error(`Erro ao criar reação:`, {
        errorCode: error.code,
        errorMessage: error.message,
        errorSqlState: error.sqlState,
        messageId: reaction.message_id,
        reactionEmoji: reaction.reaction_emoji,
        reactedBy: reaction.reacted_by,
        fullError: JSON.stringify(error, Object.getOwnPropertyNames(error)),
      });
      throw error;
    } finally {
      conn.release();
    }
  }

  /**
   * Buscar reação por ID
   */
  async findById(id: number): Promise<Reaction | null> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query(
        'SELECT id, message_id, reaction_emoji, reacted_by, created_at FROM reactions WHERE id = ?',
        [id]
      ) as any[];
      return rows && rows.length > 0 ? rows[0] : null;
    } finally {
      conn.release();
    }
  }

  /**
   * Buscar reação por message_id e reacted_by
   */
  async findByMessageAndReactedBy(
    messageId: string,
    reactedBy: string
  ): Promise<Reaction | null> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query(
        'SELECT id, message_id, reaction_emoji, reacted_by, created_at FROM reactions WHERE message_id = ? AND reacted_by = ?',
        [messageId, reactedBy]
      ) as any[];
      return rows && rows.length > 0 ? rows[0] : null;
    } finally {
      conn.release();
    }
  }

  /**
   * Buscar todas as reações de uma mensagem (por message_id da tabela messages)
   */
  async findByMessageId(messageId: string): Promise<Reaction[]> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query(
        'SELECT id, message_id, reaction_emoji, reacted_by, created_at FROM reactions WHERE message_id = ? ORDER BY created_at DESC',
        [messageId]
      ) as any[];
      return rows || [];
    } finally {
      conn.release();
    }
  }

  /**
   * Remover reação
   */
  async delete(id: number): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query(
        'DELETE FROM reactions WHERE id = ?',
        [id]
      ) as any;
      return result.affectedRows > 0;
    } finally {
      conn.release();
    }
  }

  /**
   * Remover reação por message_id e reacted_by
   */
  async deleteByMessageAndReactedBy(
    messageId: string,
    reactedBy: string
  ): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query(
        'DELETE FROM reactions WHERE message_id = ? AND reacted_by = ?',
        [messageId, reactedBy]
      ) as any;
      return result.affectedRows > 0;
    } finally {
      conn.release();
    }
  }
}

