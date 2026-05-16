import pool from '../config/database';
import logger from '../utils/logger';
import { PremioModel, Premio, TipoServico } from '../models/premio.model';
import { PremioClienteModel, PremioCliente } from '../models/premioCliente.model';
import { VmLavClienteModel, VmLavCliente } from '../models/vmLavCliente.model';
import { VmLavPedido } from '../models/vmLavPedido.model';

export interface SaldoFidelidade {
  atual: number;
  proximoObjetivo: number | null;
  faltam: number;
  proximoPremio: string | null;
  conquistas: number; // Quantidade de vezes que prêmios deste tipo foram conquistados
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

  constructor() {
    this.premioModel = new PremioModel();
    this.premioClienteModel = new PremioClienteModel();
    this.clienteModel = new VmLavClienteModel();
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
      // Verificar se cliente existe
      const clientes = await this.clienteModel.findByUserId(userId, 1, 10000);
      const cliente = clientes.clientes.find(c => c.cpf === cpf);

      if (!cliente) {
        return { lavagens: 0, secagens: 0, total: 0 };
      }

      if (!dataInicio) {
        logger.warn(`Data de início não fornecida para cliente ${cpf}`);
        return { lavagens: 0, secagens: 0, total: 0 };
      }

      // Construir query com filtro de intervalo
      let query = `SELECT tipo_servico, COUNT(*) as count 
                   FROM vm_lav_pedidos 
                   WHERE user_id = ? 
                   AND cliente_cpf = ? 
                   AND situacao_venda = 'Sucesso'
                   AND data_venda >= ?`;
      const params: any[] = [userId, cpf, dataInicio];

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
    dataInicio: Date
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
              observacao: null,
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
            observacao: null,
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
      // Buscar clientes
      const clientesResult = search
        ? await this.clienteModel.searchByUserId(userId, search, page, limit)
        : await this.clienteModel.findByUserId(userId, page, limit);

      const clientesFidelidade: ClienteFidelidade[] = [];

      for (const cliente of clientesResult.clientes) {
        if (!cliente.cpf) {
          continue; // Pular clientes sem CPF
        }

        // Buscar prêmios ativos para determinar a data mais antiga (apenas para exibição de totais)
        const premiosAtivos = await this.premioModel.findByUserId(userId, true);
        const dataMaisAntiga = premiosAtivos.length > 0
          ? new Date(Math.min(...premiosAtivos.map(p => p.data_inicio_utilizacoes.getTime())))
          : (cliente.data_cadastro || new Date());

        // Contar utilizações desde a data mais antiga para exibição de totais gerais
        const utilizacoes = await this.contarUtilizacoes(userId, cliente.cpf, dataMaisAntiga);

        // Calcular saldos de fidelidade
        // IMPORTANTE: Cada prêmio usa sua própria data_inicio_utilizacoes para calcular o progresso
        // O parâmetro dataBase não é mais usado, mas mantido para compatibilidade
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

        // Aplicar filtros de percentual e tipo de serviço
        if (tipoServico !== undefined || percentualMin !== undefined || percentualMax !== undefined) {
          let saldoParaFiltro: SaldoFidelidade;
          
          if (tipoServico === 'LAVAGEM') {
            saldoParaFiltro = saldoLavagens;
          } else if (tipoServico === 'SECAGEM') {
            saldoParaFiltro = saldoSecagens;
          } else if (tipoServico === 'TOTAL') {
            saldoParaFiltro = saldoTotal;
          } else {
            // Se não especificou tipo, usar o maior percentual entre os três
            const percentLav = this.calcularPercentualCumprimento(saldoLavagens);
            const percentSec = this.calcularPercentualCumprimento(saldoSecagens);
            const percentTotal = this.calcularPercentualCumprimento(saldoTotal);
            const maiorPercentual = Math.max(percentLav, percentSec, percentTotal);
            
            if (percentualMin !== undefined && maiorPercentual < percentualMin) {
              continue;
            }
            if (percentualMax !== undefined && maiorPercentual > percentualMax) {
              continue;
            }
            
            clientesFidelidade.push({
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
            });
            continue;
          }
          
          const percentual = this.calcularPercentualCumprimento(saldoParaFiltro);
          
          if (percentualMin !== undefined && percentual < percentualMin) {
            continue;
          }
          if (percentualMax !== undefined && percentual > percentualMax) {
            continue;
          }
        }

        clientesFidelidade.push({
          cpf: cliente.cpf,
          nome: cliente.nome || 'Sem nome',
          telefone: cliente.telefone,
          dataCadastro: cliente.data_cadastro,
          dataInicioUtilizacoes: null, // Removido - cada prêmio tem sua própria data
          totalLavagens: utilizacoes.lavagens,
          totalSecagens: utilizacoes.secagens,
          totalUtilizacoes: utilizacoes.total,
          saldoFidelidadeLavagens: saldoLavagens,
          saldoFidelidadeSecagens: saldoSecagens,
          saldoFidelidadeTotal: saldoTotal,
          premiosConquistados: premiosConquistados.length,
          premiosUtilizados,
          listaPremios,
        });
      }

      return {
        clientes: clientesFidelidade,
        total: clientesFidelidade.length, // Total filtrado
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
    tipoServico?: TipoServico
  ): Promise<{ faixa: string; lavagem: number; secagem: number; total: number }[]> {
    try {
      // Buscar todos os clientes (sem paginação para calcular distribuição)
      const clientesResult = await this.clienteModel.findByUserId(userId, 1, 10000);

      // Inicializar contadores para cada faixa (0-10%, 10-20%, ..., 90-100%)
      const distribuicao: { [faixa: string]: { lavagem: number; secagem: number; total: number } } = {};
      for (let i = 0; i < 100; i += 10) {
        distribuicao[`${i}-${i + 10}%`] = { lavagem: 0, secagem: 0, total: 0 };
      }

      for (const cliente of clientesResult.clientes) {
        if (!cliente.cpf) {
          continue;
        }

        // Calcular saldos de fidelidade
        const dataBase = cliente.data_cadastro || new Date();
        const saldoLavagens = await this.calcularSaldoFidelidade(userId, cliente.cpf, 'LAVAGEM', dataBase);
        const saldoSecagens = await this.calcularSaldoFidelidade(userId, cliente.cpf, 'SECAGEM', dataBase);
        const saldoTotal = await this.calcularSaldoFidelidade(userId, cliente.cpf, 'TOTAL', dataBase);

        // Calcular percentuais
        const percentLav = this.calcularPercentualCumprimento(saldoLavagens);
        const percentSec = this.calcularPercentualCumprimento(saldoSecagens);
        const percentTotal = this.calcularPercentualCumprimento(saldoTotal);

        // Determinar faixa para cada tipo
        const faixaLav = `${Math.floor(percentLav / 10) * 10}-${Math.floor(percentLav / 10) * 10 + 10}%`;
        const faixaSec = `${Math.floor(percentSec / 10) * 10}-${Math.floor(percentSec / 10) * 10 + 10}%`;
        const faixaTotal = `${Math.floor(percentTotal / 10) * 10}-${Math.floor(percentTotal / 10) * 10 + 10}%`;

        // Incrementar contadores
        if (distribuicao[faixaLav]) {
          distribuicao[faixaLav].lavagem++;
        }
        if (distribuicao[faixaSec]) {
          distribuicao[faixaSec].secagem++;
        }
        if (distribuicao[faixaTotal]) {
          distribuicao[faixaTotal].total++;
        }
      }

      // Converter para array
      const resultado = Object.keys(distribuicao)
        .sort((a, b) => {
          const numA = parseInt(a.split('-')[0]);
          const numB = parseInt(b.split('-')[0]);
          return numA - numB;
        })
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
}

