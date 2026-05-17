import pool from '../config/database';
import logger from '../utils/logger';
import { normalizeCpfToDigits, normalizeCpfColumnSql } from '../utils/cpfUtils';

export interface VmLavPedido {
  id: number;
  user_id: number;
  id_pedido_vm: number | null;

  // Dados da Lavanderia
  id_lavanderia: number | null;
  lavanderia_descricao: string | null;
  lavanderia_localizador: string | null;

  // Dados da Empresa
  id_empresa: number | null;
  empresa_nome: string | null;
  empresa_documento: string | null;

  // Dados da Venda
  data_venda: Date | null;
  situacao_venda: string | null;
  tipo_pagamento: string | null;
  valor: number;
  valor_sem_desconto: number;

  // Dados do Equipamento
  id_equipamento: number | null;
  equipamento_descricao: string | null;
  equipamento_numero_serie: string | null;
  equipamento_numero_etiqueta: string | null;
  pdv: string | null;

  // Dados da Máquina
  id_maquina: number | null;
  maquina_descricao: string | null;
  maquina_localizador: string | null;

  // Dados do Serviço
  tipo_servico: string | null;
  servico: string | null;

  // Dados do Cartão
  numero_cartao: string | null;
  bandeira_cartao: string | null;
  tipo_cartao: string | null;

  // Dados do Cliente
  cliente_cpf: string | null;
  cliente_nome: string | null;
  cliente_data_nascimento: Date | null;
  cliente_telefone: string | null;
  cliente_email: string | null;

  // Relacionamento
  cliente_id: number | null;
  pago_com_fidelidade: boolean;

  created_at: Date;
  updated_at: Date;
}

