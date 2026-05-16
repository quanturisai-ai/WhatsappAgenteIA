import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { FidelizacaoService } from '../services/fidelizacao.service';
import { PremioModel, TipoServico } from '../models/premio.model';
import { PremioClienteModel } from '../models/premioCliente.model';
import pool from '../config/database';
import logger from '../utils/logger';

const fidelizacaoService = new FidelizacaoService();
const premioModel = new PremioModel();
const premioClienteModel = new PremioClienteModel();

/**
 * Listar prêmios
 */
export const listarPremios = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;
    const { ativo } = req.query;

    const ativoFilter = ativo === 'false' ? false : ativo !== undefined ? true : undefined;
    const premios = await premioModel.findByUserId(userId, ativoFilter);

    res.json({ premios });
  } catch (error: any) {
    next(error);
  }
};

/**
 * Criar prêmio
 */
export const criarPremio = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;
    const { servico, objetivo, descricao, data_inicio_utilizacoes, data_fim_utilizacoes, tipo_atingimento, validade_dias, ativo } = req.body;

    if (!servico || !objetivo || !descricao || !data_inicio_utilizacoes) {
      const appError: AppError = new Error('Serviço, objetivo, descrição e data de início são obrigatórios');
      appError.statusCode = 400;
      throw appError;
    }

    if (!['SECAGEM', 'LAVAGEM', 'TOTAL'].includes(servico)) {
      const appError: AppError = new Error('Serviço deve ser SECAGEM, LAVAGEM ou TOTAL');
      appError.statusCode = 400;
      throw appError;
    }

    if (tipo_atingimento && !['UNICO', 'PERPETUO'].includes(tipo_atingimento)) {
      const appError: AppError = new Error('Tipo de atingimento deve ser UNICO ou PERPETUO');
      appError.statusCode = 400;
      throw appError;
    }

    // Validar e converter data_inicio_utilizacoes
    let dataInicio: Date;
    try {
      dataInicio = new Date(data_inicio_utilizacoes);
      if (isNaN(dataInicio.getTime())) {
        throw new Error('Data inválida');
      }
    } catch (error) {
      const appError: AppError = new Error('Data de início de utilizações inválida');
      appError.statusCode = 400;
      throw appError;
    }

    // Validar e converter data_fim_utilizacoes (opcional)
    let dataFim: Date | null = null;
    if (data_fim_utilizacoes) {
      try {
        dataFim = new Date(data_fim_utilizacoes);
        if (isNaN(dataFim.getTime())) {
          throw new Error('Data inválida');
        }
        // Validar que data_fim não seja antes de data_inicio
        if (dataFim < dataInicio) {
          const appError: AppError = new Error('Data de fim não pode ser anterior à data de início');
          appError.statusCode = 400;
          throw appError;
        }
      } catch (error: any) {
        if (error.statusCode) throw error;
        const appError: AppError = new Error('Data de fim de utilizações inválida');
        appError.statusCode = 400;
        throw appError;
      }
    }

    const premio = await premioModel.create({
      user_id: userId,
      servico: servico as TipoServico,
      objetivo: parseInt(String(objetivo), 10),
      descricao: String(descricao),
      data_inicio_utilizacoes: dataInicio,
      data_fim_utilizacoes: dataFim,
      tipo_atingimento: (tipo_atingimento || 'UNICO') as 'UNICO' | 'PERPETUO',
      validade_dias: validade_dias ? parseInt(String(validade_dias), 10) : null,
      ativo: ativo !== undefined ? Boolean(ativo) : true,
    });

    res.status(201).json({ premio });
  } catch (error: any) {
    next(error);
  }
};

/**
 * Atualizar prêmio
 */
