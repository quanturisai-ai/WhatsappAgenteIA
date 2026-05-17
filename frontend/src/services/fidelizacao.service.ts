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
  valor_voucher: number | null;
  quantidade_utilizacoes: number | null;
  gerar_automatico: boolean;
  entrega_automatico: boolean;
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
  nomeCliente?: string;
  telefoneCliente?: string;
  premioId: number;
  premioDescricao: string;
  premioServico: TipoServico;
  dataConquista: string;
  dataValidade: string | null;
  dataUtilizacao: string | null;
  utilizado: boolean;
  codigoVoucher: string | null;
  observacao: string | null;
  createdAt: string;
}

export interface PedidoDetalhado {
  id: number;
  cliente_nome: string;
  tipo_servico: 'LAVAGEM' | 'SECAGEM';
  data_pedido: Date;
  tipo_pagamento: string;
  contabilizado: boolean;
  pago_com_fidelidade: boolean;
  premio_id: number | null;
  premio_descricao: string | null;
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

  async obterPedidosDetalhados(cpf: string): Promise<{
    cliente: { nome: string; cpf: string };
    pedidos: PedidoDetalhado[];
  }> {
    const response = await api.get(`/fidelizacao/clientes/${cpf}/pedidos`);
    return response.data;
  }

  async registrarEntregaPremio(id: number, data: { codigo_voucher: string; data_validade: string; mensagem?: string }): Promise<any> {
    const response = await api.put(`/fidelizacao/conquistas/${id}/entrega`, data);
    return response.data;
  }

  async gerarVoucherConquista(id: number): Promise<{ codigo_voucher: string; data_validade: string }> {
    const response = await api.put(`/fidelizacao/conquistas/${id}/gerar-voucher`);
    return response.data;
  }

  /** Lista notificações enviadas (Config > Fidelização > Notificações) */
  async listarNotificacoes(params?: { search?: string; page?: number; limit?: number }): Promise<{
    notificacoes: Array<{
      id: number;
      cpf_cliente: string;
      pedido_id: number | null;
      data_venda: string | null;
      tipo_notificacao: 'CONQUISTA' | 'PROGRESSO' | 'ENTREGA' | 'IGNORADO';
      premio_id: number | null;
      mensagem_enviada: string | null;
      enviado_whatsapp: boolean;
      data_envio: string | null;
      erro: string | null;
      created_at: string;
      cliente_nome: string | null;
      cliente_telefone: string | null;
    }>;
    total: number;
  }> {
    const response = await api.get('/fidelizacao/notificacoes', { params: params || {} });
    return response.data;
  }

  /** Config de fidelização (inclui simulacao) */
  async getConfigFidelizacao(): Promise<{ config: { simulacao: boolean; [k: string]: any } }> {
    const response = await api.get('/fidelizacao/config');
    return response.data;
  }

  /** Ativar ou desativar simulação */
  async atualizarSimulacao(simulacao: boolean): Promise<{ config: any; message: string }> {
    const response = await api.patch('/fidelizacao/config/simulacao', { simulacao });
    return response.data;
  }

  /** Reenviar mensagem da notificação via WhatsApp */
  async reenviarNotificacao(id: number): Promise<{ success: boolean; error?: string }> {
    const response = await api.post(`/fidelizacao/notificacoes/${id}/reenviar`);
    return response.data;
  }

  // --- Automações (regras de fidelização) ---

  async getAutomacoesTipos(): Promise<FidelizacaoTipoGatilho[]> {
    const response = await api.get('/fidelizacao/automacoes/tipos');
    return response.data.tipos || [];
  }

  async getAutomacoesConfig(): Promise<FidelizacaoRegrasConfig> {
    const response = await api.get('/fidelizacao/automacoes/config');
    return response.data;
  }

  async updateAutomacoesConfig(data: Partial<FidelizacaoRegrasConfigUpsert>): Promise<FidelizacaoRegrasConfig> {
    const response = await api.put('/fidelizacao/automacoes/config', data);
    return response.data;
  }

  async listarRegrasAutomacoes(): Promise<FidelizacaoRegra[]> {
    const response = await api.get('/fidelizacao/automacoes/regras');
    return response.data.regras || [];
  }

