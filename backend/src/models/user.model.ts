import pool from '../config/database';
import { User } from '../types';

export class UserModel {
  async findById(id: number): Promise<User | null> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query(
        'SELECT id, username, email, password_hash, created_at, updated_at FROM users WHERE id = ?',
        [id]
      ) as any[];
      return rows && rows.length > 0 ? rows[0] : null;
    } finally {
      conn.release();
    }
  }

  async findByUsername(username: string): Promise<User | null> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query(
        'SELECT id, username, email, password_hash, created_at, updated_at FROM users WHERE username = ?',
        [username]
      ) as any[];
      return rows && rows.length > 0 ? rows[0] : null;
    } finally {
      conn.release();
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query(
        'SELECT id, username, email, password_hash, created_at, updated_at FROM users WHERE email = ?',
        [email]
      ) as any[];
      return rows && rows.length > 0 ? rows[0] : null;
    } finally {
      conn.release();
    }
  }

  async create(user: Omit<User, 'id' | 'created_at' | 'updated_at'>): Promise<User> {
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
        [user.username, user.email, user.password_hash]
      ) as any;

      const created = await this.findById(result.insertId);
      if (!created) {
        throw new Error('Erro ao criar usuário');
      }
      return created;
    } finally {
      conn.release();
    }
  }

  async update(id: number, updates: Partial<Omit<User, 'id' | 'created_at' | 'updated_at'>>): Promise<User | null> {
    const conn = await pool.getConnection();
    try {
      const fields: string[] = [];
      const values: any[] = [];

      if (updates.username !== undefined) {
        fields.push('username = ?');
        values.push(updates.username);
      }
      if (updates.email !== undefined) {
        fields.push('email = ?');
        values.push(updates.email);
      }
      if (updates.password_hash !== undefined) {
        fields.push('password_hash = ?');
        values.push(updates.password_hash);
      }

      if (fields.length === 0) {
        return await this.findById(id);
      }

      values.push(id);
      await conn.query(
        `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
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
        'DELETE FROM users WHERE id = ?',
        [id]
      ) as any;
      return result.affectedRows > 0;
    } finally {
      conn.release();
    }
  }
}

