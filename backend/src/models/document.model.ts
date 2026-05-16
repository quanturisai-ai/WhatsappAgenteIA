import pool from '../config/database';
import { Document } from '../types';

export class DocumentModel {
  async findById(id: number): Promise<Document | null> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query(
        `SELECT id, user_id, filename, file_type, file_path, file_size, 
         status, error_message, created_at, updated_at 
         FROM documents WHERE id = ?`,
        [id]
      ) as any[];
      return rows && rows.length > 0 ? rows[0] : null;
    } finally {
      conn.release();
    }
  }

  async findByUserId(userId: number): Promise<Document[]> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query(
        `SELECT id, user_id, filename, file_type, file_path, file_size, 
         status, error_message, last_indexed_at, indexing_status, content_hash,
         created_at, updated_at 
         FROM documents WHERE user_id = ? 
         ORDER BY created_at DESC`,
        [userId]
      ) as any[];
      return rows || [];
    } finally {
      conn.release();
    }
  }

  async create(document: Omit<Document, 'id' | 'created_at' | 'updated_at'>): Promise<Document> {
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query(
        'INSERT INTO documents (user_id, filename, file_type, file_path, file_size, status, error_message) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          document.user_id,
          document.filename,
          document.file_type,
          document.file_path,
          document.file_size,
          document.status || 'pending',
          document.error_message || null,
        ]
      ) as any;

      const created = await this.findById(result.insertId);
      if (!created) {
        throw new Error('Erro ao criar documento');
      }
      return created;
    } finally {
      conn.release();
    }
  }

  async update(id: number, updates: Partial<Omit<Document, 'id' | 'created_at' | 'updated_at'>>): Promise<Document | null> {
    const conn = await pool.getConnection();
    try {
      const fields: string[] = [];
      const values: any[] = [];

      if (updates.status !== undefined) {
        fields.push('status = ?');
        values.push(updates.status);
      }
      if (updates.error_message !== undefined) {
        fields.push('error_message = ?');
        values.push(updates.error_message);
      }

      if (fields.length === 0) {
        return await this.findById(id);
      }

      values.push(id);
      await conn.query(
        `UPDATE documents SET ${fields.join(', ')} WHERE id = ?`,
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
        'DELETE FROM documents WHERE id = ?',
        [id]
      ) as any;
      return result.affectedRows > 0;
    } finally {
      conn.release();
    }
  }
}