  async getRegraAutomacao(id: number): Promise<FidelizacaoRegra> {
    const response = await api.get(`/fidelizacao/automacoes/regras/${id}`);
    return response.data;
  }

  async criarRegraAutomacao(data: FidelizacaoRegraCreate): Promise<FidelizacaoRegra> {
    const response = await api.post('/fidelizacao/automacoes/regras', data);
    return response.data;
  }

  async updateRegraAutomacao(id: number, data: Partial<FidelizacaoRegraCreate>): Promise<FidelizacaoRegra> {
    const response = await api.put(`/fidelizacao/automacoes/regras/${id}`, data);
    return response.data;
  }

  async deleteRegraAutomacao(id: number): Promise<void> {
    await api.delete(`/fidelizacao/automacoes/regras/${id}`);
  }

  async toggleRegraAutomacao(id: number): Promise<FidelizacaoRegra> {
    const response = await api.patch(`/fidelizacao/automacoes/regras/${id}/toggle`);
    return response.data;
  }

  async previewRegraAutomacaoById(id: number): Promise<PreviewRegraResult> {
    const response = await api.post(`/fidelizacao/automacoes/regras/${id}/preview`);
    return response.data;
  }

  async previewRegraAutomacaoByBody(data: FidelizacaoRegraCreate): Promise<PreviewRegraResult> {
    const response = await api.post('/fidelizacao/automacoes/regras/preview', data);
    return response.data;
  }
}

// Tipos para automações
export interface FidelizacaoTipoGatilho {
  id: number;
  codigo: string;
  nome_exibicao: string;
  descricao: string | null;
  parametros_schema: { campos: Array<{ nome: string; tipo: string; label: string; obrigatorio?: boolean; default?: number | string; min?: number; max?: number; placeholder?: string; placeholder_sql?: string }> };
  placeholders_disponiveis: string[];
  frequencia_minima_dias_default: number;
  ativo: boolean;
}

export interface FidelizacaoRegrasConfig {
  id: number;
  user_id: number;
  ativo: boolean;
  max_mensagens_por_cliente_semana: number;
  max_mensagens_por_cliente_mes: number;
  simulacao: boolean;
  created_at: string;
  updated_at: string;
}

export type FidelizacaoRegrasConfigUpsert = Omit<FidelizacaoRegrasConfig, 'id' | 'user_id' | 'created_at' | 'updated_at'>;

export interface SegmentacaoPublico {
  genero?: string | null;
  idade_min?: number | null;
  idade_max?: number | null;
  tempo_cadastro_min_dias?: number | null;
  qtd_compras_min?: number | null;
  qtd_compras_max?: number | null;
  valor_gasto_min?: number | null;
  valor_gasto_max?: number | null;
  qtd_compras_90_min?: number | null;
  cadastro_de?: string | null;
  cadastro_ate?: string | null;
  pedido_de?: string | null;
  pedido_ate?: string | null;
}

export interface FidelizacaoRegra {
  id: number;
  user_id: number;
  tipo_gatilho_id: number;
  nome_regra: string;
  parametros: Record<string, number | string>;
  segmentacao: SegmentacaoPublico | null;
  mensagem_template: string;
  frequencia_minima_dias: number;
  horario_inicio: string;
  horario_fim: string;
  vigencia_inicio: string;
  vigencia_fim: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export type FidelizacaoRegraCreate = Omit<FidelizacaoRegra, 'id' | 'created_at' | 'updated_at'>;

export interface PreviewRegraCliente {
  nome: string;
  cpf: string;
  telefone: string | null;
  dias_ausente?: number;
  data_ultima_visita?: string;
  data_nascimento?: string | null;
  data_cadastro?: string | null;
  data_ultima_compra?: string | null;
  qtd_compras?: number;
  mensagem_previa: string;
  status: 'qualificado' | 'bloqueado_frequencia' | 'bloqueado_saturacao' | 'bloqueado_antispam' | 'bloqueado_semanal' | 'bloqueado_mensal';
}

export interface PreviewRegraResult {
  total_qualificados: number;
  total_bloqueados_antispam: number;
  clientes: PreviewRegraCliente[];
}

export const fidelizacaoService = new FidelizacaoService();

