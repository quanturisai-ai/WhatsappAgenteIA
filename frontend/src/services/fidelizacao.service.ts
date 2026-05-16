import api from './api';

export type TipoServico = 'SECAGEM' | 'LAVAGEM' | 'TOTAL';

export type TipoAtingimento = 'UNICO' | 'PERPETUO';

export interface Premio {
  id: number;
  user_id: number;
  servico: TipoServico;
  objetivo: number;
  descricao: string;
  data_inicio_utilizacoes: string;
  data_fim_utilizacoes: string | null;
  tipo_atingimento: TipoAtingimento;
  validade_dias: number | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface SaldoFidelidade {
  atual: number;
  proximoObjetivo: number | null;
  faltam: number;
  proximoPremio: string | null;
  conquistas: number;
}

export interface ClienteFidelidade {
  cpf: string;
  nome: string;
  telefone: string | null;
  dataCadastro: string | null;
  dataInicioUtilizacoes: string | null;
  totalLavagens: number;
  totalSecagens: number;
  totalUtilizacoes: number;
  saldoFidelidadeLavagens: SaldoFidelidade;
  saldoFidelidadeSecagens: SaldoFidelidade;
  saldoFidelidadeTotal: SaldoFidelidade;
  premiosConquistados: number;
  premiosUtilizados: number;
  listaPremios: Array<{
    id: number;
    descricao: string;
    dataConquista: string;
    dataValidade: string | null;
    utilizado: boolean;
  }>;
}

export interface Conquista {
  id: number;
  cpfCliente: string;
  premioId: number;
  premioDescricao: string;
  premioServico: TipoServico;
  dataConquista: string;
  dataValidade: string | null;
  dataUtilizacao: string | null;
  utilizado: boolean;
  observacao: string | null;
  createdAt: string;
}

class FidelizacaoService {
  async listarPremios(ativo?: boolean): Promise<Premio[]> {
    const params = ativo !== undefined ? { ativo: String(ativo) } : {};
    const response = await api.get('/fidelizacao/premios', { params });
    return response.data.premios || [];
  }

  async criarPremio(premio: Omit<Premio, 'id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<Premio> {
    const response = await api.post('/fidelizacao/premios', {
      ...premio,
      data_inicio_utilizacoes: premio.data_inicio_utilizacoes instanceof Date 
        ? premio.data_inicio_utilizacoes.toISOString().split('T')[0]
        : premio.data_inicio_utilizacoes,
    });
    return response.data.premio;
  }

  async atualizarPremio(id: number, premio: Partial<Omit<Premio, 'id' | 'user_id' | 'created_at' | 'updated_at'>>): Promise<Premio> {
    const payload: any = { ...premio };
    // Sempre processar data_inicio_utilizacoes se estiver presente no objeto
    if ('data_inicio_utilizacoes' in premio) {
      payload.data_inicio_utilizacoes = premio.data_inicio_utilizacoes instanceof Date
        ? premio.data_inicio_utilizacoes.toISOString().split('T')[0]
        : premio.data_inicio_utilizacoes;
    }
    const response = await api.put(`/fidelizacao/premios/${id}`, payload);
    return response.data.premio;
  }

  async deletarPremio(id: number): Promise<void> {
    await api.delete(`/fidelizacao/premios/${id}`);
  }

  async listarClientesFidelidade(
    page: number = 1, 
    limit: number = 50, 
    search?: string,
    percentualMin?: number,
    percentualMax?: number,
    tipoServico?: TipoServico
  ): Promise<{ clientes: ClienteFidelidade[]; total: number }> {
    const params: any = { page: String(page), limit: String(limit) };
    if (search) {
      params.search = search;
    }
    if (percentualMin !== undefined) {
      params.percentualMin = String(percentualMin);
    }
    if (percentualMax !== undefined) {
      params.percentualMax = String(percentualMax);
    }
    if (tipoServico) {
      params.tipoServico = tipoServico;
    }
    const response = await api.get('/fidelizacao/clientes', { params });
    return response.data;
  }

  async obterFidelizacaoPorCpf(cpf: string): Promise<ClienteFidelidade | null> {
    try {
      const response = await api.get(`/fidelizacao/clientes/${cpf}`);
      return response.data.cliente || null;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async obterDistribuicaoPorPercentual(tipoServico?: TipoServico): Promise<Array<{ faixa: string; lavagem: number; secagem: number; total: number }>> {
    const params: any = {};
    if (tipoServico) {
      params.tipoServico = tipoServico;
    }
    const response = await api.get('/fidelizacao/clientes/distribuicao', { params });
    return response.data;
  }

  async apurarPremiosCliente(cpf: string): Promise<{ premiosConcedidos: number; premios: any[] }> {
    const response = await api.post(`/fidelizacao/clientes/${cpf}/apurar`);
    return response.data;
  }

  async listarConquistas(page: number = 1, limit: number = 50, cpf?: string, utilizado?: boolean): Promise<{ conquistas: Conquista[]; total: number }> {
    const params: any = { page: String(page), limit: String(limit) };
    if (cpf) params.cpf = cpf;
    if (utilizado !== undefined) params.utilizado = String(utilizado);
    const response = await api.get('/fidelizacao/conquistas', { params });
    return response.data;
  }

  async marcarPremioUtilizado(id: number, observacao?: string): Promise<any> {
    const response = await api.put(`/fidelizacao/conquistas/${id}/utilizar`, { observacao });
    return response.data.premio;
  }
}

export const fidelizacaoService = new FidelizacaoService();

