import pool from '../config/database';
import logger from '../utils/logger';

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
    try {
      const offset = (page - 1) * limit;
      const searchPattern = `%${searchTerm}%`;

      // Mapear campos de ordenação para colunas válidas
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
      
      const orderByField = orderBy && orderByMap[orderBy] ? orderByMap[orderBy] : 'c.nome';
      const orderDirection = orderDir === 'DESC' ? 'DESC' : 'ASC';

      // Query com JOIN para calcular lavagens e secagens
      const query = `
        SELECT 
          c.id, c.user_id, c.id_cliente_vm, c.nome, c.data_nascimento, c.cpf, c.telefone, c.email, 
          c.genero, c.data_cadastro, c.data_ultima_compra, c.qtd_compras, c.valor_total_compras, 
          c.qtd_compras_90, c.valor_total_compras_90, c.qtd_compras_30, c.valor_total_compras_30, 
          c.qtd_compras_7, c.valor_total_compras_7, c.lavanderia, c.acoes, c.created_at, c.updated_at,
          COALESCE(SUM(CASE WHEN p.tipo_servico = 'LAVAGEM' THEN 1 ELSE 0 END), 0) as total_lavagens,
          COALESCE(SUM(CASE WHEN p.tipo_servico = 'SECAGEM' THEN 1 ELSE 0 END), 0) as total_secagens
        FROM vm_lav_clientes c
        LEFT JOIN vm_lav_pedidos p ON p.cliente_id = c.id AND p.user_id = c.user_id
        WHERE c.user_id = ? AND (
          c.nome LIKE ? 
          OR c.email LIKE ?
          OR c.telefone LIKE ?
          OR c.cpf LIKE ?
          OR DATE_FORMAT(c.data_cadastro, '%d/%m/%Y') LIKE ?
          OR CAST(c.qtd_compras AS CHAR) LIKE ?
        )
        GROUP BY c.id
        ORDER BY ${orderByField} ${orderDirection}
        LIMIT ? OFFSET ?
      `;
      
      const params = [userId, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, limit, offset];

      logger.debug('Executando query de busca de clientes:');
      logger.debug('Query: ' + query);
      logger.debug('Params: ' + JSON.stringify(params));
      
      let queryResult: any;
      try {
        queryResult = await conn.query(query, params);
      } catch (queryError: any) {
        // Log detalhado no logger
        logger.error('❌ ERRO SQL na busca de clientes:');
        logger.error('Mensagem: ' + String(queryError.message || 'N/A'));
        logger.error('Código: ' + String(queryError.code || 'N/A'));
        logger.error('SQL State: ' + String(queryError.sqlState || 'N/A'));
        logger.error('Query executada: ' + query);
        logger.error('Parâmetros: ' + JSON.stringify(params));
        logger.error('Stack: ' + String(queryError.stack || 'N/A'));
        
        // Também logar no console para garantir visibilidade
        console.error('═══════════════════════════════════════════════════════════');
        console.error('❌ ERRO SQL na busca de clientes:');
        console.error('Mensagem:', queryError.message || 'N/A');
        console.error('Código:', queryError.code || 'N/A');
        console.error('SQL State:', queryError.sqlState || 'N/A');
        console.error('SQL Message:', queryError.sqlMessage || 'N/A');
        console.error('Query executada:', query);
        console.error('Parâmetros:', JSON.stringify(params, null, 2));
        console.error('Stack:', queryError.stack || 'N/A');
        console.error('Erro completo:', JSON.stringify(queryError, Object.getOwnPropertyNames(queryError), 2));
        console.error('═══════════════════════════════════════════════════════════');
        
        throw queryError;
      }

      // Extrair rows de forma segura
      let rows: any[] = [];
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
        rows = Array.from(queryResult as any);
      }

      // Query de contagem total usando mesma lógica (sem GROUP BY)
      const totalQuery = `
        SELECT COUNT(DISTINCT c.id) as total 
        FROM vm_lav_clientes c
        WHERE c.user_id = ? AND (
          c.nome LIKE ? 
          OR c.email LIKE ?
          OR c.telefone LIKE ?
          OR c.cpf LIKE ?
          OR DATE_FORMAT(c.data_cadastro, '%d/%m/%Y') LIKE ?
          OR CAST(c.qtd_compras AS CHAR) LIKE ?
        )
      `;
      
      const totalParams = [userId, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern];

      logger.debug('Executando query de contagem total:');
      logger.debug('Query: ' + totalQuery);
      logger.debug('Params: ' + JSON.stringify(totalParams));
      
      let totalQueryResult: any;
      try {
        totalQueryResult = await conn.query(totalQuery, totalParams);
      } catch (queryError: any) {
        // Log detalhado no logger
        logger.error('❌ ERRO SQL na contagem total de clientes:');
        logger.error('Mensagem: ' + String(queryError.message || 'N/A'));
        logger.error('Código: ' + String(queryError.code || 'N/A'));
        logger.error('SQL State: ' + String(queryError.sqlState || 'N/A'));
        logger.error('Query executada: ' + totalQuery);
        logger.error('Parâmetros: ' + JSON.stringify(totalParams));
        logger.error('Stack: ' + String(queryError.stack || 'N/A'));
        
        // Também logar no console para garantir visibilidade
        console.error('═══════════════════════════════════════════════════════════');
        console.error('❌ ERRO SQL na contagem total de clientes:');
        console.error('Mensagem:', queryError.message || 'N/A');
        console.error('Código:', queryError.code || 'N/A');
        console.error('SQL State:', queryError.sqlState || 'N/A');
        console.error('SQL Message:', queryError.sqlMessage || 'N/A');
        console.error('Query executada:', totalQuery);
        console.error('Parâmetros:', JSON.stringify(totalParams, null, 2));
        console.error('Stack:', queryError.stack || 'N/A');
        console.error('Erro completo:', JSON.stringify(queryError, Object.getOwnPropertyNames(queryError), 2));
        console.error('═══════════════════════════════════════════════════════════');
        
        throw queryError;
      }

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
    } catch (error: any) {
      // Log detalhado do erro
      logger.error('═══════════════════════════════════════════════════════════');
      logger.error('❌ ERRO COMPLETO ao buscar clientes por termo');
      logger.error('═══════════════════════════════════════════════════════════');
      logger.error('Mensagem: ' + String(error.message || 'N/A'));
      logger.error('Código: ' + String(error.code || 'N/A'));
      logger.error('SQL State: ' + String(error.sqlState || 'N/A'));
      logger.error('SQL Message: ' + String(error.sqlMessage || 'N/A'));
      logger.error('Stack: ' + String(error.stack || 'N/A'));
      logger.error('Erro completo (JSON): ' + JSON.stringify(error, Object.getOwnPropertyNames(error)));
      logger.error('═══════════════════════════════════════════════════════════');
      
      // Se o erro for relacionado a funções SQL não encontradas, tentar busca simples
      if (error.message && (error.message.includes('normaliza_numeros') || error.message.includes('normaliza_telefone') || error.message.includes('does not exist') || error.message.includes('FUNCTION'))) {
        logger.warn('Tentando busca simples como fallback...');
        try {
          const searchPattern = `%${searchTerm}%`;
          const orderByField = orderBy && orderByMap[orderBy] ? orderByMap[orderBy] : 'c.nome';
          const orderDirection = orderDir === 'DESC' ? 'DESC' : 'ASC';
          
          const fallbackQuery = `
            SELECT 
              c.id, c.user_id, c.id_cliente_vm, c.nome, c.data_nascimento, c.cpf, c.telefone, c.email, 
              c.genero, c.data_cadastro, c.data_ultima_compra, c.qtd_compras, c.valor_total_compras, 
              c.qtd_compras_90, c.valor_total_compras_90, c.qtd_compras_30, c.valor_total_compras_30, 
              c.qtd_compras_7, c.valor_total_compras_7, c.lavanderia, c.acoes, c.created_at, c.updated_at,
              COALESCE(SUM(CASE WHEN p.tipo_servico = 'LAVAGEM' THEN 1 ELSE 0 END), 0) as total_lavagens,
              COALESCE(SUM(CASE WHEN p.tipo_servico = 'SECAGEM' THEN 1 ELSE 0 END), 0) as total_secagens
            FROM vm_lav_clientes c
            LEFT JOIN vm_lav_pedidos p ON p.cliente_id = c.id AND p.user_id = c.user_id
            WHERE c.user_id = ? AND (
              c.nome LIKE ? 
              OR c.email LIKE ?
              OR c.cpf LIKE ?
              OR c.telefone LIKE ?
            )
            GROUP BY c.id
            ORDER BY ${orderByField} ${orderDirection}
            LIMIT ? OFFSET ?
          `;
          const offset = (page - 1) * limit;
          const fallbackResult = await conn.query(fallbackQuery, [userId, searchPattern, searchPattern, searchPattern, searchPattern, limit, offset]);
          
          let fallbackRows: any[] = [];
          if (Array.isArray(fallbackResult)) {
            fallbackRows = Array.isArray(fallbackResult[0]) ? fallbackResult[0] : fallbackResult;
          } else if (fallbackResult && typeof fallbackResult === 'object' && 'length' in fallbackResult) {
            fallbackRows = Array.from(fallbackResult as any);
          }
          
          return {
            clientes: Array.isArray(fallbackRows) ? fallbackRows.map((row: any) => ({
              ...this.mapRowToCliente(row),
              total_lavagens: Number(row.total_lavagens) || 0,
              total_secagens: Number(row.total_secagens) || 0,
            })) : [],
            total: Array.isArray(fallbackRows) ? fallbackRows.length : 0,
          };
        } catch (fallbackError: any) {
          logger.error('Erro também no fallback: ' + String(fallbackError.message));
          throw fallbackError;
        }
      }
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
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      for (const cliente of clientes) {
        await this.upsert(cliente);
      }

      await conn.commit();
      logger.info(`✅ ${clientes.length} clientes sincronizados com sucesso`);
    } catch (error: any) {
      await conn.rollback();
      logger.error(`Erro ao fazer bulk upsert de clientes: ${error.message}`);
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