export class VmLavPedidoModel {
  async findById(id: number): Promise<VmLavPedido | null> {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT * FROM vm_lav_pedidos WHERE id = ?`,
        [id]
      ) as any;

      let rows: any[] = [];
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
        rows = Array.from(queryResult as any);
      }

      if (rows && rows.length > 0) {
        return this.mapRowToPedido(rows[0]);
      }
      return null;
    } finally {
      conn.release();
    }
  }

  async findByUserId(userId: number, page: number = 1, limit: number = 50): Promise<{ pedidos: VmLavPedido[]; total: number }> {
    const conn = await pool.getConnection();
    try {
      const offset = (page - 1) * limit;
      const queryResult = await conn.query(
        `SELECT * FROM vm_lav_pedidos 
         WHERE user_id = ?
         ORDER BY data_venda DESC, created_at DESC
         LIMIT ? OFFSET ?`,
        [userId, limit, offset]
      ) as any;

      let rows: any[] = [];
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
        rows = Array.from(queryResult as any);
      }

      const totalQueryResult = await conn.query(
        `SELECT COUNT(*) as total FROM vm_lav_pedidos WHERE user_id = ?`,
        [userId]
      ) as any;

      let totalRows: any[] = [];
      if (Array.isArray(totalQueryResult)) {
        totalRows = Array.isArray(totalQueryResult[0]) ? totalQueryResult[0] : totalQueryResult;
      } else if (totalQueryResult && typeof totalQueryResult === 'object' && 'length' in totalQueryResult) {
        totalRows = Array.from(totalQueryResult as any);
      }

      const total = totalRows && totalRows[0] ? totalRows[0].total : 0;

      return {
        pedidos: Array.isArray(rows) ? rows.map((row: any) => this.mapRowToPedido(row)) : [],
        total: Number(total) || 0,
      };
    } finally {
      conn.release();
    }
  }

  /**
   * Busca pedidos realizados após uma data específica (para sincronização incremental)
   */
  async findPedidosAfterDate(userId: number, date: Date | null): Promise<VmLavPedido[]> {
    const conn = await pool.getConnection();
    try {
      let query = `
        SELECT * FROM vm_lav_pedidos 
        WHERE user_id = ? 
          AND situacao_venda = 'Sucesso'
          AND cliente_cpf IS NOT NULL 
          AND cliente_cpf != ''
      `;
      const params: any[] = [userId];

      if (date) {
        query += ` AND data_venda > ?`;
        params.push(date);
      }

      // Ordenar por data crescente para processar na ordem correta
      query += ` ORDER BY data_venda ASC`;

      const queryResult = await conn.query(query, params) as any;

      let rows: any[] = [];
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
        rows = Array.from(queryResult as any);
      }

      return Array.isArray(rows) ? rows.map((row: any) => this.mapRowToPedido(row)) : [];
    } finally {
      conn.release();
    }
  }

  /**
   * Busca pedidos com situação 'Sucesso' para um CPF específico
   */
  async findPedidosComSucessoPorCpf(userId: number, cpf: string, page: number = 1, limit: number = 50): Promise<VmLavPedido[]> {
    const cpfNorm = normalizeCpfToDigits(cpf);
    if (!cpfNorm) return [];
    const conn = await pool.getConnection();
    try {
      const offset = (page - 1) * limit;
      const cpfCol = normalizeCpfColumnSql('cliente_cpf');
      const queryResult = await conn.query(
        `SELECT * FROM vm_lav_pedidos 
         WHERE user_id = ? AND ${cpfCol} = ? AND situacao_venda = 'Sucesso'
         ORDER BY data_venda DESC, created_at DESC
         LIMIT ? OFFSET ?`,
        [userId, cpfNorm, limit, offset]
      ) as any;

      let rows: any[] = [];
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      }
      return rows.map((row: any) => this.mapRowToPedido(row));
    } finally {
      conn.release();
    }
  }

  async bulkUpsert(pedidos: Omit<VmLavPedido, 'id' | 'created_at' | 'updated_at'>[]): Promise<void> {
    if (pedidos.length === 0) {
      return;
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Para evitar o salto do auto-incremento no InnoDB (ON DUPLICATE KEY reserva IDs para o lote todo),
      // vamos primeiro identificar os registros que já existem.

      const batchSize = 100; // Processar em pequenos lotes para evitar queries gigantescas
      let novos = 0;
      let alterados = 0;

      for (let i = 0; i < pedidos.length; i += batchSize) {
        const chunk = pedidos.slice(i, i + batchSize);

        // Critério da UNIQUE KEY: user_id, data_venda, id_maquina, cliente_cpf
        const cpfCol = normalizeCpfColumnSql('cliente_cpf');
        const searchValues: any[] = [];
        const placeholders = chunk.map(p => {
          searchValues.push(p.user_id, p.data_venda, p.id_maquina, normalizeCpfToDigits(p.cliente_cpf) ?? p.cliente_cpf);
          return '(?, ?, ?, ?)';
        }).join(',');

        const existingRows = await conn.query(
          `SELECT id, user_id, data_venda, id_maquina, cliente_cpf 
           FROM vm_lav_pedidos 
           WHERE (user_id, data_venda, id_maquina, ${cpfCol}) IN (${placeholders})`,
          searchValues
        ) as any[];

        const existingMap = new Map<string, number>();
        const rows = Array.isArray(existingRows) ? existingRows : [];
        for (const row of (rows[0] && Array.isArray(rows[0]) ? rows[0] : rows)) {
          const dateVal = row.data_venda instanceof Date ? row.data_venda : new Date(row.data_venda);
          const rowCpfNorm = normalizeCpfToDigits(row.cliente_cpf) ?? row.cliente_cpf;
          const key = `${row.user_id}_${dateVal.getTime()}_${row.id_maquina}_${rowCpfNorm}`;
          existingMap.set(key, row.id);
        }

        const toInsert: any[][] = [];
        const toUpdate: any[][] = [];

        for (const p of chunk) {
          const dateVal = p.data_venda instanceof Date ? p.data_venda : (p.data_venda ? new Date(p.data_venda) : new Date(0));
          const pCpfNorm = normalizeCpfToDigits(p.cliente_cpf) ?? p.cliente_cpf;
          const key = `${p.user_id}_${dateVal.getTime()}_${p.id_maquina}_${pCpfNorm}`;
          const existingId = existingMap.get(key);

          if (existingId) {
            toUpdate.push([
              p.id_pedido_vm, p.id_lavanderia, p.lavanderia_descricao, p.lavanderia_localizador,
              p.id_empresa, p.empresa_nome, p.empresa_documento, p.situacao_venda, p.tipo_pagamento, p.valor, p.valor_sem_desconto,
              p.id_equipamento, p.equipamento_descricao, p.equipamento_numero_serie, p.equipamento_numero_etiqueta, p.pdv,
              p.id_maquina, p.maquina_descricao, p.maquina_localizador, p.tipo_servico, p.servico,
              p.numero_cartao, p.bandeira_cartao, p.tipo_cartao,
              p.cliente_cpf, p.cliente_nome, p.cliente_data_nascimento, p.cliente_telefone, p.cliente_email, p.cliente_id,
              p.pago_com_fidelidade ? 1 : 0,
              existingId
            ]);
          } else {
            toInsert.push([
              p.user_id, p.id_pedido_vm, p.id_lavanderia, p.lavanderia_descricao, p.lavanderia_localizador,
              p.id_empresa, p.empresa_nome, p.empresa_documento, p.data_venda, p.situacao_venda, p.tipo_pagamento, p.valor, p.valor_sem_desconto,
              p.id_equipamento, p.equipamento_descricao, p.equipamento_numero_serie, p.equipamento_numero_etiqueta, p.pdv,
              p.id_maquina, p.maquina_descricao, p.maquina_localizador, p.tipo_servico, p.servico,
              p.numero_cartao, p.bandeira_cartao, p.tipo_cartao,
              p.cliente_cpf, p.cliente_nome, p.cliente_data_nascimento, p.cliente_telefone, p.cliente_email, p.cliente_id,
              p.pago_com_fidelidade ? 1 : 0
            ]);
          }
        }

        if (toInsert.length > 0) {
          await conn.batch(`
            INSERT INTO vm_lav_pedidos (
              user_id, id_pedido_vm, id_lavanderia, lavanderia_descricao, lavanderia_localizador,
              id_empresa, empresa_nome, empresa_documento, data_venda, situacao_venda, tipo_pagamento, valor, valor_sem_desconto,
              id_equipamento, equipamento_descricao, equipamento_numero_serie, equipamento_numero_etiqueta, pdv,
              id_maquina, maquina_descricao, maquina_localizador, tipo_servico, servico,
              numero_cartao, bandeira_cartao, tipo_cartao,
              cliente_cpf, cliente_nome, cliente_data_nascimento, cliente_telefone, cliente_email, cliente_id,
              pago_com_fidelidade
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, toInsert);
          novos += toInsert.length;
        }

