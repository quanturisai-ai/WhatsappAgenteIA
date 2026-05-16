import pool from '../config/database';
import logger from '../utils/logger';

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

  async bulkUpsert(pedidos: Omit<VmLavPedido, 'id' | 'created_at' | 'updated_at'>[]): Promise<void> {
    if (pedidos.length === 0) {
      return;
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      for (const pedido of pedidos) {
        // Tentar encontrar pedido existente por data_venda, cliente_cpf e valor (para evitar duplicatas)
        const existingQuery = await conn.query(
          `SELECT id FROM vm_lav_pedidos 
           WHERE user_id = ? 
           AND data_venda = ? 
           AND cliente_cpf = ? 
           AND valor = ?
           LIMIT 1`,
          [pedido.user_id, pedido.data_venda, pedido.cliente_cpf, pedido.valor]
        ) as any;

        let existingRows: any[] = [];
        if (Array.isArray(existingQuery)) {
          existingRows = Array.isArray(existingQuery[0]) ? existingQuery[0] : existingQuery;
        } else if (existingQuery && typeof existingQuery === 'object' && 'length' in existingQuery) {
          existingRows = Array.from(existingQuery as any);
        }

        if (existingRows && existingRows.length > 0) {
          // Atualizar pedido existente
          await conn.query(
            `UPDATE vm_lav_pedidos SET
             id_lavanderia = ?, lavanderia_descricao = ?, lavanderia_localizador = ?,
             id_empresa = ?, empresa_nome = ?, empresa_documento = ?,
             situacao_venda = ?, tipo_pagamento = ?, valor = ?, valor_sem_desconto = ?,
             id_equipamento = ?, equipamento_descricao = ?, equipamento_numero_serie = ?, equipamento_numero_etiqueta = ?, pdv = ?,
             id_maquina = ?, maquina_descricao = ?, maquina_localizador = ?,
             tipo_servico = ?, servico = ?,
             numero_cartao = ?, bandeira_cartao = ?, tipo_cartao = ?,
             cliente_cpf = ?, cliente_nome = ?, cliente_data_nascimento = ?, cliente_telefone = ?, cliente_email = ?,
             cliente_id = ?
             WHERE id = ?`,
            [
              pedido.id_lavanderia,
              pedido.lavanderia_descricao,
              pedido.lavanderia_localizador,
              pedido.id_empresa,
              pedido.empresa_nome,
              pedido.empresa_documento,
              pedido.situacao_venda,
              pedido.tipo_pagamento,
              pedido.valor,
              pedido.valor_sem_desconto,
              pedido.id_equipamento,
              pedido.equipamento_descricao,
              pedido.equipamento_numero_serie,
              pedido.equipamento_numero_etiqueta,
              pedido.pdv,
              pedido.id_maquina,
              pedido.maquina_descricao,
              pedido.maquina_localizador,
              pedido.tipo_servico,
              pedido.servico,
              pedido.numero_cartao,
              pedido.bandeira_cartao,
              pedido.tipo_cartao,
              pedido.cliente_cpf,
              pedido.cliente_nome,
              pedido.cliente_data_nascimento,
              pedido.cliente_telefone,
              pedido.cliente_email,
              pedido.cliente_id,
              existingRows[0].id,
            ]
          );
        } else {
          // Inserir novo pedido
          await conn.query(
            `INSERT INTO vm_lav_pedidos 
             (user_id, id_pedido_vm, id_lavanderia, lavanderia_descricao, lavanderia_localizador,
              id_empresa, empresa_nome, empresa_documento, data_venda, situacao_venda, tipo_pagamento, valor, valor_sem_desconto,
              id_equipamento, equipamento_descricao, equipamento_numero_serie, equipamento_numero_etiqueta, pdv,
              id_maquina, maquina_descricao, maquina_localizador, tipo_servico, servico,
              numero_cartao, bandeira_cartao, tipo_cartao,
              cliente_cpf, cliente_nome, cliente_data_nascimento, cliente_telefone, cliente_email, cliente_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              pedido.user_id,
              pedido.id_pedido_vm,
              pedido.id_lavanderia,
              pedido.lavanderia_descricao,
              pedido.lavanderia_localizador,
              pedido.id_empresa,
              pedido.empresa_nome,
              pedido.empresa_documento,
              pedido.data_venda,
              pedido.situacao_venda,
              pedido.tipo_pagamento,
              pedido.valor,
              pedido.valor_sem_desconto,
              pedido.id_equipamento,
              pedido.equipamento_descricao,
              pedido.equipamento_numero_serie,
              pedido.equipamento_numero_etiqueta,
              pedido.pdv,
              pedido.id_maquina,
              pedido.maquina_descricao,
              pedido.maquina_localizador,
              pedido.tipo_servico,
              pedido.servico,
              pedido.numero_cartao,
              pedido.bandeira_cartao,
              pedido.tipo_cartao,
              pedido.cliente_cpf,
              pedido.cliente_nome,
              pedido.cliente_data_nascimento,
              pedido.cliente_telefone,
              pedido.cliente_email,
              pedido.cliente_id,
            ]
          );
        }
      }

      await conn.commit();
      logger.info(`Bulk upsert concluído: ${pedidos.length} pedidos processados`);
    } catch (error: any) {
      await conn.rollback();
      logger.error('Erro ao fazer bulk upsert de pedidos: ' + String(error.message));
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
    if (!dataVenda || !clienteCpf) {
      return null;
    }

    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT * FROM vm_lav_pedidos 
         WHERE user_id = ? 
           AND data_venda = ? 
           AND cliente_cpf = ? 
           AND valor = ?
         LIMIT 1`,
        [userId, dataVenda, clienteCpf, valor]
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
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}

