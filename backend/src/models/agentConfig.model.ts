import pool from '../config/database';
import { AgentConfig } from '../types';

export class AgentConfigModel {
  async findByUserId(userId: number): Promise<AgentConfig | null> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT id, user_id, business_name, business_info, services, hours, 
         personality, greeting_message, farewell_message, absence_message, 
         specific_instructions, embedding_model, generation_model,
         temperature, top_p, top_k, repeat_penalty, max_age_hours,
         last_indexed_at, indexing_status, content_hash,
         created_at, updated_at 
         FROM agent_config WHERE user_id = ?`,
        [userId]
      ) as any;
      
      let rows: any;
      
      // MariaDB pode retornar de diferentes formas
      if (Array.isArray(queryResult)) {
        // Se for array, pode ser [rows, metadata] ou array direto
        if (queryResult.length > 0 && Array.isArray(queryResult[0])) {
          // Formato [rows, metadata]
          [rows] = queryResult;
        } else {
          // Array direto de resultados
          rows = queryResult;
        }
      } else if (queryResult && typeof queryResult === 'object') {
        // Se for objeto direto
        rows = queryResult.rows || [queryResult];
      } else {
        return null;
      }
      
      if (Array.isArray(rows) && rows.length > 0) {
        return rows[0];
      } else if (rows && !Array.isArray(rows) && rows.id) {
        // Se não for array mas tem id, é um objeto direto
        return rows;
      }
      
      return null;
    } catch (error: any) {
      throw error;
    } finally {
      conn.release();
    }
  }

  async create(config: Omit<AgentConfig, 'id' | 'created_at' | 'updated_at'>): Promise<AgentConfig> {
    const conn = await pool.getConnection();
    try {
      const _result = await conn.query(
        `INSERT INTO agent_config 
         (user_id, business_name, business_info, services, hours, personality, 
          greeting_message, farewell_message, absence_message, specific_instructions,
          embedding_model, generation_model, temperature, top_p, top_k, repeat_penalty, max_age_hours) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          config.user_id,
          config.business_name || null,
          config.business_info || null,
          config.services || null,
          config.hours || null,
          config.personality || null,
          config.greeting_message || null,
          config.farewell_message || null,
          config.absence_message || null,
          config.specific_instructions || null,
          config.embedding_model || 'deepseek-r1',
          config.generation_model || 'deepseek-r1',
          config.temperature ?? 0.7,
          config.top_p ?? 0.9,
          config.top_k ?? 40,
          config.repeat_penalty ?? 1.1,
          config.max_age_hours ?? 12,
        ]
      ) as any;

      const created = await this.findByUserId(config.user_id);
      if (!created) {
        throw new Error('Erro ao criar configuração do agente');
      }
      return created;
    } finally {
      conn.release();
    }
  }

  async update(userId: number, updates: Partial<Omit<AgentConfig, 'id' | 'user_id' | 'created_at' | 'updated_at'>>): Promise<AgentConfig | null> {
    const conn = await pool.getConnection();
    try {
      const fields: string[] = [];
      const values: any[] = [];

      if (updates.business_name !== undefined) {
        fields.push('business_name = ?');
        values.push(updates.business_name);
      }
      if (updates.business_info !== undefined) {
        fields.push('business_info = ?');
        values.push(updates.business_info);
      }
      if (updates.services !== undefined) {
        fields.push('services = ?');
        values.push(updates.services);
      }
      if (updates.hours !== undefined) {
        fields.push('hours = ?');
        values.push(updates.hours);
      }
      if (updates.personality !== undefined) {
        fields.push('personality = ?');
        values.push(updates.personality);
      }
      if (updates.greeting_message !== undefined) {
        fields.push('greeting_message = ?');
        values.push(updates.greeting_message);
      }
      if (updates.farewell_message !== undefined) {
        fields.push('farewell_message = ?');
        values.push(updates.farewell_message);
      }
      if (updates.absence_message !== undefined) {
        fields.push('absence_message = ?');
        values.push(updates.absence_message);
      }
      if (updates.specific_instructions !== undefined) {
        fields.push('specific_instructions = ?');
        values.push(updates.specific_instructions);
      }
      if (updates.embedding_model !== undefined) {
        fields.push('embedding_model = ?');
        values.push(updates.embedding_model);
      }
      if (updates.generation_model !== undefined) {
        fields.push('generation_model = ?');
        values.push(updates.generation_model);
      }
      if (updates.temperature !== undefined) {
        fields.push('temperature = ?');
        values.push(updates.temperature);
      }
      if (updates.top_p !== undefined) {
        fields.push('top_p = ?');
        values.push(updates.top_p);
      }
      if (updates.top_k !== undefined) {
        fields.push('top_k = ?');
        values.push(updates.top_k);
      }
      if (updates.repeat_penalty !== undefined) {
        fields.push('repeat_penalty = ?');
        values.push(updates.repeat_penalty);
      }
      if (updates.max_age_hours !== undefined) {
        fields.push('max_age_hours = ?');
        values.push(updates.max_age_hours);
      }

      if (fields.length === 0) {
        return await this.findByUserId(userId);
      }

      values.push(userId);
      await conn.query(
        `UPDATE agent_config SET ${fields.join(', ')} WHERE user_id = ?`,
        values
      );

      return await this.findByUserId(userId);
    } finally {
      conn.release();
    }
  }

  async upsert(config: Omit<AgentConfig, 'id' | 'created_at' | 'updated_at'>): Promise<AgentConfig> {
    const existing = await this.findByUserId(config.user_id);
    if (existing) {
      const updated = await this.update(config.user_id, config);
      if (!updated) {
        throw new Error('Erro ao atualizar configuração');
      }
      return updated;
    } else {
      return await this.create(config);
    }
  }
}

