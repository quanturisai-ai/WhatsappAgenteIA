import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { FidelizacaoService } from '../services/fidelizacao.service';
import { PremioModel, TipoServico } from '../models/premio.model';
import { PremioClienteModel } from '../models/premioCliente.model';
import { FidelizacaoNotificacaoModel } from '../models/fidelizacaoNotificacao.model';
import { FidelizacaoConfigModel } from '../models/fidelizacaoConfig.model';
import { VmLavClienteModel } from '../models/vmLavCliente.model';
import { WhatsAppManager } from '../services/whatsapp.manager';
import { FidelizacaoNotificacaoService } from '../services/fidelizacaoNotificacao.service';
import pool from '../config/database';

const fidelizacaoService = new FidelizacaoService();
const premioModel = new PremioModel();
const premioClienteModel = new PremioClienteModel();
const notificacaoModel = new FidelizacaoNotificacaoModel();
const configModel = new FidelizacaoConfigModel();
const clienteModel = new VmLavClienteModel();
const fidelizacaoNotificacaoService = new FidelizacaoNotificacaoService();

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
    const { servico, objetivo, descricao, data_inicio_utilizacoes, data_fim_utilizacoes, tipo_atingimento, validade_dias, valor_voucher, quantidade_utilizacoes, gerar_automatico, entrega_automatico, ativo } = req.body;

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
      valor_voucher: valor_voucher != null ? parseFloat(String(valor_voucher)) : null,
      quantidade_utilizacoes: quantidade_utilizacoes != null ? parseInt(String(quantidade_utilizacoes), 10) : null,
      gerar_automatico: gerar_automatico !== undefined ? Boolean(gerar_automatico) : false,
      entrega_automatico: entrega_automatico !== undefined ? Boolean(entrega_automatico) : false,
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
    const { servico, objetivo, descricao, data_inicio_utilizacoes, data_fim_utilizacoes, tipo_atingimento, validade_dias, valor_voucher, quantidade_utilizacoes, gerar_automatico, entrega_automatico, ativo } = req.body;

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
    if (valor_voucher !== undefined) {
      updates.valor_voucher = valor_voucher != null ? parseFloat(String(valor_voucher)) : null;
    }
    if (quantidade_utilizacoes !== undefined) {
      updates.quantidade_utilizacoes = quantidade_utilizacoes != null ? parseInt(String(quantidade_utilizacoes), 10) : null;
    }
    if (gerar_automatico !== undefined) updates.gerar_automatico = Boolean(gerar_automatico);
    if (entrega_automatico !== undefined) updates.entrega_automatico = Boolean(entrega_automatico);
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
        `SELECT pc.*, p.descricao as premio_descricao, p.servico as premio_servico,
         c.nome as cliente_nome, c.telefone as cliente_telefone
         FROM premios_clientes pc
         INNER JOIN premios p ON pc.premio_id = p.id
         LEFT JOIN vm_lav_clientes c ON pc.user_id = c.user_id AND pc.cpf_cliente = c.cpf
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
          nomeCliente: row.cliente_nome,
          telefoneCliente: row.cliente_telefone,
          premioId: row.premio_id,
          premioDescricao: row.premio_descricao,
          premioServico: row.premio_servico,
          dataConquista: row.data_conquista,
          dataValidade: row.data_validade,
          dataUtilizacao: row.data_utilizacao,
          utilizado: row.utilizado === 1 || row.utilizado === true,
          codigoVoucher: row.codigo_voucher,
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

/**
 * Obter pedidos detalhados de um cliente
 */
export const obterPedidosDetalhados = async (
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

    const resultado = await fidelizacaoService.obterPedidosDetalhados(userId, cpf);
    res.json(resultado);
  } catch (error: any) {
    next(error);
  }
};

/**
 * Registrar entrega de prêmio (salvar voucher e notificar)
 */
export const registrarEntregaPremio = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;
    const { id } = req.params;
    const { codigo_voucher, data_validade, mensagem } = req.body;

    const premioClienteId = parseInt(id, 10);
    const premioCliente = await premioClienteModel.findById(premioClienteId);

    if (!premioCliente || premioCliente.user_id !== userId) {
      const appError: AppError = new Error('Prêmio não encontrado');
      appError.statusCode = 404;
      throw appError;
    }

    // 1. Atualizar voucher e validade (se fornecidos)
    let validadeDate: Date | null = null;
    if (data_validade) {
      validadeDate = new Date(data_validade);
      if (isNaN(validadeDate.getTime())) {
        const appError: AppError = new Error('Data de validade inválida');
        appError.statusCode = 400;
        throw appError;
      }
    }

    await premioClienteModel.atualizarVoucher(premioClienteId, codigo_voucher || null, validadeDate);

    // 2. Enviar notificação via WhatsApp (se houver mensagem ou se solicitado)
    // Se 'mensagem' estiver presente no body, usamos ela. 
    // Caso contrário, o serviço usará o template padrão.
    await fidelizacaoNotificacaoService.enviarNotificacaoEntregaPremio(userId, premioClienteId, mensagem);
    await premioClienteModel.updateAutomacao(premioClienteId, { data_entrega: new Date() });

    res.json({ message: 'Entrega registrada e notificação enviada com sucesso' });
  } catch (error: any) {
    try {
      await fidelizacaoNotificacaoService.dispararConquistaAposFalhaEntrega(
        (req as AuthRequest).userId!,
        parseInt(String(req.params.id), 10)
      );
    } catch (_) {
      /* ignore */
    }
    next(error);
  }
};

/**
 * Gerar voucher via API VM para uma conquista
 */
export const gerarVoucherConquista = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;
    const { id } = req.params;
    const premioClienteId = parseInt(id, 10);

    const resultado = await fidelizacaoService.gerarVoucherParaConquista(premioClienteId, userId);

    if (!resultado.success) {
      try {
        const pc = await premioClienteModel.findById(premioClienteId);
        const premio = pc ? await premioModel.findById(pc.premio_id) : null;
        const config = await configModel.getOrCreateDefault(userId);
        if (
          pc &&
          premio &&
          config.notificar_conquistas &&
          (premio.entrega_automatico || premio.gerar_automatico)
        ) {
          await fidelizacaoNotificacaoService.enviarOuRetentarConquistaFallback(userId, pc, premio, config);
        }
      } catch (_) {
        /* ignore */
      }
      const appError: AppError = new Error(resultado.error || 'Erro ao gerar voucher');
      appError.statusCode = 400;
      throw appError;
    }

    res.json({
      message: 'Voucher gerado com sucesso',
      codigo_voucher: resultado.codigo_voucher,
      data_validade: resultado.data_validade?.toISOString(),
    });
  } catch (error: any) {
    next(error);
  }
};

/**
 * Listar notificações enviadas (para Config > Fidelização > Notificações)
 */
export const listarNotificacoes = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;
    const { search, page, limit } = req.query;
    const result = await notificacaoModel.listarComCliente(userId, {
      search: search ? String(search).trim() : undefined,
      page: page ? parseInt(String(page), 10) : undefined,
      limit: limit ? parseInt(String(limit), 10) : undefined,
    });
    res.json(result);
  } catch (error: any) {
    next(error);
  }
};

/**
 * Obter configuração de fidelização (para exibir simulacao e toggle)
 */
export const getConfigFidelizacao = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;
    const config = await configModel.getOrCreateDefault(userId);
    res.json({ config });
  } catch (error: any) {
    next(error);
  }
};

/**
 * Ativar ou desativar simulação de notificações
 */
export const atualizarSimulacao = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;
    let { simulacao } = req.body;
    // Aceitar boolean ou string "true"/"false"
    if (typeof simulacao === 'string') {
      simulacao = simulacao === 'true';
    }
    if (typeof simulacao !== 'boolean') {
      const appError: AppError = new Error('Campo simulacao deve ser true ou false');
      appError.statusCode = 400;
      throw appError;
    }
    const existing = await configModel.getOrCreateDefault(userId);
    const updated = await configModel.upsert({
      user_id: existing.user_id,
      notificar_conquistas: existing.notificar_conquistas,
      notificar_progresso: existing.notificar_progresso,
      frequencia_progresso: existing.frequencia_progresso,
      percentual_mudanca_minima: existing.percentual_mudanca_minima,
      template_mensagem_conquista: existing.template_mensagem_conquista,
      template_mensagem_entrega: existing.template_mensagem_entrega,
      template_mensagem_progresso: existing.template_mensagem_progresso,
      simulacao,
      simulacao_desativada_em: existing.simulacao_desativada_em,
    });
    res.json({ config: updated, message: simulacao ? 'Simulação ativada' : 'Simulação desativada' });
  } catch (error: any) {
    next(error);
  }
};

/**
 * Reenviar mensagem de uma notificação manualmente (WhatsApp).
 */
export const reenviarNotificacao = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authReq = req as AuthRequest;
  const userId = authReq.userId!;
  const id = parseInt(String(req.params.id), 10);
  try {
    if (isNaN(id)) {
      const appError: AppError = new Error('ID inválido');
      appError.statusCode = 400;
      throw appError;
    }
    const notificacao = await notificacaoModel.findById(id);
    if (!notificacao || notificacao.user_id !== userId) {
      const appError: AppError = new Error('Notificação não encontrada');
      appError.statusCode = 404;
      throw appError;
    }
    const cliente = await clienteModel.findByCpf(userId, notificacao.cpf_cliente);
    if (!cliente?.telefone) {
      const appError: AppError = new Error('Cliente não encontrado ou sem telefone');
      appError.statusCode = 400;
      throw appError;
    }
    const whatsappManager = WhatsAppManager.getInstance();
    const whatsappService = whatsappManager.getServiceSync(userId);
    if (!whatsappService?.isReady()) {
      const appError: AppError = new Error('WhatsApp não está pronto');
      appError.statusCode = 400;
      throw appError;
    }
    await whatsappService.sendMessage(cliente.telefone, notificacao.mensagem_enviada);
    await notificacaoModel.update(id, { enviado_whatsapp: true, erro: null });
    res.json({ success: true });
  } catch (error: any) {
    if (error.statusCode) {
      next(error);
      return;
    }
    try {
      await notificacaoModel.update(id, { erro: error?.message || 'Erro ao reenviar' });
    } catch (_) {}
    res.status(500).json({ success: false, error: error?.message || 'Erro ao reenviar' });
  }
};

