import api from './api';

export interface VmLavCredentials {
  id: number;
  user_id: number;
  email: string;
  senha?: string; // Senha em texto plano (não criptografada)
  token_expira_em: string | null;
  ultima_sincronizacao: string | null;
  ultimo_erro: string | null;
  status: 'ativo' | 'inativo' | 'erro';
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface VmLavCliente {
  id: number;
  id_cliente_vm: number;
  nome: string | null;
  data_nascimento: string | null;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  genero: string | null;
  data_cadastro: string | null;
  data_ultima_compra: string | null;
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
  created_at: string;
  updated_at: string;
}

export interface ListarClientesResponse {
  clientes: VmLavCliente[];
  total: number;
  page: number;
  limit: number;
}

export const vmLavService = {
  /**
   * Configurar credenciais VM Lav
   */
  async configurarCredenciais(email: string, senha: string): Promise<{ message: string; credentialsId?: number; captchaReady?: boolean }> {
    const response = await api.post('/vmlav/credentials', { email, senha });
    return response.data;
  },

  /**
   * Obter credenciais VM Lav
   */
  async obterCredenciais(): Promise<{ credentials: VmLavCredentials | null; message?: string }> {
    const response = await api.get('/vmlav/credentials');
    return response.data;
  },

  /**
   * Testar conexão VM Lav
   */
  async testarConexao(): Promise<{ message: string; total?: number }> {
    const response = await api.post('/vmlav/test-connection');
    return response.data;
  },

  /**
   * Sincronizar clientes
   */
  async sincronizarClientes(): Promise<{ message: string; total?: number }> {
    const response = await api.post('/vmlav/sync');
    return response.data;
  },

  /**
   * Listar clientes
   */
  async listarClientes(options: {
    page?: number;
    limit?: number;
    search?: string;
    orderBy?: string;
    orderDir?: 'ASC' | 'DESC';
  } = {}): Promise<ListarClientesResponse> {
    const params = new URLSearchParams();
    if (options.page) params.append('page', options.page.toString());
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.search) params.append('search', options.search);
    if (options.orderBy) params.append('orderBy', options.orderBy);
    if (options.orderDir) params.append('orderDir', options.orderDir);

    const response = await api.get(`/vmlav/clientes?${params.toString()}`);
    return response.data;
  },

  /**
   * Fechar navegador Puppeteer
   */
  async fecharNavegador(): Promise<{ message: string }> {
    const response = await api.post('/vmlav/close-browser');
    return response.data;
  },
};

