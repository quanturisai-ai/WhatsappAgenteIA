import pool from '../config/database';
import { Media } from '../types';
import logger from '../utils/logger';

export class MediaModel {
  async findById(id: number): Promise<Media | null> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT id, user_id, filename, file_path, file_type, source, file_size, 
         title, description, caption, status, error_message, is_active, mandatory_send,
         last_indexed_at, indexing_status, content_hash,
         created_at, updated_at 
         FROM medias WHERE id = ?`,
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

  async findByUserId(userId: number): Promise<Media[]> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT id, user_id, filename, file_path, file_type, source, file_size, 
         title, description, caption, status, error_message, is_active, mandatory_send,
         last_indexed_at, indexing_status, content_hash,
         created_at, updated_at 
         FROM medias WHERE user_id = ? AND (source IS NULL OR source = 'outgoing')
         ORDER BY created_at DESC`,
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
        return rows;
      }
      
      return [];
    } finally {
      conn.release();
    }
  }

  async create(media: Omit<Media, 'id' | 'created_at' | 'updated_at'>): Promise<Media> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        'INSERT INTO medias (user_id, filename, file_path, file_type, source, file_size, title, description, caption, status, error_message, is_active, mandatory_send, indexing_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          media.user_id,
          media.filename,
          media.file_path,
          media.file_type,
          media.source || 'outgoing',
          media.file_size,
          media.title,
          media.description,
          media.caption || null,
          media.status || 'pending',
          media.error_message || null,
          media.is_active !== undefined ? media.is_active : true,
          media.mandatory_send !== undefined ? media.mandatory_send : false,
          media.indexing_status || 'pending',
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
        throw new Error('Erro ao obter ID da mídia criada');
      }

      const created = await this.findById(insertId);
      if (!created) {
        throw new Error('Erro ao criar mídia');
      }
      return created;
    } finally {
      conn.release();
    }
  }

  async update(id: number, updates: Partial<Omit<Media, 'id' | 'created_at' | 'updated_at'>>): Promise<Media | null> {
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
      if (updates.caption !== undefined) {
        fields.push('caption = ?');
        values.push(updates.caption || null);
      }
      if (updates.status !== undefined) {
        fields.push('status = ?');
        values.push(updates.status);
      }
      if (updates.error_message !== undefined) {
        fields.push('error_message = ?');
        values.push(updates.error_message);
      }
      if (updates.is_active !== undefined) {
        fields.push('is_active = ?');
        values.push(updates.is_active);
      }
      if (updates.mandatory_send !== undefined) {
        fields.push('mandatory_send = ?');
        values.push(updates.mandatory_send);
      }
      if (updates.indexing_status !== undefined) {
        fields.push('indexing_status = ?');
        values.push(updates.indexing_status);
      }
      if (updates.last_indexed_at !== undefined) {
        fields.push('last_indexed_at = ?');
        values.push(updates.last_indexed_at);
      }
      if (updates.content_hash !== undefined) {
        fields.push('content_hash = ?');
        values.push(updates.content_hash);
      }

      if (fields.length === 0) {
        return await this.findById(id);
      }

      values.push(id);
      await conn.query(
        `UPDATE medias SET ${fields.join(', ')} WHERE id = ?`,
        values
      );

      return await this.findById(id);
    } finally {
      conn.release();
    }
  }

  /**
   * Buscar mídias obrigatórias ativas para um usuário
   */
  async findMandatoryMedias(userId: number): Promise<Media[]> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT id, user_id, filename, file_path, file_type, source, file_size, 
         title, description, caption, status, error_message, is_active, mandatory_send,
         last_indexed_at, indexing_status, content_hash,
         created_at, updated_at 
         FROM medias 
         WHERE user_id = ? AND mandatory_send = TRUE AND is_active = TRUE AND status = 'completed'
           AND (source IS NULL OR source = 'outgoing')
         ORDER BY created_at ASC`,
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
        rows = queryResult.rows || queryResult;
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
   * Buscar mídias ativas por palavras-chave no título e descrição
   * Similar ao findByTriggerKeywords dos tópicos
   */
  async findByKeywords(userId: number, queryWords: string[]): Promise<Media[]> {
    const conn = await pool.getConnection();
    try {
      // Buscar todas as mídias ativas e completas do usuário
      // Usar apenas is_active para determinar se entra na busca
      const queryResult = await conn.query(
        `SELECT id, user_id, filename, file_path, file_type, source, file_size, 
         title, description, caption, status, error_message, is_active, mandatory_send,
         last_indexed_at, indexing_status, content_hash,
         created_at, updated_at 
         FROM medias 
         WHERE user_id = ? AND is_active = TRUE AND status = 'completed'
           AND (source IS NULL OR source = 'outgoing')
         ORDER BY created_at DESC`,
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

      if (!Array.isArray(rows)) {
        return [];
      }

      if (queryWords.length === 0) {
        return [];
      }

      // Normalizar palavras da query (lowercase, trim)
      const normalizedQueryWords = queryWords.map(word => word.toLowerCase().trim()).filter(word => word.length > 0);

      // Filtrar mídias cujo título ou descrição contém alguma palavra da query
      return rows.filter((media: Media) => {
        const title = (media.title || '').toLowerCase();
        const description = (media.description || '').toLowerCase();
        const searchText = `${title} ${description}`;

        // Verificar se alguma palavra da query corresponde ao título ou descrição
        return normalizedQueryWords.some(queryWord => {
          // Correspondência exata ou parcial no título ou descrição
          if (title.includes(queryWord) || description.includes(queryWord)) {
            return true;
          }

          // Verificar se são palavras similares (mesma raiz)
          // Ex: "horario" e "horários", "funcionamento" e "funciona"
          const queryWordBase = queryWord.replace(/[sçõãáàâéêíóôúü]/g, '');
          
          // Verificar no título
          const titleWords = title.split(/\s+/);
          for (const titleWord of titleWords) {
            const titleWordBase = titleWord.replace(/[sçõãáàâéêíóôúü]/g, '');
            if (queryWordBase === titleWordBase && queryWordBase.length > 3) {
              return true;
            }
          }

          // Verificar na descrição
          const descWords = description.split(/\s+/);
          for (const descWord of descWords) {
            const descWordBase = descWord.replace(/[sçõãáàâéêíóôúü]/g, '');
            if (queryWordBase === descWordBase && queryWordBase.length > 3) {
              return true;
            }
          }

          return false;
        });
      });
    } catch (error: any) {
      logger.error(`Erro ao buscar mídias por palavras-chave: ${error.message}`);
      return [];
    } finally {
      conn.release();
    }
  }

  async delete(id: number): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        'DELETE FROM medias WHERE id = ?',
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
}

