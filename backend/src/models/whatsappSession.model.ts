import pool from '../config/database';
import { WhatsAppSession } from '../types';
import logger from '../utils/logger';

export class WhatsAppSessionModel {
  /**
   * Busca todas as sessões (1 por usuário devido ao UNIQUE constraint)
   * Usado para reconexão automática no startup
   */
  async findAll(): Promise<WhatsAppSession[]> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT id, user_id, session_data, qr_code, status, last_connected_at, last_ready_at, 
         session_files_path, session_files_hash, created_at, updated_at 
         FROM whatsapp_sessions 
         ORDER BY user_id`
      ) as any;

      let rows: any;
      if (Array.isArray(queryResult)) {
        if (queryResult.length > 0 && Array.isArray(queryResult[0])) {
          [rows] = queryResult;
        } else {
          rows = queryResult;
        }
      } else if (queryResult && typeof queryResult === 'object') {
        rows = queryResult.rows || queryResult;
      } else {
        return [];
      }

      if (Array.isArray(rows)) {
        logger.debug(`findAll - retornando ${rows.length} sessão(ões)`);
        return rows;
      } else if (rows && typeof rows === 'object') {
        return [rows];
      }

      return [];
    } catch (error: any) {
      logger.error(`findAll - erro: ${error.message}`, error);
      return [];
    } finally {
      conn.release();
    }
  }

  /**
   * Obtém ou cria uma sessão para o usuário
   * GARANTIA: Sempre retorna exatamente 1 sessão por usuário
   * Este é o método principal que deve ser usado para obter sessões
   */
  async getOrCreateSession(userId: number): Promise<WhatsAppSession> {
    // Primeiro tenta encontrar a sessão existente
    let session = await this.findByUserId(userId);
    
    if (session) {
      logger.debug(`getOrCreateSession - Sessão existente encontrada para user ${userId}: ID=${session.id}, status=${session.status}`);
      return session;
    }
    
    // Se não existe, criar uma nova (única vez que isso deve acontecer)
    logger.info(`getOrCreateSession - Criando nova sessão para user ${userId}`);
    
    try {
      session = await this.create({
        user_id: userId,
        status: 'disconnected',
        session_data: '',
      });
      logger.info(`getOrCreateSession - Nova sessão criada para user ${userId}: ID=${session.id}`);
      return session;
    } catch (error: any) {
      // Se falhou por constraint UNIQUE, significa que outro processo criou a sessão
      // Tentar buscar novamente
      if (error.message.includes('Duplicate entry') || error.message.includes('uk_user_session')) {
        logger.warn(`getOrCreateSession - Constraint UNIQUE acionada, buscando sessão existente para user ${userId}`);
        session = await this.findByUserId(userId);
        if (session) {
          return session;
        }
      }
      throw error;
    }
  }

  async findByUserId(userId: number): Promise<WhatsAppSession | null> {
    const conn = await pool.getConnection();
    try {
      // Ordenar por updated_at DESC primeiro, depois created_at DESC
      // Isso garante que a sessão mais recente seja retornada
      const queryResult = await conn.query(
        `SELECT id, user_id, session_data, qr_code, status, last_connected_at, last_ready_at, 
         session_files_path, session_files_hash, created_at, updated_at 
         FROM whatsapp_sessions WHERE user_id = ? 
         ORDER BY updated_at DESC, created_at DESC LIMIT 1`,
        [userId]
      ) as any;
      
      logger.debug(`findByUserId - Tipo do resultado: ${typeof queryResult}, É array? ${Array.isArray(queryResult)}`);
      
      // Verificar se o resultado é array antes de desestruturar
      let rows: any;
      if (Array.isArray(queryResult)) {
        // Se for array, desestruturar (MariaDB retorna [rows, metadata])
        [rows] = queryResult;
      } else if (queryResult && typeof queryResult === 'object') {
        // Se for objeto direto, usar diretamente
        rows = queryResult;
      } else {
        logger.error(`Formato de resultado inesperado no findByUserId: ${typeof queryResult}`);
        return null;
      }
      
      logger.debug(`findByUserId - Resultado processado: ${rows ? (Array.isArray(rows) ? `${rows.length} registros` : 'objeto único') : 'null'}`);
      
      if (rows && Array.isArray(rows) && rows.length > 0) {
        logger.debug(`findByUserId - Retornando sessão ID: ${rows[0].id}, status: ${rows[0].status}`);
        return rows[0];
      } else if (rows && !Array.isArray(rows) && rows.id) {
        // Se rows não for array mas for um objeto com id, retornar diretamente
        logger.debug(`findByUserId - Retornando sessão ID: ${rows.id}, status: ${rows.status}`);
        return rows;
      }
      
      logger.debug(`findByUserId - Nenhuma sessão encontrada para user_id ${userId}`);
      return null;
    } catch (error: any) {
      logger.error(`Erro ao buscar sessão por user_id ${userId}: ${error.message}`);
      logger.error(`Stack: ${error.stack}`);
      return null;
    } finally {
      conn.release();
    }
  }

  async findByStatus(status: string): Promise<WhatsAppSession[]> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT id, user_id, session_data, qr_code, status, last_connected_at, last_ready_at, 
         session_files_path, session_files_hash, created_at, updated_at 
         FROM whatsapp_sessions WHERE status = ? 
         ORDER BY created_at DESC`,
        [status]
      ) as any;

      logger.debug(`findByStatus - status=${status}, queryResult type=${typeof queryResult}, isArray=${Array.isArray(queryResult)}`);

      let rows: any;
      
      // Tratar formato de retorno do MariaDB (pode ser [rows, metadata] ou objeto direto)
      if (Array.isArray(queryResult)) {
        // Se for array, pode ser [rows, metadata] ou array direto
        if (queryResult.length > 0 && Array.isArray(queryResult[0])) {
          [rows] = queryResult;
        } else {
          rows = queryResult;
        }
      } else if (queryResult && typeof queryResult === 'object') {
        // Se for objeto direto, tentar extrair rows
        rows = queryResult.rows || queryResult;
      } else {
        logger.warn(`findByStatus - formato inesperado de queryResult: ${typeof queryResult}`);
        return [];
      }

      // Garantir que sempre retorne um array
      if (Array.isArray(rows)) {
        logger.debug(`findByStatus - retornando ${rows.length} sessão(ões) com status=${status}`);
        return rows;
      } else if (rows && typeof rows === 'object') {
        // Se retornou um único objeto, retornar como array
        logger.debug(`findByStatus - retornando 1 sessão (objeto único) com status=${status}`);
        return [rows];
      }

      logger.debug(`findByStatus - nenhuma sessão encontrada com status=${status}`);
      return [];
    } catch (error: any) {
      logger.error(`findByStatus - erro: ${error.message}`, error);
      return [];
    } finally {
      conn.release();
    }
  }

  /**
   * Cria uma nova sessão para o usuário
   * ATENÇÃO: Prefira usar getOrCreateSession() para garantir unicidade
   * Este método lançará erro se já existir uma sessão (devido ao UNIQUE constraint)
   */
  async create(session: Omit<WhatsAppSession, 'id' | 'created_at' | 'updated_at'>): Promise<WhatsAppSession> {
    const conn = await pool.getConnection();
    try {
      // Verificar se já existe uma sessão para este usuário (segurança extra)
      const existing = await this.findByUserId(session.user_id);
      if (existing) {
        logger.warn(`create - Sessão já existe para user ${session.user_id} (ID=${existing.id}). Retornando existente ao invés de criar duplicata.`);
        return existing;
      }
      
      const queryResult = await conn.query(
        'INSERT INTO whatsapp_sessions (user_id, session_data, qr_code, status, last_connected_at, last_ready_at, session_files_path, session_files_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          session.user_id,
          session.session_data || null,
          session.qr_code || null,
          session.status || 'disconnected',
          session.last_connected_at || null,
          session.last_ready_at || null,
          session.session_files_path || null,
          session.session_files_hash || null,
        ]
      ) as any;

      logger.debug('Resultado do INSERT (tipo):', typeof queryResult, 'É array?', Array.isArray(queryResult));

      // Verificar se o resultado é array antes de desestruturar
      let result: any;
      if (Array.isArray(queryResult)) {
        [result] = queryResult;
      } else if (queryResult && typeof queryResult === 'object') {
        result = queryResult;
      } else {
        logger.error('Formato de resultado inesperado:', typeof queryResult);
        throw new Error('Formato de resultado inesperado do banco de dados');
      }

      // Converter insertId de BigInt para Number se necessário
      let insertId: number | undefined;
      if (result?.insertId !== undefined) {
        insertId = typeof result.insertId === 'bigint' 
          ? Number(result.insertId) 
          : Number(result.insertId);
      }
      
      if (!insertId || isNaN(insertId)) {
        logger.error('Não foi possível obter insertId do resultado. Tipo:', typeof result?.insertId);
        const fallback = await this.findByUserId(session.user_id);
        if (fallback) {
          logger.info('Sessão encontrada pelo user_id como fallback');
          return fallback;
        }
        throw new Error('Erro ao obter ID da sessão criada');
      }

      logger.debug('InsertId obtido:', insertId);

      // Buscar na mesma conexão para garantir consistência
      const [createdRows] = await conn.query(
        'SELECT id, user_id, session_data, qr_code, status, created_at, updated_at FROM whatsapp_sessions WHERE id = ?',
        [insertId]
      ) as any[];
      
      if (createdRows && Array.isArray(createdRows) && createdRows.length > 0) {
        logger.debug(`Sessão criada: ID=${createdRows[0].id}, status=${createdRows[0].status}`);
        return createdRows[0];
      }
      
      const fallback = await this.findByUserId(session.user_id);
      if (fallback) {
        logger.info(`Sessão encontrada pelo user_id: ID=${fallback.id}, status=${fallback.status}`);
        return fallback;
      }
      
      throw new Error(`Erro ao criar sessão WhatsApp - sessão não encontrada após insert (insertId: ${insertId})`);
    } catch (error: any) {
      // Se falhou por constraint UNIQUE, retornar a existente
      if (error.message.includes('Duplicate entry') || error.message.includes('uk_user_session')) {
        logger.warn(`create - Constraint UNIQUE acionada para user ${session.user_id}, retornando sessão existente`);
        const existing = await this.findByUserId(session.user_id);
        if (existing) {
          return existing;
        }
      }
      throw error;
    } finally {
      conn.release();
    }
  }

  async findById(id: number): Promise<WhatsAppSession | null> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        'SELECT id, user_id, session_data, qr_code, status, last_connected_at, last_ready_at, session_files_path, session_files_hash, created_at, updated_at FROM whatsapp_sessions WHERE id = ?',
        [id]
      ) as any;

      logger.debug('findById - Tipo do resultado:', typeof queryResult, 'É array?', Array.isArray(queryResult));
      logger.debug('findById - ID buscado:', id);

      // Verificar se o resultado é array antes de desestruturar
      let rows: any;
      if (Array.isArray(queryResult)) {
        // Se for array, desestruturar
        [rows] = queryResult;
      } else if (queryResult && typeof queryResult === 'object') {
        // Se for objeto direto, usar diretamente
        rows = queryResult;
      } else {
        logger.error('Formato de resultado inesperado no findById:', typeof queryResult);
        return null;
      }

      logger.debug('findById - Resultado:', rows ? 'encontrado' : 'não encontrado', rows?.length || 0, 'registros');
      
      if (rows && Array.isArray(rows) && rows.length > 0) {
        return rows[0];
      } else if (rows && !Array.isArray(rows) && rows.id) {
        // Se rows não for array mas for um objeto com id, retornar diretamente
        return rows;
      }
      
      return null;
    } finally {
      conn.release();
    }
  }

  async update(id: number, updates: Partial<Omit<WhatsAppSession, 'id' | 'created_at' | 'updated_at'>>): Promise<WhatsAppSession | null> {
    const conn = await pool.getConnection();
    try {
      const fields: string[] = [];
      const values: any[] = [];

      if (updates.session_data !== undefined) {
        fields.push('session_data = ?');
        values.push(updates.session_data);
      }
      if (updates.qr_code !== undefined) {
        fields.push('qr_code = ?');
        values.push(updates.qr_code);
      }
      if (updates.status !== undefined) {
        fields.push('status = ?');
        values.push(updates.status);
      }
      if (updates.last_connected_at !== undefined) {
        fields.push('last_connected_at = ?');
        values.push(updates.last_connected_at || null);
      }
      if (updates.last_ready_at !== undefined) {
        fields.push('last_ready_at = ?');
        values.push(updates.last_ready_at || null);
      }
      if (updates.session_files_path !== undefined) {
        fields.push('session_files_path = ?');
        values.push(updates.session_files_path || null);
      }
      if (updates.session_files_hash !== undefined) {
        fields.push('session_files_hash = ?');
        values.push(updates.session_files_hash || null);
      }

      if (fields.length === 0) {
        const [rows] = await conn.query(
          'SELECT id, user_id, session_data, qr_code, status, last_connected_at, last_ready_at, session_files_path, session_files_hash, created_at, updated_at FROM whatsapp_sessions WHERE id = ?',
          [id]
        ) as any[];
        return rows && rows.length > 0 ? rows[0] : null;
      }

      values.push(id);
      await conn.query(
        `UPDATE whatsapp_sessions SET ${fields.join(', ')} WHERE id = ?`,
        values
      );

      const [rows] = await conn.query(
        'SELECT id, user_id, session_data, qr_code, status, last_connected_at, last_ready_at, session_files_path, session_files_hash, created_at, updated_at FROM whatsapp_sessions WHERE id = ?',
        [id]
      ) as any[];
      return rows && rows.length > 0 ? rows[0] : null;
    } finally {
      conn.release();
    }
  }

  async updateByUserId(userId: number, updates: Partial<Omit<WhatsAppSession, 'id' | 'user_id' | 'created_at' | 'updated_at'>>): Promise<WhatsAppSession | null> {
    const session = await this.findByUserId(userId);
    if (!session) {
      return null;
    }
    return await this.update(session.id, updates);
  }

  async delete(id: number): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
      const result = await conn.query(
        'DELETE FROM whatsapp_sessions WHERE id = ?',
        [id]
      ) as any;
      return result.affectedRows > 0;
    } finally {
      conn.release();
    }
  }
}

