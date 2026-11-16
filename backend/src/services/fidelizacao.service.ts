import pool from '../config/database';
import logger from '../utils/logger';
import { PremioModel, TipoServico } from '../models/premio.model';
import { PremioClienteModel, PremioCliente } from '../models/premioCliente.model';
import { VmLavClienteModel } from '../models/vmLavCliente.model';
import { VmLavPedidoModel } from '../models/vmLavPedido.model';
import { VmLavService } from './vmLav.service';
import { normalizeCpfToDigits, normalizeCpfColumnSql } from '../utils/cpfUtils';

export interface SaldoFidelidade {
  atual: number;
  proximoObjetivo: number | null;
  faltam: number;
  proximoPremio: string | null;
  conquistas: number;
  meta?: number; // Adicionado para facilitar cálculos
}

export interface ClienteFidelidade {
  cpf: string;
  nome: string;
  telefone: string | null;
  dataCadastro: Date | null;
  dataInicioUtilizacoes: Date | null;

  // Contadores
  totalLavagens: number;
  totalSecagens: number;
  totalUtilizacoes: number;

  // Saldo fidelidade
  saldoFidelidadeLavagens: SaldoFidelidade;
  saldoFidelidadeSecagens: SaldoFidelidade;
  saldoFidelidadeTotal: SaldoFidelidade;

  // Prêmios
  premiosConquistados: number;
  premiosUtilizados: number;
  listaPremios: Array<{
    id: number;
    descricao: string;
    dataConquista: Date;
    dataValidade: Date | null;
    utilizado: boolean;
  }>;
}

export class FidelizacaoService {
  private premioModel: PremioModel;
  private premioClienteModel: PremioClienteModel;
  private clienteModel: VmLavClienteModel;
  private vmLavPedidoModel: VmLavPedidoModel;
  private vmLavService: VmLavService;

  constructor() {
    this.premioModel = new PremioModel();
    this.premioClienteModel = new PremioClienteModel();
    this.clienteModel = new VmLavClienteModel();
    this.vmLavPedidoModel = new VmLavPedidoModel();
    this.vmLavService = new VmLavService();
  }

