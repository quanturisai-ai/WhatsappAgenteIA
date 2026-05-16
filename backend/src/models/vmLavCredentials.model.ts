import pool from '../config/database';
import logger from '../utils/logger';

export interface VmLavCredentials {
  id: number;
  user_id: number;
  email: string;
  senha: string;
  token_inicial: string | null;
  token_aplicacao: string | null;
  dados_localstorage: any | null;
  cookies: any | null;
  token_expira_em: Date | null;
  ultima_sincronizacao: Date | null;
  ultimo_erro: string | null;
  status: 'ativo' | 'inativo' | 'erro';
  ativo: boolean;
  intervalo_sincronizacao_minutos: number;
  created_at: Date;
  updated_at: Date;
}

export class VmLavCredentialsModel {
  async findByUserId(userId: number): Promise<VmLavCredentials | null> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT id, user_id, email, senha, token_inicial, token_aplicacao, 
         dados_localstorage, cookies, token_expira_em, ultima_sincronizacao, ultimo_erro, 
         status, ativo, intervalo_sincronizacao_minutos, created_at, updated_at 
         FROM vm_lav_credentials 
         WHERE user_id = ? AND ativo = 1 
         ORDER BY created_at DESC 
         LIMIT 1`,
        [userId]
      );

      // Extrair rows de forma segura
      let rows: any[] = [];
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
        rows = Array.from(queryResult as any);
      }

      if (rows && rows.length > 0) {
        return this.mapRowToCredentials(rows[0]);
      }
      return null;
    } finally {
      conn.release();
    }
  }

  async findById(id: number): Promise<VmLavCredentials | null> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT id, user_id, email, senha, token_inicial, token_aplicacao, 
         dados_localstorage, cookies, token_expira_em, ultima_sincronizacao, ultimo_erro, 
         status, ativo, intervalo_sincronizacao_minutos, created_at, updated_at 
         FROM vm_lav_credentials 
         WHERE id = ?`,
        [id]
      );

      // Extrair rows de forma segura
      let rows: any[] = [];
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
        rows = Array.from(queryResult as any);
      }

      if (rows && rows.length > 0) {
        return this.mapRowToCredentials(rows[0]);
      }
      return null;
    } finally {
      conn.release();
    }
  }

  async findAll(): Promise<VmLavCredentials[]> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT id, user_id, email, senha, token_inicial, token_aplicacao, 
         dados_localstorage, cookies, token_expira_em, ultima_sincronizacao, ultimo_erro, 
         status, ativo, intervalo_sincronizacao_minutos, created_at, updated_at 
         FROM vm_lav_credentials 
         WHERE ativo = 1 
         ORDER BY user_id, created_at DESC`
      );

      // Extrair rows de forma segura
      let rows: any[] = [];
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
        rows = Array.from(queryResult as any);
      }

      if (rows && rows.length > 0) {
        return rows.map(row => this.mapRowToCredentials(row));
      }
      return [];
    } finally {
      conn.release();
    }
  }

  async create(credentials: Omit<VmLavCredentials, 'id' | 'created_at' | 'updated_at'>): Promise<VmLavCredentials> {
    const conn = await pool.getConnection();
    try {
      // Desativar outras credenciais do mesmo usuário
      await conn.query(
        'UPDATE vm_lav_credentials SET ativo = FALSE WHERE user_id = ?',
        [credentials.user_id]
      );

      const queryResult = await conn.query(
        `INSERT INTO vm_lav_credentials 
         (user_id, email, senha, token_inicial, token_aplicacao, dados_localstorage, 
          cookies, token_expira_em, ultima_sincronizacao, ultimo_erro, status, ativo, intervalo_sincronizacao_minutos) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          credentials.user_id,
          credentials.email,
          credentials.senha,
          credentials.token_inicial || null,
          credentials.token_aplicacao || null,
          credentials.dados_localstorage ? JSON.stringify(credentials.dados_localstorage) : null,
          credentials.cookies ? JSON.stringify(credentials.cookies) : null,
          credentials.token_expira_em || null,
          credentials.ultima_sincronizacao || null,
          credentials.ultimo_erro || null,
          credentials.status || 'inativo',
          credentials.ativo !== undefined ? (credentials.ativo ? 1 : 0) : 1,
          credentials.intervalo_sincronizacao_minutos !== undefined ? credentials.intervalo_sincronizacao_minutos : 10,
        ]
      );

      // Extrair result de forma segura
      let result: any;
      if (Array.isArray(queryResult)) {
        // Se for array, pegar o primeiro elemento
        result = queryResult[0] || queryResult;
      } else if (queryResult && typeof queryResult === 'object') {
        // Se já for objeto com insertId
        result = queryResult;
      } else {
        // Fallback: usar queryResult diretamente
        result = queryResult;
      }

      // Verificar se temos insertId
      const insertId = result?.insertId || result?.insertid || (Array.isArray(result) && result[0]?.insertId);
      
      if (!insertId) {
        logger.error('queryResult: ' + JSON.stringify(queryResult));
        logger.error('result: ' + JSON.stringify(result));
        throw new Error('Não foi possível obter o ID do registro inserido');
      }

      logger.debug('Inserido registro com ID: ' + String(insertId));
      const created = await this.findById(insertId);
      
      if (!created) {
        // Tentar buscar diretamente do banco como fallback
        logger.warn('findById retornou null, tentando buscar diretamente do banco...');
        const directQuery = await conn.query(
          `SELECT id, user_id, email, senha, token_inicial, token_aplicacao, 
           dados_localstorage, cookies, token_expira_em, ultima_sincronizacao, ultimo_erro, 
           status, ativo, intervalo_sincronizacao_minutos, created_at, updated_at 
           FROM vm_lav_credentials 
           WHERE id = ?`,
          [insertId]
        );
        
        let directRows: any[] = [];
        if (Array.isArray(directQuery)) {
          directRows = Array.isArray(directQuery[0]) ? directQuery[0] : directQuery;
        } else if (directQuery && typeof directQuery === 'object' && 'length' in directQuery) {
          directRows = Array.from(directQuery as any);
        }
        
        if (directRows && directRows.length > 0) {
          logger.info('Registro encontrado via query direta, mapeando...');
          return this.mapRowToCredentials(directRows[0]);
        }
        
        logger.error('Registro não encontrado mesmo com query direta. insertId: ' + String(insertId));
        throw new Error('Erro ao criar credenciais VM Lav: registro não encontrado após inserção');
      }
      return created;
    } finally {
      conn.release();
    }
  }

  async update(id: number, updates: Partial<Omit<VmLavCredentials, 'id' | 'user_id' | 'created_at' | 'updated_at'>>): Promise<VmLavCredentials | null> {
    const conn = await pool.getConnection();
    try {
      const fields: string[] = [];
      const values: any[] = [];

      if (updates.email !== undefined) {
        fields.push('email = ?');
        values.push(updates.email);
      }
      if (updates.senha !== undefined) {
        fields.push('senha = ?');
        values.push(updates.senha);
      }
      if (updates.token_inicial !== undefined) {
        fields.push('token_inicial = ?');
        values.push(updates.token_inicial);
      }
      if (updates.token_aplicacao !== undefined) {
        fields.push('token_aplicacao = ?');
        values.push(updates.token_aplicacao);
      }
      if (updates.dados_localstorage !== undefined) {
        fields.push('dados_localstorage = ?');
        values.push(updates.dados_localstorage ? JSON.stringify(updates.dados_localstorage) : null);
      }
      if (updates.cookies !== undefined) {
        fields.push('cookies = ?');
        values.push(updates.cookies ? JSON.stringify(updates.cookies) : null);
      }
      if (updates.token_expira_em !== undefined) {
        fields.push('token_expira_em = ?');
        values.push(updates.token_expira_em);
      }
      if (updates.ultima_sincronizacao !== undefined) {
        fields.push('ultima_sincronizacao = ?');
        values.push(updates.ultima_sincronizacao);
      }
      if (updates.ultimo_erro !== undefined) {
        fields.push('ultimo_erro = ?');
        values.push(updates.ultimo_erro);
      }
      if (updates.status !== undefined) {
        fields.push('status = ?');
        values.push(updates.status);
      }
      if (updates.ativo !== undefined) {
        fields.push('ativo = ?');
        values.push(updates.ativo ? 1 : 0);
      }
      if (updates.intervalo_sincronizacao_minutos !== undefined) {
        fields.push('intervalo_sincronizacao_minutos = ?');
        values.push(updates.intervalo_sincronizacao_minutos);
      }

      if (fields.length === 0) {
        return await this.findById(id);
      }

      values.push(id);
      await conn.query(
        `UPDATE vm_lav_credentials SET ${fields.join(', ')} WHERE id = ?`,
        values
      );

      return await this.findById(id);
    } finally {
      conn.release();
    }
  }

  async delete(id: number): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query(
        'DELETE FROM vm_lav_credentials WHERE id = ?',
        [id]
      ) as any;
      return result.affectedRows > 0;
    } finally {
      conn.release();
    }
  }

  private mapRowToCredentials(row: any): VmLavCredentials {
    let dadosLocalstorage: any = null;
    if (row.dados_localstorage) {
      try {
        dadosLocalstorage = typeof row.dados_localstorage === 'string' 
          ? JSON.parse(row.dados_localstorage) 
          : row.dados_localstorage;
      } catch (error: any) {
        logger.warn('Erro ao parsear dados_localstorage: ' + String(error?.message || error || 'Erro desconhecido'));
      }
    }

    let cookies: any = null;
    if (row.cookies) {
      try {
        cookies = typeof row.cookies === 'string' 
          ? JSON.parse(row.cookies) 
          : row.cookies;
      } catch (error: any) {
        logger.warn('Erro ao parsear cookies: ' + String(error?.message || error || 'Erro desconhecido'));
      }
    }

    return {
      id: row.id,
      user_id: row.user_id,
      email: row.email,
      senha: row.senha,
      token_inicial: row.token_inicial,
      token_aplicacao: row.token_aplicacao,
      dados_localstorage: dadosLocalstorage,
      cookies: cookies,
      token_expira_em: row.token_expira_em,
      ultima_sincronizacao: row.ultima_sincronizacao,
      ultimo_erro: row.ultimo_erro,
      status: row.status || 'inativo',
      ativo: row.ativo === 1 || row.ativo === true,
      intervalo_sincronizacao_minutos: row.intervalo_sincronizacao_minutos !== undefined && row.intervalo_sincronizacao_minutos !== null ? row.intervalo_sincronizacao_minutos : 10,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}