export const atualizarPremio = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;
    const { id } = req.params;
    const { servico, objetivo, descricao, data_inicio_utilizacoes, data_fim_utilizacoes, tipo_atingimento, validade_dias, ativo } = req.body;

    const premio = await premioModel.findById(parseInt(id, 10));

    if (!premio || premio.user_id !== userId) {
      const appError: AppError = new Error('Prêmio não encontrado');
      appError.statusCode = 404;
      throw appError;
    }

    const updates: any = {};
    if (servico !== undefined) {
      if (!['SECAGEM', 'LAVAGEM', 'TOTAL'].includes(servico)) {
        const appError: AppError = new Error('Serviço deve ser SECAGEM, LAVAGEM ou TOTAL');
        appError.statusCode = 400;
        throw appError;
      }
      updates.servico = servico;
    }
    if (objetivo !== undefined) updates.objetivo = parseInt(String(objetivo), 10);
    if (descricao !== undefined) updates.descricao = String(descricao);
    if (data_inicio_utilizacoes !== undefined) {
      try {
        const dataInicio = new Date(data_inicio_utilizacoes);
        if (isNaN(dataInicio.getTime())) {
          const appError: AppError = new Error('Data de início de utilizações inválida');
          appError.statusCode = 400;
          throw appError;
        }
        updates.data_inicio_utilizacoes = dataInicio;
      } catch (error: any) {
        if (error.statusCode) throw error;
        const appError: AppError = new Error('Data de início de utilizações inválida');
        appError.statusCode = 400;
        throw appError;
      }
    }
    if (data_fim_utilizacoes !== undefined) {
      try {
        // Se for string vazia ou null, significa remover a data de fim
        if (data_fim_utilizacoes === '' || data_fim_utilizacoes === null) {
          updates.data_fim_utilizacoes = null;
        } else {
          const dataFim = new Date(data_fim_utilizacoes);
          if (isNaN(dataFim.getTime())) {
            const appError: AppError = new Error('Data de fim de utilizações inválida');
            appError.statusCode = 400;
            throw appError;
          }
          // Validar que data_fim não seja antes de data_inicio (usar a atualizada ou a existente)
          const dataInicioParaValidar = updates.data_inicio_utilizacoes || premio.data_inicio_utilizacoes;
          if (dataFim < dataInicioParaValidar) {
            const appError: AppError = new Error('Data de fim não pode ser anterior à data de início');
            appError.statusCode = 400;
            throw appError;
          }
          updates.data_fim_utilizacoes = dataFim;
        }
      } catch (error: any) {
        if (error.statusCode) throw error;
        const appError: AppError = new Error('Data de fim de utilizações inválida');
        appError.statusCode = 400;
        throw appError;
      }
    }
    if (tipo_atingimento !== undefined) {
      if (!['UNICO', 'PERPETUO'].includes(tipo_atingimento)) {
        const appError: AppError = new Error('Tipo de atingimento deve ser UNICO ou PERPETUO');
        appError.statusCode = 400;
        throw appError;
      }
      updates.tipo_atingimento = tipo_atingimento;
    }
    if (validade_dias !== undefined) {
      updates.validade_dias = validade_dias ? parseInt(String(validade_dias), 10) : null;
    }
    if (ativo !== undefined) updates.ativo = Boolean(ativo);

    const updated = await premioModel.update(premio.id, updates);

    res.json({ premio: updated });
  } catch (error: any) {
    next(error);
  }
};

/**
 * Deletar prêmio
 */
export const deletarPremio = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;
    const { id } = req.params;

    const premio = await premioModel.findById(parseInt(id, 10));

    if (!premio || premio.user_id !== userId) {
      const appError: AppError = new Error('Prêmio não encontrado');
      appError.statusCode = 404;
      throw appError;
    }

    await premioModel.delete(premio.id);

    res.json({ message: 'Prêmio deletado com sucesso' });
  } catch (error: any) {
    next(error);
  }
};

/**
 * Listar clientes com fidelidade
 */
export const listarClientesFidelidade = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;
    const { 
      page = '1', 
      limit = '50', 
      search,
      percentualMin,
      percentualMax,
      tipoServico
    } = req.query;

    const result = await fidelizacaoService.listarClientesFidelidade(
      userId,
      parseInt(String(page), 10),
      parseInt(String(limit), 10),
      search ? String(search) : undefined,
      percentualMin ? parseInt(String(percentualMin), 10) : undefined,
      percentualMax ? parseInt(String(percentualMax), 10) : undefined,
      tipoServico && ['LAVAGEM', 'SECAGEM', 'TOTAL'].includes(String(tipoServico))
        ? (String(tipoServico) as TipoServico)
        : undefined
    );

    res.json(result);
  } catch (error: any) {
    next(error);
  }
};

/**
 * Obter dados de fidelização de um cliente por CPF
 */
export const obterFidelizacaoPorCpf = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;
    const { cpf } = req.params;

    if (!cpf) {
      const appError: AppError = new Error('CPF é obrigatório');
      appError.statusCode = 400;
      throw appError;
    }

    const cliente = await fidelizacaoService.obterFidelizacaoPorCpf(userId, cpf);

    if (!cliente) {
      const appError: AppError = new Error('Cliente não encontrado ou sem dados de fidelização');
      appError.statusCode = 404;
      throw appError;
    }

    res.json({ cliente });
  } catch (error: any) {
    next(error);
  }
};