  /**
   * Conta utilizações de um cliente em um intervalo de datas
   * @param dataInicio Data de início do intervalo (inclusiva)
   * @param dataFim Data de fim do intervalo (inclusiva, opcional - se null, conta até hoje)
   */
  async contarUtilizacoes(userId: number, cpf: string, dataInicio: Date, dataFim?: Date | null): Promise<{
    lavagens: number;
    secagens: number;
    total: number;
  }> {
    const conn = await pool.getConnection();
    try {
      // Verificar se cliente existe (comparação por CPF normalizado)
      const clientes = await this.clienteModel.findByUserId(userId, 1, 10000);
      const cpfNorm = normalizeCpfToDigits(cpf);
      const cliente = clientes.clientes.find(c => normalizeCpfToDigits(c.cpf) === cpfNorm);

      if (!cliente) {
        return { lavagens: 0, secagens: 0, total: 0 };
      }

      if (!dataInicio) {
        logger.warn(`Data de início não fornecida para cliente ${cpf}`);
        return { lavagens: 0, secagens: 0, total: 0 };
      }

      if (!cpfNorm) {
        return { lavagens: 0, secagens: 0, total: 0 };
      }

      // Construir query com filtro de intervalo (CPF normalizado para comparar com/sem separadores)
      // Desconsiderar pedidos pagos com fidelidade (pago_com_fidelidade = 1)
      const cpfCol = normalizeCpfColumnSql('cliente_cpf');
      let query = `SELECT tipo_servico, COUNT(*) as count 
                   FROM vm_lav_pedidos 
                   WHERE user_id = ? 
                   AND ${cpfCol} = ? 
                   AND situacao_venda = 'Sucesso'
                   AND pago_com_fidelidade = 0
                   AND data_venda >= ?`;
      const params: any[] = [userId, cpfNorm, dataInicio];

      // Se dataFim fornecida, adicionar filtro de data máxima
      if (dataFim) {
        // Adicionar 1 dia e usar < para incluir o dia inteiro de dataFim
        const dataFimLimite = new Date(dataFim);
        dataFimLimite.setDate(dataFimLimite.getDate() + 1);
        query += ' AND data_venda < ?';
        params.push(dataFimLimite);
      }

      query += ' GROUP BY tipo_servico';

      const queryResult = await conn.query(query, params) as any;

      let rows: any[] = [];
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
        rows = Array.from(queryResult as any);
      }

      let lavagens = 0;
      let secagens = 0;

      for (const row of rows) {
        const tipo = String(row.tipo_servico || '').trim().toUpperCase();
        const count = Number(row.count || 0);

        if (tipo === 'LAVAGEM' || tipo.includes('LAVAGEM')) {
          lavagens = count;
        } else if (tipo === 'SECAGEM' || tipo.includes('SECAGEM')) {
          secagens = count;
        }
      }

      const total = lavagens + secagens;

      return { lavagens, secagens, total };
    } finally {
      conn.release();
    }
  }

  /**
   * Conta quantas vezes prêmios de um tipo de serviço foram conquistados por um cliente
   */
  private async contarConquistasPorServico(userId: number, cpf: string, servico: TipoServico): Promise<number> {
    const premios = await this.premioModel.findByUserId(userId, true);
    const premiosFiltrados = premios.filter(p => p.servico === servico);

    let totalConquistas = 0;
    for (const premio of premiosFiltrados) {
      const conquistas = await this.premioClienteModel.contarConquistas(userId, cpf, premio.id);
      totalConquistas += conquistas;
    }

    return totalConquistas;
  }

  /**
   * Calcula saldo de fidelidade para um tipo de serviço
   * Retorna o saldo baseado no prêmio mais próximo que ainda não foi conquistado (ou próximo ciclo para PERPÉTUO)
   * IMPORTANTE: Cada prêmio usa sua própria data_inicio_utilizacoes para contar utilizações
   * Para prêmios PERPÉTUOS, conta desde a última conquista (ou desde data_inicio_utilizacoes se nunca conquistou)
   */
  async calcularSaldoFidelidade(
    userId: number,
    cpf: string,
    servico: TipoServico,
    _dataBase: Date
  ): Promise<SaldoFidelidade> {
    // Contar conquistas deste tipo de serviço
    const conquistas = await this.contarConquistasPorServico(userId, cpf, servico);

    // Buscar prêmios ativos ordenados por objetivo
    const premios = await this.premioModel.findByUserId(userId, true);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const premiosFiltrados = premios
      .filter(p => {
        // Verificar se é do tipo de serviço correto
        if (p.servico !== servico) return false;

        // Verificar se está dentro do período de vigência
        const dataInicio = new Date(p.data_inicio_utilizacoes);
        dataInicio.setHours(0, 0, 0, 0);

        if (dataInicio > hoje) return false; // Ainda não começou

        if (p.data_fim_utilizacoes) {
          const dataFim = new Date(p.data_fim_utilizacoes);
          dataFim.setHours(23, 59, 59, 999);
          if (dataFim < hoje) return false; // Já terminou
        }

        return true;
      })
      .sort((a, b) => a.objetivo - b.objetivo);

    if (premiosFiltrados.length === 0) {
      return {
        atual: 0,
        proximoObjetivo: null,
        faltam: 0,
        proximoPremio: null,
        conquistas,
      };
    }

    // Encontrar próximo prêmio a ser conquistado
    for (const premio of premiosFiltrados) {
      const jaConquistado = await this.premioClienteModel.verificarSeJaConquistado(userId, cpf, premio.id);

      // Para prêmios ÚNICOS, se já foi conquistado, pular para o próximo
      if (premio.tipo_atingimento === 'UNICO' && jaConquistado) {
        continue; // Já foi conquistado, verificar próximo
      }

      // Para todos os prêmios, contar desde data_inicio_utilizacoes (respeitando intervalo de vigência)
      const dataInicioContagem = premio.data_inicio_utilizacoes;

      // Contar todas as utilizações no intervalo de vigência
      const utilizacoes = await this.contarUtilizacoes(userId, cpf, dataInicioContagem, premio.data_fim_utilizacoes);

      let quantidadeAtual = 0;
      if (servico === 'LAVAGEM') {
        quantidadeAtual = utilizacoes.lavagens;
      } else if (servico === 'SECAGEM') {
        quantidadeAtual = utilizacoes.secagens;
      } else if (servico === 'TOTAL') {
        quantidadeAtual = utilizacoes.total;
      }

      // Para prêmios PERPÉTUOS, subtrair as utilizações já usadas em conquistas anteriores
      if (premio.tipo_atingimento === 'PERPETUO') {
        const quantidadeConquistas = await this.premioClienteModel.contarConquistas(userId, cpf, premio.id);
        const utilizacoesJaUsadas = quantidadeConquistas * premio.objetivo;
        quantidadeAtual = Math.max(0, quantidadeAtual - utilizacoesJaUsadas);
      }

      if (quantidadeAtual >= premio.objetivo) {
        // Este prêmio deveria ter sido concedido, mas não foi
        // Retornar este como próximo (será concedido automaticamente)
        return {
          atual: quantidadeAtual,
          proximoObjetivo: premio.objetivo,
          faltam: 0,
          proximoPremio: premio.descricao,
          conquistas,
        };
      }

      // Este é o próximo prêmio a ser conquistado
      return {
        atual: quantidadeAtual,
        proximoObjetivo: premio.objetivo,
        faltam: premio.objetivo - quantidadeAtual,
        proximoPremio: premio.descricao,
        conquistas,
      };
    }

    // Todos os prêmios ÚNICOS foram conquistados
    // Para PERPÉTUOS, mostrar o progresso do último prêmio
    const ultimoPremio = premiosFiltrados[premiosFiltrados.length - 1];
    const dataInicioContagem = ultimoPremio.data_inicio_utilizacoes;

    const utilizacoes = await this.contarUtilizacoes(userId, cpf, dataInicioContagem, ultimoPremio.data_fim_utilizacoes);

    let quantidadeAtual = 0;
    if (servico === 'LAVAGEM') {
      quantidadeAtual = utilizacoes.lavagens;
    } else if (servico === 'SECAGEM') {
      quantidadeAtual = utilizacoes.secagens;
    } else if (servico === 'TOTAL') {
      quantidadeAtual = utilizacoes.total;
    }

    // Para prêmios PERPÉTUOS, subtrair as utilizações já usadas em conquistas anteriores
    if (ultimoPremio.tipo_atingimento === 'PERPETUO') {
      const quantidadeConquistas = await this.premioClienteModel.contarConquistas(userId, cpf, ultimoPremio.id);
      const utilizacoesJaUsadas = quantidadeConquistas * ultimoPremio.objetivo;
      quantidadeAtual = Math.max(0, quantidadeAtual - utilizacoesJaUsadas);
    }

    return {
      atual: quantidadeAtual,
      proximoObjetivo: null,
      faltam: 0,
      proximoPremio: null,
      conquistas,
    };
  }

  /**
   * Retorna o progresso do cliente no programa de fidelidade para uso no prompt da IA.
   * Inclui objetivo (meta) para montar barra visual ✅/⬜ no RAG.
   */
  async getProgressoParaPrompt(userId: number, cpf: string): Promise<{
    lavagensFaltam: number;
    secagensFaltam: number;
    proximoObjetivoLavagens: number | null;
    proximoObjetivoSecagens: number | null;
    proximoPremioLavagens: string | null;
    proximoPremioSecagens: string | null;
  } | null> {
    try {
      const hoje = new Date();
      const [saldoLav, saldoSec] = await Promise.all([
        this.calcularSaldoFidelidade(userId, cpf, 'LAVAGEM', hoje),
        this.calcularSaldoFidelidade(userId, cpf, 'SECAGEM', hoje),
      ]);
      return {
        lavagensFaltam: saldoLav.faltam,
        secagensFaltam: saldoSec.faltam,
        proximoObjetivoLavagens: saldoLav.proximoObjetivo,
        proximoObjetivoSecagens: saldoSec.proximoObjetivo,
        proximoPremioLavagens: saldoLav.proximoPremio,
        proximoPremioSecagens: saldoSec.proximoPremio,
      };
    } catch (e) {
      logger.debug(`getProgressoParaPrompt: ${e}`);
      return null;
    }
  }

  /**
   * Apura e concede prêmios automaticamente para um cliente
   * Para prêmios PERPÉTUOS, pode conceder múltiplas vezes na mesma apuração
   * Para prêmios ÚNICOS, concede apenas uma vez
   */
  async apurarEConcederPremios(userId: number, cpf: string): Promise<{
    premiosConcedidos: number;
    premios: PremioCliente[];
  }> {
    try {
      // Buscar prêmios ativos
      const premios = await this.premioModel.findByUserId(userId, true);

      const premiosConcedidos: PremioCliente[] = [];

      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);

      // Verificar cada prêmio
      for (const premio of premios) {
        // Verificar se está dentro do período de vigência
        const dataInicio = new Date(premio.data_inicio_utilizacoes);
        dataInicio.setHours(0, 0, 0, 0);

        if (dataInicio > hoje) {
          continue; // Prêmio ainda não está ativo (data de início no futuro)
        }

        if (premio.data_fim_utilizacoes) {
          const dataFim = new Date(premio.data_fim_utilizacoes);
          dataFim.setHours(23, 59, 59, 999);
          if (dataFim < hoje) {
            continue; // Prêmio já terminou (data de fim no passado)
          }
        }

        // Para prêmios ÚNICOS, verificar se já foi concedido
        if (premio.tipo_atingimento === 'UNICO') {
          const jaConquistado = await this.premioClienteModel.verificarSeJaConquistado(userId, cpf, premio.id);
          if (jaConquistado) {
            continue; // Já foi concedido, não verificar mais
          }
        }

        // Para todos os prêmios, contar desde data_inicio_utilizacoes (respeitando intervalo de vigência)
        const dataInicioContagem = premio.data_inicio_utilizacoes;

        // Contar todas as utilizações no intervalo de vigência
        const utilizacoes = await this.contarUtilizacoes(userId, cpf, dataInicioContagem, premio.data_fim_utilizacoes);

        // Verificar se atingiu o objetivo
        let quantidadeAtual = 0;
        if (premio.servico === 'LAVAGEM') {
          quantidadeAtual = utilizacoes.lavagens;
        } else if (premio.servico === 'SECAGEM') {
          quantidadeAtual = utilizacoes.secagens;
        } else if (premio.servico === 'TOTAL') {
          quantidadeAtual = utilizacoes.total;
        }

        // Para prêmios PERPÉTUOS, subtrair as utilizações já usadas em conquistas anteriores
        if (premio.tipo_atingimento === 'PERPETUO') {
          const quantidadeConquistas = await this.premioClienteModel.contarConquistas(userId, cpf, premio.id);
          const utilizacoesJaUsadas = quantidadeConquistas * premio.objetivo;
          quantidadeAtual = Math.max(0, quantidadeAtual - utilizacoesJaUsadas);
        }

        // Para prêmios PERPÉTUOS, pode conceder múltiplas vezes se atingiu o objetivo várias vezes
        if (premio.tipo_atingimento === 'PERPETUO' && quantidadeAtual >= premio.objetivo) {
          // Calcular quantas vezes pode conceder (ex: se tem 8 utilizações e objetivo é 10, não concede; se tem 18 e objetivo é 10, concede 1 vez)
          const vezesParaConceder = Math.floor(quantidadeAtual / premio.objetivo);

          for (let i = 0; i < vezesParaConceder; i++) {
            const dataConquista = new Date();
            let dataValidade: Date | null = null;

            if (premio.validade_dias) {
              dataValidade = new Date(dataConquista);
              dataValidade.setDate(dataValidade.getDate() + premio.validade_dias);
            }

            const premioCliente = await this.premioClienteModel.create({
              user_id: userId,
              cpf_cliente: cpf,
              premio_id: premio.id,
              data_conquista: dataConquista,
              data_validade: dataValidade,
              data_utilizacao: null,
              utilizado: false,
              codigo_voucher: null,
              observacao: null,
              data_entrega: null,
              voucher_tentativa_em: null,
              voucher_erro_ultimo: null,
              conquista_notificacao_id: null,
            });

            premiosConcedidos.push(premioCliente);
            logger.info(`Prêmio PERPÉTUO "${premio.descricao}" concedido automaticamente para cliente ${cpf} (conquista ${i + 1}/${vezesParaConceder})`);
          }
        } else if (quantidadeAtual >= premio.objetivo) {
          // Para prêmios ÚNICOS ou primeira conquista de PERPÉTUO
          const dataConquista = new Date();
          let dataValidade: Date | null = null;

          if (premio.validade_dias) {
            dataValidade = new Date(dataConquista);
            dataValidade.setDate(dataValidade.getDate() + premio.validade_dias);
          }

          const premioCliente = await this.premioClienteModel.create({
            user_id: userId,
            cpf_cliente: cpf,
            premio_id: premio.id,
            data_conquista: dataConquista,
            data_validade: dataValidade,
            data_utilizacao: null,
            utilizado: false,
            codigo_voucher: null,
            observacao: null,
            data_entrega: null,
            voucher_tentativa_em: null,
            voucher_erro_ultimo: null,
            conquista_notificacao_id: null,
          });

          premiosConcedidos.push(premioCliente);
          logger.info(`Prêmio "${premio.descricao}" concedido automaticamente para cliente ${cpf}`);
        }
      }

      return {
        premiosConcedidos: premiosConcedidos.length,
        premios: premiosConcedidos,
      };
    } catch (error: any) {
      logger.error(`Erro ao apurar prêmios para cliente ${cpf}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calcula o percentual de cumprimento de um cliente para um tipo de serviço
   */
  private calcularPercentualCumprimento(saldo: SaldoFidelidade): number {
    if (!saldo.proximoObjetivo || saldo.proximoObjetivo === 0) {
      return 100; // Já conquistou todos os prêmios
    }
    return Math.min(100, Math.round((saldo.atual / saldo.proximoObjetivo) * 100));
  }

  /**
   * Lista clientes com informações de fidelidade
   */
  async listarClientesFidelidade(
    userId: number,
    page: number = 1,
    limit: number = 50,
    search?: string,
    percentualMin?: number,
    percentualMax?: number,
    tipoServico?: TipoServico
  ): Promise<{ clientes: ClienteFidelidade[]; total: number }> {
    try {
      const isGlobalFilter = percentualMin !== undefined || percentualMax !== undefined;

      const dbPage = isGlobalFilter ? 1 : page;
      const dbLimit = isGlobalFilter ? 10000 : limit;

      // Buscar prêmios ativos uma única vez para todos os clientes
      const premiosAtivos = await this.premioModel.findByUserId(userId, true);
      const dataMaisAntigaGeral = premiosAtivos.length > 0
        ? new Date(Math.min(...premiosAtivos.map(p => p.data_inicio_utilizacoes.getTime())))
        : null;

      // Buscar clientes
      const clientesResult = search
        ? await this.clienteModel.searchByUserId(userId, search, dbPage, dbLimit)
        : await this.clienteModel.findByUserId(userId, dbPage, dbLimit);

      if (clientesResult.clientes.length === 0) {
        return { clientes: [], total: 0 };
      }

      const cpfs = clientesResult.clientes
        .map(c => c.cpf)
        .filter((cpf): cpf is string => !!cpf);

      // Carregar dados em lote (Bulk Load)
      const [
        mapUtilizacoesGerais,
        mapConquistasPorCliente
      ] = await Promise.all([
        // Utilizações totais desde a data mais antiga
        dataMaisAntigaGeral
          ? this.vmLavPedidoModel.contarUtilizacoesPorClienteAposData(userId, cpfs, dataMaisAntigaGeral)
          : this.vmLavPedidoModel.contarUtilizacoesPorCliente(userId, cpfs),

        // Todas as conquistas dos clientes envolvidos (chave por CPF normalizado)
        this.premioClienteModel.findByUserId(userId).then(conquistas => {
          const m = new Map<string, PremioCliente[]>();
          conquistas.forEach(c => {
            const key = normalizeCpfToDigits(c.cpf_cliente) || c.cpf_cliente;
            if (!m.has(key)) m.set(key, []);
            m.get(key)!.push(c);
          });
          return m;
        })
      ]);

      const clientesFidelidade: ClienteFidelidade[] = [];

      for (const cliente of clientesResult.clientes) {
        if (!cliente.cpf) continue;

        const cpf = cliente.cpf;
        const cpfNorm = normalizeCpfToDigits(cpf);
        const conquistas = mapConquistasPorCliente.get(cpfNorm || cpf!) || [];
        const utilizacoesGerais = mapUtilizacoesGerais.get(cpfNorm || cpf) || { lavagens: 0, secagens: 0, total: 0 };

        // Cálculo de Saldos em Memória (Otimizado)
        const contarConquistas = (tipo: TipoServico | 'TOTAL') =>
          conquistas.filter((c: PremioCliente) => {
            const p = premiosAtivos.find(pa => pa.id === c.premio_id);
            return p && (p.servico === tipo || tipo === 'TOTAL');
          }).length;

        // Metas padrão se não houver prêmio configurado
        const prLavagem = premiosAtivos.find(p => p.servico === 'LAVAGEM');
        const prSecagem = premiosAtivos.find(p => p.servico === 'SECAGEM');
        const prTotal = premiosAtivos.find(p => p.servico === 'TOTAL');

        const metaLavagem = prLavagem?.objetivo || 10;
        const metaSecagem = prSecagem?.objetivo || 10;
        const metaTotal = prTotal?.objetivo || 10;

        const calcSaldo = (utilizacao: number, meta: number, tipo: TipoServico | 'TOTAL', desc: string): SaldoFidelidade => {
          const cCount = contarConquistas(tipo);
          const atualPosConquistas = Math.max(0, utilizacao - (meta * cCount));
          return {
            atual: atualPosConquistas,
            proximoObjetivo: meta,
            faltam: Math.max(0, meta - atualPosConquistas),
            proximoPremio: desc,
            conquistas: cCount,
            meta: meta
          };
        };

        const saldoLavagens = calcSaldo(utilizacoesGerais.lavagens, metaLavagem, 'LAVAGEM', prLavagem?.descricao || 'Lavagem Grátis');
        const saldoSecagens = calcSaldo(utilizacoesGerais.secagens, metaSecagem, 'SECAGEM', prSecagem?.descricao || 'Secagem Grátis');
        const saldoTotal = calcSaldo(utilizacoesGerais.total, metaTotal, 'TOTAL', prTotal?.descricao || 'Brinde/Desconto');

        const dataCliente: ClienteFidelidade = {
          cpf: cliente.cpf,
          nome: cliente.nome || 'Sem nome',
          telefone: cliente.telefone,
          dataCadastro: cliente.data_cadastro,
          dataInicioUtilizacoes: null,
          totalLavagens: utilizacoesGerais.lavagens,
          totalSecagens: utilizacoesGerais.secagens,
          totalUtilizacoes: utilizacoesGerais.total,
          saldoFidelidadeLavagens: saldoLavagens,
          saldoFidelidadeSecagens: saldoSecagens,
          saldoFidelidadeTotal: saldoTotal,
          premiosConquistados: conquistas.length,
          premiosUtilizados: conquistas.filter((c: PremioCliente) => c.utilizado).length,
          listaPremios: []
        };

        // Aplicar filtros
        if (isGlobalFilter || (tipoServico && (tipoServico as string) !== 'TODOS')) {
          let saldoParaFiltro: SaldoFidelidade;
          if (tipoServico === 'LAVAGEM') saldoParaFiltro = saldoLavagens;
          else if (tipoServico === 'SECAGEM') saldoParaFiltro = saldoSecagens;
          else if (tipoServico === 'TOTAL') saldoParaFiltro = saldoTotal;
          else {
            const pL = this.calcularPercentualCumprimento(saldoLavagens);
            const pS = this.calcularPercentualCumprimento(saldoSecagens);
            const pT = this.calcularPercentualCumprimento(saldoTotal);

            const isInRange = (p: number) => {
              if (percentualMin !== undefined && p < percentualMin) return false;
              if (percentualMax !== undefined && p > percentualMax) return false;
              return true;
            };

            // Se QUALQUER um dos percentuais estiver na faixa, o cliente deve ser incluído
            if (!isInRange(pL) && !isInRange(pS) && !isInRange(pT)) continue;

            clientesFidelidade.push(dataCliente);
            continue;
          }

          const percentual = this.calcularPercentualCumprimento(saldoParaFiltro);
          if (percentualMin !== undefined && percentual < percentualMin) continue;
          if (percentualMax !== undefined && percentual > percentualMax) continue;

          clientesFidelidade.push(dataCliente);
        } else {
          clientesFidelidade.push(dataCliente);
        }
      }

      const totalReal = isGlobalFilter ? clientesFidelidade.length : clientesResult.total;
      const sortedResult = isGlobalFilter
        ? clientesFidelidade.slice((page - 1) * limit, page * limit)
        : clientesFidelidade;

      return {
        clientes: sortedResult,
        total: totalReal,
      };
    } catch (error: any) {
      logger.error(`Erro ao listar clientes de fidelidade: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtém dados de fidelização de um cliente específico por CPF
   */
  async obterFidelizacaoPorCpf(
    userId: number,
    cpf: string
  ): Promise<ClienteFidelidade | null> {
    try {
      if (!cpf) {
        return null;
      }

      // Buscar cliente por CPF
      const clientesResult = await this.clienteModel.searchByUserId(userId, cpf, 1, 1);
      const cliente = clientesResult.clientes.find(c => c.cpf === cpf);

      if (!cliente || !cliente.cpf) {
        return null;
      }

      // Buscar prêmios ativos para determinar a data mais antiga (apenas para exibição de totais)
      const premiosAtivos = await this.premioModel.findByUserId(userId, true);
      const dataMaisAntiga = premiosAtivos.length > 0
        ? new Date(Math.min(...premiosAtivos.map(p => p.data_inicio_utilizacoes.getTime())))
        : (cliente.data_cadastro || new Date());

      // Contar utilizações desde a data mais antiga para exibição de totais gerais
      const utilizacoes = await this.contarUtilizacoes(userId, cliente.cpf, dataMaisAntiga);

      // Calcular saldos de fidelidade
      const dataBase = cliente.data_cadastro || new Date();
      const saldoLavagens = await this.calcularSaldoFidelidade(userId, cliente.cpf, 'LAVAGEM', dataBase);
      const saldoSecagens = await this.calcularSaldoFidelidade(userId, cliente.cpf, 'SECAGEM', dataBase);
      const saldoTotal = await this.calcularSaldoFidelidade(userId, cliente.cpf, 'TOTAL', dataBase);

      // Buscar prêmios conquistados
      const premiosConquistados = await this.premioClienteModel.findByCpf(userId, cliente.cpf);
      const premiosUtilizados = premiosConquistados.filter(p => p.utilizado).length;

      // Preencher descrições dos prêmios
      const listaPremios = await Promise.all(
        premiosConquistados.map(async (pc) => {
          const premio = await this.premioModel.findById(pc.premio_id);
          return {
            id: pc.id,
            descricao: premio?.descricao || 'Prêmio desconhecido',
            dataConquista: pc.data_conquista,
            dataValidade: pc.data_validade,
            utilizado: pc.utilizado,
          };
        })
      );

      return {
        cpf: cliente.cpf,
        nome: cliente.nome || 'Sem nome',
        telefone: cliente.telefone,
        dataCadastro: cliente.data_cadastro,
        dataInicioUtilizacoes: null,
        totalLavagens: utilizacoes.lavagens,
        totalSecagens: utilizacoes.secagens,
        totalUtilizacoes: utilizacoes.total,
        saldoFidelidadeLavagens: saldoLavagens,
        saldoFidelidadeSecagens: saldoSecagens,
        saldoFidelidadeTotal: saldoTotal,
        premiosConquistados: premiosConquistados.length,
        premiosUtilizados,
        listaPremios,
      };
    } catch (error: any) {
      logger.error(`Erro ao obter fidelização por CPF: ${error.message}`);
      return null;
    }
  }

  /**
   * Obtém distribuição de clientes por percentual de cumprimento
   */
  async obterDistribuicaoPorPercentual(
    userId: number,
    _tipoServico?: TipoServico
  ): Promise<{ faixa: string; lavagem: number; secagem: number; total: number }[]> {
    try {
      const clientesResult = await this.clienteModel.findByUserId(userId, 1, 10000);

      const distribuicao: { [faixa: string]: { lavagem: number; secagem: number; total: number } } = {};
      for (let i = 0; i < 100; i += 10) {
        distribuicao[`${i}-${i + 10}%`] = { lavagem: 0, secagem: 0, total: 0 };
      }

      if (clientesResult.clientes.length === 0) return [];

      const cpfs = clientesResult.clientes
        .map(c => c.cpf)
        .filter((cpf): cpf is string => !!cpf);

      const premiosAtivos = await this.premioModel.findByUserId(userId, true);
      const dataMaisAntigaGeral = premiosAtivos.length > 0
        ? new Date(Math.min(...premiosAtivos.map(p => p.data_inicio_utilizacoes.getTime())))
        : null;

      const [mapUtilizacoes, mapConquistas] = await Promise.all([
        dataMaisAntigaGeral
          ? this.vmLavPedidoModel.contarUtilizacoesPorClienteAposData(userId, cpfs, dataMaisAntigaGeral)
          : this.vmLavPedidoModel.contarUtilizacoesPorCliente(userId, cpfs),
        this.premioClienteModel.findByUserId(userId).then(conquistas => {
          const m = new Map<string, PremioCliente[]>();
          conquistas.forEach(c => {
            const key = normalizeCpfToDigits(c.cpf_cliente) || c.cpf_cliente;
            if (!m.has(key)) m.set(key, []);
            m.get(key)!.push(c);
          });
          return m;
        })
      ]);

      const metaLavagem = premiosAtivos.find(p => p.servico === 'LAVAGEM')?.objetivo || 10;
      const metaSecagem = premiosAtivos.find(p => p.servico === 'SECAGEM')?.objetivo || 10;
      const metaTotal = premiosAtivos.find(p => p.servico === 'TOTAL')?.objetivo || 10;

      for (const cliente of clientesResult.clientes) {
        if (!cliente.cpf) continue;
        const cpf = cliente.cpf;
        const cpfNorm = normalizeCpfToDigits(cpf);
        const utilizacoes = mapUtilizacoes.get(cpfNorm || cpf) || { lavagens: 0, secagens: 0, total: 0 };
        const conquistas = mapConquistas.get(cpfNorm || cpf) || [];

        const contarConquistas = (tipo: TipoServico | 'TOTAL') =>
          conquistas.filter((c: PremioCliente) => {
            const p = premiosAtivos.find(pa => pa.id === c.premio_id);
            return p && (p.servico === tipo || tipo === 'TOTAL');
          }).length;

        const pL = Math.min(100, Math.round((Math.max(0, utilizacoes.lavagens - (metaLavagem * contarConquistas('LAVAGEM'))) / metaLavagem) * 100));
        const pS = Math.min(100, Math.round((Math.max(0, utilizacoes.secagens - (metaSecagem * contarConquistas('SECAGEM'))) / metaSecagem) * 100));
        const pT = Math.min(100, Math.round((Math.max(0, utilizacoes.total - (metaTotal * contarConquistas('TOTAL'))) / metaTotal) * 100));

        const getFaixa = (p: number) => {
          const val = Math.floor(p / 10) * 10;
          return `${val}-${val + 10}%`;
        };

        const fL = getFaixa(pL);
        const fS = getFaixa(pS);
        const fT = getFaixa(pT);

        if (distribuicao[fL]) distribuicao[fL].lavagem++;
        if (distribuicao[fS]) distribuicao[fS].secagem++;
        if (distribuicao[fT]) distribuicao[fT].total++;
      }

      const resultado = Object.keys(distribuicao)
        .sort((a, b) => parseInt(a) - parseInt(b))
        .map(faixa => ({
          faixa,
          lavagem: distribuicao[faixa].lavagem,
          secagem: distribuicao[faixa].secagem,
          total: distribuicao[faixa].total,
        }));

      return resultado;
    } catch (error: any) {
      logger.error(`Erro ao obter distribuição por percentual: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtém pedidos detalhados de um cliente com informações de contabilização
   */
  async obterPedidosDetalhados(userId: number, cpf: string): Promise<{
    cliente: { nome: string; cpf: string };
    pedidos: Array<{
      id: number;
      cliente_nome: string;
      tipo_servico: 'LAVAGEM' | 'SECAGEM';
      data_pedido: Date;
      tipo_pagamento: string;
      pago_com_fidelidade: boolean;
      contabilizado: boolean;
      premio_id: number | null;
      premio_descricao: string | null;
    }>;
  }> {
    const conn = await pool.getConnection();
    try {
      // 1. Buscar informações do cliente
      const clientes = await this.clienteModel.findByUserId(userId, 1, 10000);
      const cliente = clientes.clientes.find(c => c.cpf === cpf);

      if (!cliente) {
        throw new Error(`Cliente com CPF ${cpf} não encontrado`);
      }

      // 2. Buscar data mínima de início dos prêmios ativos
      const premiosAtivos = await this.premioModel.findByUserId(userId);
      const dataMinima = premiosAtivos.length > 0
        ? new Date(Math.min(...premiosAtivos
          .filter(p => p.ativo && p.data_inicio_utilizacoes)
          .map(p => new Date(p.data_inicio_utilizacoes!).getTime())))
        : new Date(0);

      // 3. Buscar TODOS os pedidos válidos (ordem cronológica para facilitar consumo)
      const queryPedidos = `
        SELECT 
          p.id,
          c.nome as cliente_nome,
          p.tipo_servico,
          p.data_venda as data_pedido,
          p.tipo_pagamento,
          p.pago_com_fidelidade
        FROM vm_lav_pedidos p
        INNER JOIN vm_lav_clientes c ON p.cliente_id = c.id
        WHERE c.cpf = ?
          AND p.user_id = ?
          AND p.situacao_venda = 'Sucesso'
          AND p.data_venda >= ?
        ORDER BY p.data_venda ASC
      `;

      const resultPedidos = await conn.query(queryPedidos, [cpf, userId, dataMinima]) as any;
      let pedidosRaw: any[] = [];
      if (Array.isArray(resultPedidos)) {
        pedidosRaw = Array.isArray(resultPedidos[0]) ? resultPedidos[0] : resultPedidos;
      } else if (resultPedidos && typeof resultPedidos === 'object' && 'length' in resultPedidos) {
        pedidosRaw = Array.from(resultPedidos as any);
      }

      // Mapear para objeto manipulável
      let pedidos = pedidosRaw.map((row: any) => ({
        id: row.id,
        cliente_nome: row.cliente_nome,
        tipo_servico: row.tipo_servico as 'LAVAGEM' | 'SECAGEM',
        data_pedido: new Date(row.data_pedido),
        tipo_pagamento: row.tipo_pagamento || 'Não informado',
        pago_com_fidelidade: !!row.pago_com_fidelidade,
        contabilizado: false,
        premio_id: null as number | null,
        premio_descricao: null as string | null,
      }));

      // 4. Buscar conquistas do cliente com detalhes do prêmio
      const queryConquistas = `
        SELECT 
          pc.id,
          pc.premio_id,
          pr.objetivo,
          pr.servico as tipo_servico_premio,
          pr.descricao,
          pc.data_conquista
        FROM premios_clientes pc
        JOIN premios pr ON pc.premio_id = pr.id
        WHERE pc.cpf_cliente = ? AND pc.user_id = ?
        ORDER BY pc.data_conquista ASC
      `;

      const resultConquistas = await conn.query(queryConquistas, [cpf, userId]) as any;
      let conquistas: any[] = [];
      if (Array.isArray(resultConquistas)) {
        conquistas = Array.isArray(resultConquistas[0]) ? resultConquistas[0] : resultConquistas;
      } else if (resultConquistas && typeof resultConquistas === 'object' && 'length' in resultConquistas) {
        conquistas = Array.from(resultConquistas as any);
      }

      // 5. Lógica de "Consumo" de pedidos
      // Para cada conquista, marcar os N pedidos mais antigos disponíveis do tipo correspondente
      for (const conquista of conquistas) {
        const objetivo = conquista.objetivo;
        const tipoServico = conquista.tipo_servico_premio ? conquista.tipo_servico_premio.toUpperCase() : 'TOTAL';

        let consumidos = 0;

        // Iterar sobre pedidos para encontrar candidatos
        for (const pedido of pedidos) {
          if (consumidos >= objetivo) break;
          // Se já foi contabilizado em outra conquista OU foi pago com fidelidade, não conta
          if (pedido.contabilizado || pedido.pago_com_fidelidade) continue;

          // Verificar compatibilidade de serviço (Normalizando para evitar erro de Case)
          const pedidoTipo = pedido.tipo_servico ? pedido.tipo_servico.toUpperCase() : '';
          const compativel = tipoServico === 'TOTAL' || pedidoTipo === tipoServico;

          // Verificar se data do pedido é anterior ou igual à conquista (consistência temporal)
          const dataConquista = new Date(conquista.data_conquista);
          // Adicionar 1 dia para garantir que pedidos do mesmo dia entrem
          const dataLimite = new Date(dataConquista);
          dataLimite.setDate(dataLimite.getDate() + 1);

          if (compativel && pedido.data_pedido < dataLimite) {
            pedido.contabilizado = true;
            pedido.premio_id = conquista.premio_id;
            pedido.premio_descricao = conquista.descricao;
            consumidos++;
          }
        }
      }

      // 6. Ordenar por data decrescente para exibição (mais recentes primeiro)
      pedidos.sort((a, b) => b.data_pedido.getTime() - a.data_pedido.getTime());

      return {
        cliente: {
          nome: cliente.nome || 'Cliente',
          cpf: cliente.cpf || cpf,
        },
        pedidos,
      };
    } finally {
      conn.release();
    }
  }

  /**
   * Gera voucher via API VM para uma conquista (premio_cliente)
   * Apenas para prêmios LAVAGEM ou SECAGEM (não TOTAL)
   */
  async gerarVoucherParaConquista(
    premioClienteId: number,
    userId: number
  ): Promise<{ success: boolean; codigo_voucher?: string; data_validade?: Date; error?: string }> {
    const premioCliente = await this.premioClienteModel.findById(premioClienteId);
    if (!premioCliente || premioCliente.user_id !== userId) {
      return { success: false, error: 'Conquista não encontrada.' };
    }

    if (premioCliente.codigo_voucher) {
      return { success: false, error: 'Esta conquista já possui voucher gerado.' };
    }

    const premio = await this.premioModel.findById(premioCliente.premio_id);
    if (!premio) {
      return { success: false, error: 'Prêmio não encontrado.' };
    }

    if (premio.servico === 'TOTAL') {
      return { success: false, error: 'Não é possível gerar voucher para prêmio do tipo TOTAL.' };
    }

    if (premio.servico !== 'LAVAGEM' && premio.servico !== 'SECAGEM') {
      return { success: false, error: 'Serviço deve ser LAVAGEM ou SECAGEM.' };
    }

    const valorVoucher = premio.valor_voucher;
    const qtdUtilizacoes = premio.quantidade_utilizacoes;
    if (valorVoucher == null || valorVoucher <= 0 || qtdUtilizacoes == null || qtdUtilizacoes <= 0) {
      return { success: false, error: 'Prêmio sem valor ou quantidade de utilizações configurados.' };
    }

    const cliente = await this.clienteModel.findByCpf(userId, premioCliente.cpf_cliente);
    const nomeCliente = cliente?.nome?.trim();
    if (!nomeCliente) {
      return { success: false, error: 'Cliente não encontrado em vm_lav_clientes.' };
    }

    const resItens = await this.vmLavService.buscarItensRestricaoCliente(userId, nomeCliente);
    if (!resItens.success || resItens.idRestricao == null || !resItens.descricao) {
      return { success: false, error: resItens.error || 'Erro ao buscar dados do cliente na API.' };
    }

    const dataConquista = new Date(premioCliente.data_conquista);
    const validadeDias = premio.validade_dias ?? 34;
    const dataInicio = new Date(dataConquista);
    dataInicio.setHours(3, 0, 0, 0);
    const dataTermino = new Date(dataInicio);
    dataTermino.setDate(dataTermino.getDate() + validadeDias);

    const resCriar = await this.vmLavService.criarVoucherFidelidade(userId, {
      idRestricao: resItens.idRestricao,
      descricaoCliente: resItens.descricao,
      valor: String(valorVoucher.toFixed(2)),
      quantidadeUtilizacoes: qtdUtilizacoes,
      dataInicio,
      dataTermino,
      servico: premio.servico as 'LAVAGEM' | 'SECAGEM',
    });

    if (!resCriar.success || resCriar.idVoucher == null) {
      return { success: false, error: resCriar.error || 'Erro ao criar voucher na API.' };
    }

    const resCodigo = await this.vmLavService.obterCodigoVoucher(userId, resCriar.idVoucher);
    if (!resCodigo.success || !resCodigo.codigo) {
      return { success: false, error: resCodigo.error || 'Erro ao obter código do voucher.' };
    }

    const dataValidade = new Date(dataTermino);
    await this.premioClienteModel.atualizarVoucher(premioClienteId, resCodigo.codigo, dataValidade);
    await this.premioClienteModel.updateAutomacao(premioClienteId, { voucher_erro_ultimo: null });

    return {
      success: true,
      codigo_voucher: resCodigo.codigo,
      data_validade: dataValidade,
    };
  }
}

