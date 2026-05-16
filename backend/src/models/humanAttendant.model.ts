import pool from '../config/database';
import { HumanAttendant } from '../types';
import logger from '../utils/logger';

export class HumanAttendantModel {
  async findByUserId(userId: number): Promise<HumanAttendant[]> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT id, user_id, phone_number, name, is_active, created_at, updated_at 
         FROM human_attendants WHERE user_id = ? 
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

  async create(attendant: Omit<HumanAttendant, 'id' | 'created_at' | 'updated_at'>): Promise<HumanAttendant> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        'INSERT INTO human_attendants (user_id, phone_number, name, is_active) VALUES (?, ?, ?, ?)',
        [
          attendant.user_id,
          attendant.phone_number,
          attendant.name || null,
          attendant.is_active !== undefined ? attendant.is_active : true,
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
        throw new Error('Erro ao obter ID do atendente criado');
      }

      const created = await this.findById(insertId);
      if (!created) {
        throw new Error('Erro ao criar atendente');
      }
      return created;
    } finally {
      conn.release();
    }
  }

  async findById(id: number): Promise<HumanAttendant | null> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT id, user_id, phone_number, name, is_active, created_at, updated_at 
         FROM human_attendants WHERE id = ?`,
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

  async update(id: number, updates: Partial<Omit<HumanAttendant, 'id' | 'created_at' | 'updated_at'>>): Promise<HumanAttendant | null> {
    const conn = await pool.getConnection();
    try {
      const fields: string[] = [];
      const values: any[] = [];

      if (updates.phone_number !== undefined) {
        fields.push('phone_number = ?');
        values.push(updates.phone_number);
      }
      if (updates.name !== undefined) {
        fields.push('name = ?');
        values.push(updates.name || null);
      }
      if (updates.is_active !== undefined) {
        fields.push('is_active = ?');
        values.push(updates.is_active);
      }

      if (fields.length === 0) {
        return await this.findById(id);
      }

      values.push(id);
      await conn.query(
        `UPDATE human_attendants SET ${fields.join(', ')} WHERE id = ?`,
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
      const queryResult = await conn.query(
        'DELETE FROM human_attendants WHERE id = ?',
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

