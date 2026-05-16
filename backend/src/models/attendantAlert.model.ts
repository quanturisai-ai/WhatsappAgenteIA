import pool from '../config/database';
import { AttendantAlert } from '../types';
import logger from '../utils/logger';

export class AttendantAlertModel {
  async create(alert: Omit<AttendantAlert, 'id' | 'sent_at'>): Promise<AttendantAlert> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        'INSERT INTO attendant_alerts (user_id, conversation_id, topic_id, alert_message) VALUES (?, ?, ?, ?)',
        [
          alert.user_id,
          alert.conversation_id,
          alert.topic_id || null,
          alert.alert_message,
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
        throw new Error('Erro ao obter ID do alerta criado');
      }

      const created = await this.findById(insertId);
      if (!created) {
        throw new Error('Erro ao criar alerta');
      }
      return created;
    } finally {
      conn.release();
    }
  }

  async findById(id: number): Promise<AttendantAlert | null> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT id, user_id, conversation_id, topic_id, alert_message, sent_at, resolved_at 
         FROM attendant_alerts WHERE id = ?`,
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

  async findByConversationId(conversationId: number): Promise<AttendantAlert[]> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT id, user_id, conversation_id, topic_id, alert_message, sent_at, resolved_at 
         FROM attendant_alerts 
         WHERE conversation_id = ? 
         ORDER BY sent_at DESC`,
        [conversationId]
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

  async findByUserId(userId: number, limit: number = 50): Promise<AttendantAlert[]> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT id, user_id, conversation_id, topic_id, alert_message, sent_at, resolved_at 
         FROM attendant_alerts 
         WHERE user_id = ? 
         ORDER BY sent_at DESC 
         LIMIT ?`,
        [userId, limit]
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

  async markAsResolved(id: number): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        'UPDATE attendant_alerts SET resolved_at = CURRENT_TIMESTAMP WHERE id = ?',
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

