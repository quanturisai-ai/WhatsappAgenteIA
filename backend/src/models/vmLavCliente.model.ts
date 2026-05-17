import pool from '../config/database';
import logger from '../utils/logger';
import { normalizeCpfToDigits, normalizeCpfColumnSql } from '../utils/cpfUtils';

export interface VmLavCliente {
  id: number;
  user_id: number;
  id_cliente_vm: number;
  nome: string | null;
  data_nascimento: Date | null;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  genero: string | null;
  data_cadastro: Date | null;
  data_ultima_compra: Date | null;
  qtd_compras: number;
  valor_total_compras: number;
  qtd_compras_90: number;
  valor_total_compras_90: number;
  qtd_compras_30: number;
  valor_total_compras_30: number;
  qtd_compras_7: number;
  valor_total_compras_7: number;
  lavanderia: string | null;
  acoes: any | null;
  created_at: Date;
  updated_at: Date;
}

export class VmLavClienteModel {
  async findById(id: number): Promise<VmLavCliente | null> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT id, user_id, id_cliente_vm, nome, data_nascimento, cpf, telefone, email, genero, 
         data_cadastro, data_ultima_compra, qtd_compras, valor_total_compras, 
         qtd_compras_90, valor_total_compras_90, qtd_compras_30, valor_total_compras_30, 
         qtd_compras_7, valor_total_compras_7, lavanderia, acoes, created_at, updated_at 
         FROM vm_lav_clientes WHERE id = ?`,
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
        return this.mapRowToCliente(rows[0]);
      }
      return null;
    } finally {
      conn.release();
    }
  }

  async findByCpf(userId: number, cpf: string): Promise<VmLavCliente | null> {
    const cpfNorm = normalizeCpfToDigits(cpf);
    if (!cpfNorm) return null;
    const conn = await pool.getConnection();
    try {
      const cpfCol = normalizeCpfColumnSql('cpf');
      const queryResult = await conn.query(
        `SELECT id, user_id, id_cliente_vm, nome, data_nascimento, cpf, telefone, email, genero, 
         data_cadastro, data_ultima_compra, qtd_compras, valor_total_compras, 
         qtd_compras_90, valor_total_compras_90, qtd_compras_30, valor_total_compras_30, 
         qtd_compras_7, valor_total_compras_7, lavanderia, acoes, created_at, updated_at 
         FROM vm_lav_clientes WHERE user_id = ? AND ${cpfCol} = ? LIMIT 1`,
        [userId, cpfNorm]
      );

      let rows: any[] = [];
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
        rows = Array.from(queryResult as any);
      }

      if (rows && rows.length > 0) {
        return this.mapRowToCliente(rows[0]);
      }
      return null;
    } finally {
      conn.release();
    }
  }

  /**
   * Busca cliente por user_id e telefone, comparando com normaliza_telefone() (mesma lógica do vínculo conversa-cliente).
   */
  async findByTelefoneNormalized(userId: number, contactNumber: string): Promise<VmLavCliente | null> {
    if (!contactNumber || !String(contactNumber).trim()) return null;
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT id, user_id, id_cliente_vm, nome, data_nascimento, cpf, telefone, email, genero,
         data_cadastro, data_ultima_compra, qtd_compras, valor_total_compras,
         qtd_compras_90, valor_total_compras_90, qtd_compras_30, valor_total_compras_30,
         qtd_compras_7, valor_total_compras_7, lavanderia, acoes, created_at, updated_at
         FROM vm_lav_clientes WHERE user_id = ? AND normaliza_telefone(telefone) = normaliza_telefone(?) LIMIT 1`,
        [userId, contactNumber]
      );

      let rows: any[] = [];
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
        rows = Array.from(queryResult as any);
      }

      if (rows && rows.length > 0) {
        return this.mapRowToCliente(rows[0]);
      }
      return null;
    } finally {
      conn.release();
    }
  }

  async findByIdClienteVm(idClienteVm: number, userId: number): Promise<VmLavCliente | null> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT id, user_id, id_cliente_vm, nome, data_nascimento, cpf, telefone, email, genero,
         data_cadastro, data_ultima_compra, qtd_compras, valor_total_compras,
         qtd_compras_90, valor_total_compras_90, qtd_compras_30, valor_total_compras_30,
         qtd_compras_7, valor_total_compras_7, lavanderia, acoes, created_at, updated_at
         FROM vm_lav_clientes WHERE id_cliente_vm = ? AND user_id = ?`,
        [idClienteVm, userId]
      );

      // Extrair rows de forma segura
      let rows: any[] = [];
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
        rows = Array.from(queryResult as any);
      }

      if (rows && rows.length > 0) {
        return this.mapRowToCliente(rows[0]);
      }
      return null;
    } finally {
      conn.release();
    }
  }

  async findByUserId(userId: number, page: number, limit: number): Promise<{ clientes: VmLavCliente[]; total: number }> {
    const conn = await pool.getConnection();
    try {
      const offset = (page - 1) * limit;
      const queryResult = await conn.query(
        `SELECT id, user_id, id_cliente_vm, nome, data_nascimento, cpf, telefone, email, 
         genero, data_cadastro, data_ultima_compra, qtd_compras, valor_total_compras, 
         qtd_compras_90, valor_total_compras_90, qtd_compras_30, valor_total_compras_30, 
         qtd_compras_7, valor_total_compras_7, lavanderia, acoes, created_at, updated_at 
         FROM vm_lav_clientes 
         WHERE user_id = ?
         ORDER BY nome ASC
         LIMIT ? OFFSET ?`,
        [userId, limit, offset]
      );

      // Extrair rows de forma segura
      let rows: any[] = [];
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
        rows = Array.from(queryResult as any);
      }

      const totalQueryResult = await conn.query(
        `SELECT COUNT(*) as total FROM vm_lav_clientes WHERE user_id = ?`,
        [userId]
      );

      // Extrair totalRows de forma segura
      let totalRows: any[] = [];
      if (Array.isArray(totalQueryResult)) {
        totalRows = Array.isArray(totalQueryResult[0]) ? totalQueryResult[0] : totalQueryResult;
      } else if (totalQueryResult && typeof totalQueryResult === 'object' && 'length' in totalQueryResult) {
        totalRows = Array.from(totalQueryResult as any);
      }

      const total = totalRows && totalRows[0] ? totalRows[0].total : 0;

      return {
        clientes: Array.isArray(rows) ? rows.map((row: any) => this.mapRowToCliente(row)) : [],
        total: Number(total) || 0,
      };
    } finally {
      conn.release();
    }
  }

  async searchByUserId(
    userId: number,
    searchTerm: string,
    page: number,
    limit: number,
    orderBy?: string,
    orderDir?: 'ASC' | 'DESC'
  ): Promise<{ clientes: (VmLavCliente & { total_lavagens: number; total_secagens: number })[]; total: number }> {
    const conn = await pool.getConnection();
    const orderByMap: Record<string, string> = {
      'nome': 'c.nome',
      'cpf': 'c.cpf',
      'telefone': 'c.telefone',
      'email': 'c.email',
      'data_cadastro': 'c.data_cadastro',
      'data_ultima_compra': 'c.data_ultima_compra',
      'qtd_compras': 'c.qtd_compras',
      'total_lavagens': 'total_lavagens',
      'total_secagens': 'total_secagens',
    };

    try {
      const offset = (page - 1) * limit;
      const searchPattern = `%${searchTerm}%`;
      const orderByField = orderBy && orderByMap[orderBy] ? orderByMap[orderBy] : 'c.nome';
      const orderDirection = orderDir === 'DESC' ? 'DESC' : 'ASC';

      const query = `
        SELECT 
          c.*,
          COALESCE(SUM(CASE WHEN p.tipo_servico = 'LAVAGEM' THEN 1 ELSE 0 END), 0) as total_lavagens,
          COALESCE(SUM(CASE WHEN p.tipo_servico = 'SECAGEM' THEN 1 ELSE 0 END), 0) as total_secagens
        FROM vm_lav_clientes c
        LEFT JOIN vm_lav_pedidos p ON p.cliente_id = c.id AND p.user_id = c.user_id
        WHERE c.user_id = ? AND (
          c.nome LIKE ? OR c.email LIKE ? OR c.telefone LIKE ? OR c.cpf LIKE ?
        )
        GROUP BY c.id
        ORDER BY ${orderByField} ${orderDirection}
        LIMIT ? OFFSET ?
      `;

      const params = [userId, searchPattern, searchPattern, searchPattern, searchPattern, limit, offset];
      const queryResult = await conn.query(query, params);

      let rows: any[] = [];
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      }

      const totalQuery = `
        SELECT COUNT(DISTINCT id) as total FROM vm_lav_clientes 
        WHERE user_id = ? AND (nome LIKE ? OR email LIKE ? OR telefone LIKE ? OR cpf LIKE ?)
      `;
      const totalParams = [userId, searchPattern, searchPattern, searchPattern, searchPattern];
      const totalQueryResult = await conn.query(totalQuery, totalParams);

      let totalRows: any[] = [];
      if (Array.isArray(totalQueryResult)) {
        totalRows = Array.isArray(totalQueryResult[0]) ? totalQueryResult[0] : totalQueryResult;
      }
      const total = totalRows && totalRows[0] ? totalRows[0].total : 0;

      return {
        clientes: Array.isArray(rows) ? rows.map((row: any) => ({
          ...(this.mapRowToCliente(row) as any),
          total_lavagens: Number(row.total_lavagens) || 0,
          total_secagens: Number(row.total_secagens) || 0,
        })) : [],
        total: Number(total) || 0,
      };
    } catch (error: any) {
      logger.error('Erro na busca de clientes: ' + error.message);
      throw error;
    } finally {
      conn.release();
    }
  }

  async findAll(options: {
    page?: number;
    limit?: number;
    search?: string;
  } = {}): Promise<{ clientes: VmLavCliente[]; total: number }> {
    const conn = await pool.getConnection();
    try {
      const { page = 1, limit = 50, search } = options;
      const offset = (page - 1) * limit;

      let whereClause = '';
      const params: any[] = [];

      if (search) {
        whereClause = `WHERE (
          nome LIKE ? OR 
          cpf LIKE ? OR 
          email LIKE ? OR 
          telefone LIKE ?
        )`;
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm, searchTerm);
      }

      // Contar total
      const [countRows] = await conn.query(
        `SELECT COUNT(*) as total FROM vm_lav_clientes ${whereClause}`,
        params
      ) as any[];

      const total = countRows[0]?.total || 0;

      // Buscar clientes
      const [rows] = await conn.query(
        `SELECT id, id_cliente_vm, nome, data_nascimento, cpf, telefone, email, genero, 
         data_cadastro, data_ultima_compra, qtd_compras, valor_total_compras, 
         qtd_compras_90, valor_total_compras_90, qtd_compras_30, valor_total_compras_30, 
         qtd_compras_7, valor_total_compras_7, lavanderia, acoes, created_at, updated_at 
         FROM vm_lav_clientes 
         ${whereClause}
         ORDER BY updated_at DESC, nome ASC 
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      ) as any[];

      return {
        clientes: rows.map((row: any) => this.mapRowToCliente(row)),
        total,
      };
    } finally {
      conn.release();
    }
  }

  async upsert(cliente: Omit<VmLavCliente, 'id' | 'created_at' | 'updated_at'>): Promise<VmLavCliente> {
    const conn = await pool.getConnection();
    try {
      // Verificar se já existe
      const existing = await this.findByIdClienteVm(cliente.id_cliente_vm, cliente.user_id);

      if (existing) {
        // Atualizar
        await conn.query(
          `UPDATE vm_lav_clientes SET 
           nome = ?, data_nascimento = ?, cpf = ?, telefone = ?, email = ?, genero = ?,
           data_cadastro = ?, data_ultima_compra = ?, qtd_compras = ?, valor_total_compras = ?,
           qtd_compras_90 = ?, valor_total_compras_90 = ?, qtd_compras_30 = ?, valor_total_compras_30 = ?,
           qtd_compras_7 = ?, valor_total_compras_7 = ?, lavanderia = ?, acoes = ?
           WHERE id_cliente_vm = ? AND user_id = ?`,
          [
            cliente.nome,
            cliente.data_nascimento,
            cliente.cpf,
            cliente.telefone,
            cliente.email,
            cliente.genero,
            cliente.data_cadastro,
            cliente.data_ultima_compra,
            cliente.qtd_compras,
            cliente.valor_total_compras,
            cliente.qtd_compras_90,
            cliente.valor_total_compras_90,
            cliente.qtd_compras_30,
            cliente.valor_total_compras_30,
            cliente.qtd_compras_7,
            cliente.valor_total_compras_7,
            cliente.lavanderia,
            cliente.acoes ? JSON.stringify(cliente.acoes) : null,
            cliente.id_cliente_vm,
            cliente.user_id,
          ]
        ) as any;

        return await this.findById(existing.id) || existing;
      } else {
        // Inserir
        const queryResult = await conn.query(
          `INSERT INTO vm_lav_clientes 
           (user_id, id_cliente_vm, nome, data_nascimento, cpf, telefone, email, genero, 
            data_cadastro, data_ultima_compra, qtd_compras, valor_total_compras, 
            qtd_compras_90, valor_total_compras_90, qtd_compras_30, valor_total_compras_30, 
            qtd_compras_7, valor_total_compras_7, lavanderia, acoes) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            cliente.user_id,
            cliente.id_cliente_vm,
            cliente.nome,
            cliente.data_nascimento,
            cliente.cpf,
            cliente.telefone,
            cliente.email,
            cliente.genero,
            cliente.data_cadastro,
            cliente.data_ultima_compra,
            cliente.qtd_compras,
            cliente.valor_total_compras,
            cliente.qtd_compras_90,
            cliente.valor_total_compras_90,
            cliente.qtd_compras_30,
            cliente.valor_total_compras_30,
            cliente.qtd_compras_7,
            cliente.valor_total_compras_7,
            cliente.lavanderia,
            cliente.acoes ? JSON.stringify(cliente.acoes) : null,
          ]
        );

        // Extrair result de forma segura
        let result: any;
        if (Array.isArray(queryResult)) {
          result = queryResult[0] || queryResult;
        } else if (queryResult && typeof queryResult === 'object') {
          result = queryResult;
        } else {
          result = queryResult;
        }

        const insertId = result?.insertId || result?.insertid || (Array.isArray(result) && result[0]?.insertId);

        if (!insertId) {
          throw new Error('Não foi possível obter o ID do registro inserido');
        }

        const created = await this.findById(insertId);
        if (!created) {
          throw new Error('Erro ao criar cliente VM Lav');
        }
        return created;
      }
    } finally {
      conn.release();
    }
  }

  async bulkUpsert(clientes: Omit<VmLavCliente, 'id' | 'created_at' | 'updated_at'>[]): Promise<void> {
    if (clientes.length === 0) return;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const batchSize = 100;
      let novos = 0;
      let alterados = 0;

      for (let i = 0; i < clientes.length; i += batchSize) {
        const chunk = clientes.slice(i, i + batchSize);

        // UNIQUE KEY: user_id, id_cliente_vm
        const searchValues: any[] = [];
        const placeholders = chunk.map(c => {
          searchValues.push(c.id_cliente_vm, c.user_id);
          return '(?, ?)';
        }).join(',');

        const existingRows = await conn.query(
          `SELECT id, id_cliente_vm, user_id FROM vm_lav_clientes WHERE (id_cliente_vm, user_id) IN (${placeholders})`,
          searchValues
        ) as any[];

        const existingMap = new Map<string, number>();
        const rows = Array.isArray(existingRows) ? existingRows : [];
        const actualRows = (rows[0] && Array.isArray(rows[0]) ? rows[0] : rows);
        for (const row of actualRows) {
          existingMap.set(`${row.id_cliente_vm}_${row.user_id}`, row.id);
        }

        const toInsert: any[][] = [];
        const toUpdate: any[][] = [];

        for (const c of chunk) {
          const existingId = existingMap.get(`${c.id_cliente_vm}_${c.user_id}`);
          const values = [
            c.nome, c.data_nascimento, c.cpf, c.telefone, c.email, c.genero,
            c.data_cadastro, c.data_ultima_compra, c.qtd_compras, c.valor_total_compras,
            c.qtd_compras_90, c.valor_total_compras_90, c.qtd_compras_30, c.valor_total_compras_30,
            c.qtd_compras_7, c.valor_total_compras_7, c.lavanderia,
            c.acoes ? (typeof c.acoes === 'string' ? c.acoes : JSON.stringify(c.acoes)) : null
          ];

          if (existingId) {
            toUpdate.push([...values, c.id_cliente_vm, c.user_id]);
          } else {
            toInsert.push([c.user_id, c.id_cliente_vm, ...values]);
          }
        }

        if (toInsert.length > 0) {
          await conn.batch(
            `INSERT INTO vm_lav_clientes 
             (user_id, id_cliente_vm, nome, data_nascimento, cpf, telefone, email, genero, 
              data_cadastro, data_ultima_compra, qtd_compras, valor_total_compras, 
              qtd_compras_90, valor_total_compras_90, qtd_compras_30, valor_total_compras_30, 
              qtd_compras_7, valor_total_compras_7, lavanderia, acoes) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            toInsert
          );
          novos += toInsert.length;
        }

        if (toUpdate.length > 0) {
          await conn.batch(
            `UPDATE vm_lav_clientes SET 
             nome = ?, data_nascimento = ?, cpf = ?, telefone = ?, email = ?, genero = ?,
             data_cadastro = ?, data_ultima_compra = ?, qtd_compras = ?, valor_total_compras = ?,
             qtd_compras_90 = ?, valor_total_compras_90 = ?, qtd_compras_30 = ?, valor_total_compras_30 = ?,
             qtd_compras_7 = ?, valor_total_compras_7 = ?, lavanderia = ?, acoes = ?
             WHERE id_cliente_vm = ? AND user_id = ?`,
            toUpdate
          );
          alterados += toUpdate.length;
        }
      }

      await conn.commit();
      logger.info(`Bulk upsert clientes refatorado: ${novos} inseridos, ${alterados} atualizados. Total: ${clientes.length}`);
    } catch (error: any) {
      await conn.rollback();
      logger.error(`Erro ao fazer bulk upsert de clientes (refatorado): ${error.message}`);
      throw error;
    } finally {
      conn.release();
    }
  }

  async delete(id: number): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query(
        'DELETE FROM vm_lav_clientes WHERE id = ?',
        [id]
      ) as any;
      return result.affectedRows > 0;
    } finally {
      conn.release();
    }
  }

  private mapRowToCliente(row: any): VmLavCliente {
    let acoes: any = null;
    if (row.acoes) {
      try {
        acoes = typeof row.acoes === 'string' ? JSON.parse(row.acoes) : row.acoes;
      } catch (error) {
        logger.warn(`Erro ao parsear acoes do cliente ${row.id}: ${error}`);
      }
    }

    return {
      id: row.id,
      user_id: row.user_id,
      id_cliente_vm: row.id_cliente_vm,
      nome: row.nome,
      data_nascimento: row.data_nascimento,
      cpf: row.cpf,
      telefone: row.telefone,
      email: row.email,
      genero: row.genero,
      data_cadastro: row.data_cadastro,
      data_ultima_compra: row.data_ultima_compra,
      qtd_compras: row.qtd_compras || 0,
      valor_total_compras: parseFloat(row.valor_total_compras) || 0,
      qtd_compras_90: row.qtd_compras_90 || 0,
      valor_total_compras_90: parseFloat(row.valor_total_compras_90) || 0,
      qtd_compras_30: row.qtd_compras_30 || 0,
      valor_total_compras_30: parseFloat(row.valor_total_compras_30) || 0,
      qtd_compras_7: row.qtd_compras_7 || 0,
      valor_total_compras_7: parseFloat(row.valor_total_compras_7) || 0,
      lavanderia: row.lavanderia,
      acoes: acoes,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}