        if (toUpdate.length > 0) {
          await conn.batch(`
            UPDATE vm_lav_pedidos SET 
              id_pedido_vm = ?, id_lavanderia = ?, lavanderia_descricao = ?, lavanderia_localizador = ?,
              id_empresa = ?, empresa_nome = ?, empresa_documento = ?, situacao_venda = ?, tipo_pagamento = ?, valor = ?, valor_sem_desconto = ?,
              id_equipamento = ?, equipamento_descricao = ?, equipamento_numero_serie = ?, equipamento_numero_etiqueta = ?, pdv = ?,
              id_maquina = ?, maquina_descricao = ?, maquina_localizador = ?, tipo_servico = ?, servico = ?,
              numero_cartao = ?, bandeira_cartao = ?, tipo_cartao = ?,
              cliente_cpf = ?, cliente_nome = ?, cliente_data_nascimento = ?, cliente_telefone = ?, cliente_email = ?, cliente_id = ?,
              pago_com_fidelidade = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `, toUpdate);
          alterados += toUpdate.length;
        }
      }

      await conn.commit();
      logger.info(`Bulk upsert refatorado: ${novos} inseridos, ${alterados} atualizados. Total: ${pedidos.length}`);
    } catch (error: any) {
      await conn.rollback();
      logger.error('Erro ao fazer bulk upsert de pedidos (refatorado): ' + String(error.message));
      throw error;
    } finally {
      conn.release();
    }
  }

  /**
   * Busca pedidos por chaves únicas (user_id, data_venda, cliente_cpf, valor)
   * Útil para obter IDs dos pedidos após bulkUpsert
   */
  async findByChavesUnicas(
    userId: number,
    dataVenda: Date | null,
    clienteCpf: string | null,
    valor: number
  ): Promise<VmLavPedido | null> {
    const cpfNorm = normalizeCpfToDigits(clienteCpf);
    if (!dataVenda || !cpfNorm) {
      return null;
    }

    const conn = await pool.getConnection();
    try {
      const cpfCol = normalizeCpfColumnSql('cliente_cpf');
      const queryResult = await conn.query(
        `SELECT * FROM vm_lav_pedidos 
         WHERE user_id = ? 
           AND data_venda = ? 
           AND ${cpfCol} = ? 
           AND valor = ?
         LIMIT 1`,
        [userId, dataVenda, cpfNorm, valor]
      ) as any;

      let rows: any[] = [];
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
        rows = Array.from(queryResult as any);
      }

      if (rows && rows.length > 0) {
        return this.mapRowToPedido(rows[0]);
      }
      return null;
    } finally {
      conn.release();
    }
  }

  async contarUtilizacoesPorCliente(userId: number, cpfs: string[]): Promise<Map<string, { lavagens: number; secagens: number; total: number }>> {
    const cpfsNorm = cpfs.map(c => normalizeCpfToDigits(c)).filter((c): c is string => c != null);
    if (cpfsNorm.length === 0) return new Map();

    const conn = await pool.getConnection();
    try {
      const cpfCol = normalizeCpfColumnSql('cliente_cpf');
      const placeholders = cpfsNorm.map(() => '?').join(',');
      const queryResult = await conn.query(
        `SELECT ${cpfCol} as cpf_norm, cliente_cpf,
                SUM(CASE WHEN tipo_servico = 'LAVAGEM' THEN 1 ELSE 0 END) as lavagens,
                SUM(CASE WHEN tipo_servico = 'SECAGEM' THEN 1 ELSE 0 END) as secagens,
                COUNT(*) as total
         FROM vm_lav_pedidos 
         WHERE user_id = ? AND ${cpfCol} IN (${placeholders}) AND situacao_venda = 'Sucesso' AND pago_com_fidelidade = 0
         GROUP BY ${cpfCol}, cliente_cpf`,
        [userId, ...cpfsNorm]
      ) as any;

      let rows: any[] = [];
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
        rows = Array.from(queryResult as any);
      }

      const map = new Map<string, { lavagens: number; secagens: number; total: number }>();
      for (const row of rows) {
        const key = row.cpf_norm || normalizeCpfToDigits(row.cliente_cpf) || row.cliente_cpf;
        map.set(key, {
          lavagens: Number(row.lavagens) || 0,
          secagens: Number(row.secagens) || 0,
          total: Number(row.total) || 0
        });
      }
      return map;
    } finally {
      conn.release();
    }
  }

  async contarUtilizacoesPorClienteAposData(userId: number, cpfs: string[], dataInicio: Date): Promise<Map<string, { lavagens: number; secagens: number; total: number }>> {
    const cpfsNorm = cpfs.map(c => normalizeCpfToDigits(c)).filter((c): c is string => c != null);
    if (cpfsNorm.length === 0) return new Map();

    const conn = await pool.getConnection();
    try {
      const cpfCol = normalizeCpfColumnSql('cliente_cpf');
      const placeholders = cpfsNorm.map(() => '?').join(',');
      const queryResult = await conn.query(
        `SELECT ${cpfCol} as cpf_norm, cliente_cpf,
                SUM(CASE WHEN tipo_servico = 'LAVAGEM' THEN 1 ELSE 0 END) as lavagens,
                SUM(CASE WHEN tipo_servico = 'SECAGEM' THEN 1 ELSE 0 END) as secagens,
                COUNT(*) as total
         FROM vm_lav_pedidos 
         WHERE user_id = ? AND ${cpfCol} IN (${placeholders}) AND data_venda >= ? AND situacao_venda = 'Sucesso' AND pago_com_fidelidade = 0
         GROUP BY ${cpfCol}, cliente_cpf`,
        [userId, ...cpfsNorm, dataInicio]
      ) as any;

      let rows: any[] = [];
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
        rows = Array.from(queryResult as any);
      }

      const map = new Map<string, { lavagens: number; secagens: number; total: number }>();
      for (const row of rows) {
        const key = row.cpf_norm || normalizeCpfToDigits(row.cliente_cpf) || row.cliente_cpf;
        map.set(key, {
          lavagens: Number(row.lavagens) || 0,
          secagens: Number(row.secagens) || 0,
          total: Number(row.total) || 0
        });
      }
      return map;
    } finally {
      conn.release();
    }
  }

  private mapRowToPedido(row: any): VmLavPedido {
    return {
      id: row.id,
      user_id: row.user_id,
      id_pedido_vm: row.id_pedido_vm,
      id_lavanderia: row.id_lavanderia,
      lavanderia_descricao: row.lavanderia_descricao,
      lavanderia_localizador: row.lavanderia_localizador,
      id_empresa: row.id_empresa,
      empresa_nome: row.empresa_nome,
      empresa_documento: row.empresa_documento,
      data_venda: row.data_venda,
      situacao_venda: row.situacao_venda,
      tipo_pagamento: row.tipo_pagamento,
      valor: parseFloat(row.valor) || 0,
      valor_sem_desconto: parseFloat(row.valor_sem_desconto) || 0,
      id_equipamento: row.id_equipamento,
      equipamento_descricao: row.equipamento_descricao,
      equipamento_numero_serie: row.equipamento_numero_serie,
      equipamento_numero_etiqueta: row.equipamento_numero_etiqueta,
      pdv: row.pdv,
      id_maquina: row.id_maquina,
      maquina_descricao: row.maquina_descricao,
      maquina_localizador: row.maquina_localizador,
      tipo_servico: row.tipo_servico,
      servico: row.servico,
      numero_cartao: row.numero_cartao,
      bandeira_cartao: row.bandeira_cartao,
      tipo_cartao: row.tipo_cartao,
      cliente_cpf: row.cliente_cpf,
      cliente_nome: row.cliente_nome,
      cliente_data_nascimento: row.cliente_data_nascimento,
      cliente_telefone: row.cliente_telefone,
      cliente_email: row.cliente_email,
      cliente_id: row.cliente_id,
      pago_com_fidelidade: row.pago_com_fidelidade === 1 || row.pago_com_fidelidade === true,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}

