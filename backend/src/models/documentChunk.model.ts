import pool from '../config/database';
import { DocumentChunk } from '../types';

export class DocumentChunkModel {
  async findByDocumentId(documentId: number): Promise<DocumentChunk[]> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query(
        `SELECT id, document_id, chunk_text, chunk_index, embedding, created_at 
         FROM document_chunks WHERE document_id = ? 
         ORDER BY chunk_index ASC`,
        [documentId]
      ) as any[];
      return rows || [];
    } finally {
      conn.release();
    }
  }

  async create(chunk: Omit<DocumentChunk, 'id' | 'created_at'>): Promise<DocumentChunk> {
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query(
        'INSERT INTO document_chunks (document_id, chunk_text, chunk_index, embedding) VALUES (?, ?, ?, ?)',
        [
          chunk.document_id,
          chunk.chunk_text,
          chunk.chunk_index,
          chunk.embedding || null,
        ]
      ) as any;

      const [rows] = await conn.query(
        'SELECT id, document_id, chunk_text, chunk_index, embedding, created_at FROM document_chunks WHERE id = ?',
        [result.insertId]
      ) as any[];

      if (!rows || rows.length === 0) {
        throw new Error('Erro ao criar chunk');
      }
      return rows[0];
    } finally {
      conn.release();
    }
  }

  async createMany(chunks: Omit<DocumentChunk, 'id' | 'created_at'>[]): Promise<DocumentChunk[]> {
    const conn = await pool.getConnection();
    try {
      const createdChunks: DocumentChunk[] = [];
      
      for (const chunk of chunks) {
        const created = await this.create(chunk);
        createdChunks.push(created);
      }

      return createdChunks;
    } finally {
      conn.release();
    }
  }

  async deleteByDocumentId(documentId: number): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query(
        'DELETE FROM document_chunks WHERE document_id = ?',
        [documentId]
      ) as any;
      return result.affectedRows > 0;
    } finally {
      conn.release();
    }
  }

  async delete(id: number): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query(
        'DELETE FROM document_chunks WHERE id = ?',
        [id]
      ) as any;
      return result.affectedRows > 0;
    } finally {
      conn.release();
    }
  }
}