/**
 * Obter distribuição de clientes por percentual de cumprimento
 */
export const obterDistribuicaoPorPercentual = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;
    const { tipoServico } = req.query;

    const result = await fidelizacaoService.obterDistribuicaoPorPercentual(
      userId,
      tipoServico && ['LAVAGEM', 'SECAGEM', 'TOTAL'].includes(String(tipoServico))
        ? (String(tipoServico) as TipoServico)
        : undefined
    );

    res.json(result);
  } catch (error: any) {
    next(error);
  }
};

/**
 * Apurar e conceder prêmios para um cliente específico
 */
export const apurarPremiosCliente = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;
    const { cpf } = req.params;

    if (!cpf) {
      const appError: AppError = new Error('CPF é obrigatório');
      appError.statusCode = 400;
      throw appError;
    }

    const resultado = await fidelizacaoService.apurarEConcederPremios(userId, cpf);

    res.json({
      message: `${resultado.premiosConcedidos} prêmio(s) concedido(s)`,
      premiosConcedidos: resultado.premiosConcedidos,
      premios: resultado.premios,
    });
  } catch (error: any) {
    next(error);
  }
};

/**
 * Marcar prêmio como utilizado
 */
export const marcarPremioUtilizado = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;
    const { id } = req.params;
    const { observacao } = req.body;

    const premioCliente = await premioClienteModel.findById(parseInt(id, 10));

    if (!premioCliente || premioCliente.user_id !== userId) {
      const appError: AppError = new Error('Prêmio não encontrado');
      appError.statusCode = 404;
      throw appError;
    }

    if (premioCliente.utilizado) {
      const appError: AppError = new Error('Prêmio já foi utilizado');
      appError.statusCode = 400;
      throw appError;
    }

    const updated = await premioClienteModel.marcarComoUtilizado(
      premioCliente.id,
      new Date(),
      observacao
    );

    res.json({ premio: updated });
  } catch (error: any) {
    next(error);
  }
};

/**
 * Listar conquistas (prêmios concedidos)
 */
export const listarConquistas = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;
    const { page = '1', limit = '50', cpf, utilizado } = req.query;

    const conn = await pool.getConnection();
    try {
      const offset = (parseInt(String(page), 10) - 1) * parseInt(String(limit), 10);
      
      let whereClause = 'WHERE pc.user_id = ?';
      const params: any[] = [userId];

      if (cpf) {
        whereClause += ' AND pc.cpf_cliente = ?';
        params.push(String(cpf));
      }

      if (utilizado !== undefined) {
        whereClause += ' AND pc.utilizado = ?';
        params.push(utilizado === 'true' ? 1 : 0);
      }

      const queryResult = await conn.query(
        `SELECT pc.*, p.descricao as premio_descricao, p.servico as premio_servico
         FROM premios_clientes pc
         INNER JOIN premios p ON pc.premio_id = p.id
         ${whereClause}
         ORDER BY pc.data_conquista DESC
         LIMIT ? OFFSET ?`,
        [...params, parseInt(String(limit), 10), offset]
      ) as any;

      let rows: any[] = [];
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
        rows = Array.from(queryResult as any);
      }

      const totalQueryResult = await conn.query(
        `SELECT COUNT(*) as total 
         FROM premios_clientes pc
         ${whereClause}`,
        params
      ) as any;

      let totalRows: any[] = [];
      if (Array.isArray(totalQueryResult)) {
        totalRows = Array.isArray(totalQueryResult[0]) ? totalQueryResult[0] : totalQueryResult;
      } else if (totalQueryResult && typeof totalQueryResult === 'object' && 'length' in totalQueryResult) {
        totalRows = Array.from(totalQueryResult as any);
      }

      const total = totalRows && totalRows[0] ? totalRows[0].total : 0;

      res.json({
        conquistas: rows.map((row: any) => ({
          id: row.id,
          cpfCliente: row.cpf_cliente,
          premioId: row.premio_id,
          premioDescricao: row.premio_descricao,
          premioServico: row.premio_servico,
          dataConquista: row.data_conquista,
          dataValidade: row.data_validade,
          dataUtilizacao: row.data_utilizacao,
          utilizado: row.utilizado === 1 || row.utilizado === true,
          observacao: row.observacao,
          createdAt: row.created_at,
        })),
        total: Number(total) || 0,
      });
    } finally {
      conn.release();
    }
  } catch (error: any) {
    next(error);
  }
};

