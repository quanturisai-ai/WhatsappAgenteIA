import pool from '../config/database';

export interface MediaSentTracking {
  id: number;
  conversation_id: number;
  media_id: number;
  sent_at: Date;
}

export class MediaSentTrackingModel {
  /**
   * Verificar se uma mídia já foi enviada para uma conversa
   */
  async wasMediaSent(conversationId: number, mediaId: number): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        'SELECT id FROM media_sent_tracking WHERE conversation_id = ? AND media_id = ?',
        [conversationId, mediaId]
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
        return false;
      }

      return Array.isArray(rows) ? rows.length > 0 : (rows && rows.id);
    } finally {
      conn.release();
    }
  }

  /**
   * Registrar que uma mídia foi enviada para uma conversa
   */
  async markMediaAsSent(conversationId: number, mediaId: number): Promise<void> {
    const conn = await pool.getConnection();
    try {
      // Usar INSERT IGNORE para evitar duplicatas
      await conn.query(
        'INSERT IGNORE INTO media_sent_tracking (conversation_id, media_id) VALUES (?, ?)',
        [conversationId, mediaId]
      );
    } finally {
      conn.release();
    }
  }

  /**
   * Limpar registros antigos de mídias enviadas (opcional, para manutenção)
   */
  async cleanOldRecords(olderThanDays: number = 90): Promise<void> {
    const conn = await pool.getConnection();
    try {
      await conn.query(
        'DELETE FROM media_sent_tracking WHERE sent_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
        [olderThanDays]
      );
    } finally {
      conn.release();
    }
  }
}

