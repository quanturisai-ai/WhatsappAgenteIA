import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/database';
import { User } from '../types';
import logger from '../utils/logger';

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
}

export class AuthService {
  async register(data: RegisterData): Promise<{ user: Omit<User, 'password_hash'>; token: string }> {
    const conn = await pool.getConnection();
    try {
      // Verificar se usuário já existe
      const [existingRows] = await conn.query(
        'SELECT id FROM users WHERE username = ? OR email = ?',
        [data.username, data.email]
      ) as any[];

      if (existingRows && Array.isArray(existingRows) && existingRows.length > 0) {
        throw new Error('Usuário ou email já existe');
      }

      // Hash da senha
      const passwordHash = await bcrypt.hash(data.password, 10);

      // Inserir usuário
      const insertResult = await conn.query(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
        [data.username, data.email, passwordHash]
      ) as any;

      // MariaDB retorna [result, metadata] para INSERT, mas pode retornar diretamente o objeto
      let result: any;
      if (Array.isArray(insertResult)) {
        result = insertResult[0];
      } else {
        result = insertResult;
      }
      
      const insertId = result?.insertId || result?.insertid || result?.insert_id;

      if (!insertId) {
        throw new Error('Erro ao criar usuário');
      }

      // Buscar usuário criado
      const userResult = await conn.query(
        'SELECT id, username, email, created_at, updated_at FROM users WHERE id = ?',
        [insertId]
      ) as any;

      // MariaDB retorna [rows, metadata] para SELECT
      let userRows: any[];
      if (Array.isArray(userResult) && userResult.length === 2 && Array.isArray(userResult[0])) {
        // Formato [rows, metadata]
        userRows = userResult[0];
      } else if (Array.isArray(userResult) && Array.isArray(userResult[0])) {
        // Pode ser [[rows], metadata] ou [rows]
        userRows = userResult[0];
      } else if (Array.isArray(userResult)) {
        // Apenas rows
        userRows = userResult;
      } else {
        userRows = [];
      }

      if (!userRows || userRows.length === 0) {
        throw new Error('Erro ao buscar usuário criado');
      }

      const user = userRows[0];

      // Gerar token
      const token = this.generateToken(user.id);

      return { 
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          created_at: user.created_at || new Date(),
          updated_at: user.updated_at || new Date(),
        }, 
        token 
      };
    } catch (error: any) {
      // Re-lançar erro para ser tratado pelo controller
      throw error;
    } finally {
      conn.release();
    }
  }

  async login(credentials: LoginCredentials): Promise<{ user: Omit<User, 'password_hash'>; token: string }> {
    const conn = await pool.getConnection();
    try {
      // Buscar usuário - MariaDB retorna [rows, metadata]
      const queryResult = await conn.query(
        'SELECT id, username, email, password_hash, created_at, updated_at FROM users WHERE username = ?',
        [credentials.username]
      ) as any;

      // MariaDB retorna [rows, metadata] para SELECT
      let rows: any[];
      if (Array.isArray(queryResult) && queryResult.length === 2 && Array.isArray(queryResult[0])) {
        // Formato [rows, metadata]
        rows = queryResult[0];
      } else if (Array.isArray(queryResult) && Array.isArray(queryResult[0])) {
        // Pode ser [[rows], metadata] ou [rows]
        rows = queryResult[0];
      } else if (Array.isArray(queryResult)) {
        // Apenas rows
        rows = queryResult;
      } else {
        rows = [];
      }

      logger.debug(`Resultado da query de login: ${JSON.stringify({ queryResultLength: Array.isArray(queryResult) ? queryResult.length : 'not array', rowsLength: rows.length })}`);

      if (!rows || rows.length === 0) {
        logger.debug(`Usuário não encontrado: ${credentials.username}`);
        throw new Error('Credenciais inválidas');
      }

      const user = rows[0];

      if (!user || !user.password_hash) {
        throw new Error('Credenciais inválidas');
      }

      // Verificar senha
      const isValidPassword = await bcrypt.compare(credentials.password, user.password_hash);
      if (!isValidPassword) {
        throw new Error('Credenciais inválidas');
      }

      // Gerar token
      const token = this.generateToken(user.id);

      // Remover senha do objeto e formatar dados
      return { 
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          created_at: user.created_at || new Date(),
          updated_at: user.updated_at || new Date(),
        }, 
        token 
      };
    } catch (error: any) {
      // Re-lançar erro para ser tratado pelo controller
      throw error;
    } finally {
      conn.release();
    }
  }

  private generateToken(userId: number): string {
    const secret = process.env.JWT_SECRET || 'default-secret';
    const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
    
    // @ts-expect-error - Type definition issue with jsonwebtoken expiresIn
    return jwt.sign(
      { userId },
      secret,
      { expiresIn }
    );
  }
}

