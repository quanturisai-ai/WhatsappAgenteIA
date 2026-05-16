import pool from '../config/database';
import { Topic } from '../types';
import logger from '../utils/logger';

export class TopicModel {
  async findById(id: number): Promise<Topic | null> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT id, user_id, title, description, trigger_keywords, context, priority, is_active, 
         last_indexed_at, indexing_status, content_hash, created_at, updated_at 
         FROM topics WHERE id = ?`,
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
        const row = rows[0];
        return this.mapRowToTopic(row);
      } else if (rows && !Array.isArray(rows) && rows.id) {
        return this.mapRowToTopic(rows);
      }
      return null;
    } finally {
      conn.release();
    }
  }

  async findByUserId(userId: number): Promise<Topic[]> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT id, user_id, title, description, trigger_keywords, context, priority, is_active, 
         last_indexed_at, indexing_status, content_hash, created_at, updated_at 
         FROM topics WHERE user_id = ? 
         ORDER BY priority DESC, created_at DESC`,
        [userId]
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
        return rows.map(row => this.mapRowToTopic(row));
      }
      
      return [];
    } finally {
      conn.release();
    }
  }

  async findActiveByUserId(userId: number): Promise<Topic[]> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT id, user_id, title, description, trigger_keywords, context, priority, is_active, 
         last_indexed_at, indexing_status, content_hash, created_at, updated_at 
         FROM topics WHERE user_id = ? AND is_active = TRUE
         ORDER BY priority DESC, created_at DESC`,
        [userId]
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
        return rows.map(row => this.mapRowToTopic(row));
      }
      
      return [];
    } finally {
      conn.release();
    }
  }

  /**
   * Buscar tópicos ativos cujas trigger keywords correspondem à query
   */
  async findByTriggerKeywords(userId: number, queryWords: string[]): Promise<Topic[]> {
    try {
      // Buscar todos os tópicos ativos do usuário
      const topics = await this.findActiveByUserId(userId);
      
      if (queryWords.length === 0) {
        return [];
      }

      // Normalizar palavras da query (lowercase, trim)
      const normalizedQueryWords = queryWords.map(word => word.toLowerCase().trim()).filter(word => word.length > 0);

      // Filtrar tópicos cujas trigger keywords correspondem à query
      return topics.filter(topic => {
        if (!topic.trigger_keywords || topic.trigger_keywords.length === 0) {
          return false;
        }

        // Verificar se alguma trigger keyword corresponde a alguma palavra da query
        return topic.trigger_keywords.some(keyword => {
          const normalizedKeyword = keyword.toLowerCase().trim();
          
          // Verificar correspondência exata ou parcial
          return normalizedQueryWords.some(queryWord => {
            // Correspondência exata
            if (queryWord === normalizedKeyword) {
              return true;
            }
            
            // Correspondência parcial (palavra contém keyword ou vice-versa)
            if (queryWord.includes(normalizedKeyword) || normalizedKeyword.includes(queryWord)) {
              return true;
            }
            
            // Verificar se são palavras similares (mesma raiz)
            // Ex: "horario" e "horários", "funcionamento" e "funciona"
            const queryWordBase = queryWord.replace(/[sçõãáàâéêíóôúü]/g, '');
            const keywordBase = normalizedKeyword.replace(/[sçõãáàâéêíóôúü]/g, '');
            if (queryWordBase === keywordBase && queryWordBase.length > 3) {
              return true;
            }
            
            return false;
          });
        });
      });
    } catch (error: any) {
      logger.error(`Erro ao buscar tópicos por trigger keywords: ${error.message}`);
      return [];
    }
  }

  async create(topic: Omit<Topic, 'id' | 'created_at' | 'updated_at'>): Promise<Topic> {
    const conn = await pool.getConnection();
    try {
      // Garantir que trigger_keywords seja sempre um array
      const keywordsArray = Array.isArray(topic.trigger_keywords) ? topic.trigger_keywords : [];
      const triggerKeywordsJson = JSON.stringify(keywordsArray);
      
      logger.debug(`Salvando tópico com trigger_keywords: ${triggerKeywordsJson}`);
      
      const queryResult = await conn.query(
        'INSERT INTO topics (user_id, title, description, trigger_keywords, context, priority, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          topic.user_id,
          topic.title,
          topic.description,
          triggerKeywordsJson,
          topic.context || 'custom',
          topic.priority || 0,
          topic.is_active !== undefined ? (topic.is_active ? 1 : 0) : 1,
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
        throw new Error('Erro ao obter ID do tópico criado');
      }

      const created = await this.findById(insertId);
      if (!created) {
        throw new Error('Erro ao criar tópico');
      }
      return created;
    } finally {
      conn.release();
    }
  }

  async update(id: number, updates: Partial<Omit<Topic, 'id' | 'created_at' | 'updated_at'>>): Promise<Topic | null> {
    const conn = await pool.getConnection();
    try {
      const fields: string[] = [];
      const values: any[] = [];

      if (updates.title !== undefined) {
        fields.push('title = ?');
        values.push(updates.title);
      }
      if (updates.description !== undefined) {
        fields.push('description = ?');
        values.push(updates.description);
      }
      if (updates.trigger_keywords !== undefined) {
        // Garantir que seja sempre um array antes de serializar
        const keywordsArray = Array.isArray(updates.trigger_keywords) ? updates.trigger_keywords : [];
        const triggerKeywordsJson = JSON.stringify(keywordsArray);
        logger.debug(`Atualizando trigger_keywords no banco para tópico ${id}: ${triggerKeywordsJson}`);
        fields.push('trigger_keywords = ?');
        values.push(triggerKeywordsJson);
      }
      if (updates.context !== undefined) {
        fields.push('context = ?');
        values.push(updates.context);
      }
      if (updates.priority !== undefined) {
        fields.push('priority = ?');
        values.push(updates.priority);
      }
      if (updates.is_active !== undefined) {
        fields.push('is_active = ?');
        values.push(updates.is_active ? 1 : 0);
      }

      if (fields.length === 0) {
        return await this.findById(id);
      }

      // Sempre resetar status de indexação quando tópico for editado
      // Isso garante que o conteúdo seja reindexado no ChromaDB
      fields.push('indexing_status = ?');
      values.push('pending');
      fields.push('last_indexed_at = ?');
      values.push(null);
      fields.push('content_hash = ?');
      values.push(null);

      values.push(id);
      await conn.query(
        `UPDATE topics SET ${fields.join(', ')} WHERE id = ?`,
        values
      );

      logger.debug(`Status de indexação resetado para 'pending' para tópico ${id} após atualização`);

      return await this.findById(id);
    } finally {
      conn.release();
    }
  }

  async delete(id: number): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        'DELETE FROM topics WHERE id = ?',
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

  private mapRowToTopic(row: any): Topic {
    let triggerKeywords: string[] = [];
    if (row.trigger_keywords) {
      try {
        if (typeof row.trigger_keywords === 'string') {
          triggerKeywords = JSON.parse(row.trigger_keywords);
        } else if (Array.isArray(row.trigger_keywords)) {
          triggerKeywords = row.trigger_keywords;
        }
      } catch (error) {
        logger.warn(`Erro ao parsear trigger_keywords do tópico ${row.id}: ${error}`);
        triggerKeywords = [];
      }
    }

    return {
      id: row.id,
      user_id: row.user_id,
      title: row.title,
      description: row.description,
      trigger_keywords: triggerKeywords,
      context: row.context || 'custom',
      priority: row.priority || 0,
      is_active: row.is_active === 1 || row.is_active === true,
      last_indexed_at: row.last_indexed_at || null,
      indexing_status: row.indexing_status || 'pending',
      content_hash: row.content_hash || null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}

