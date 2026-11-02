import api from './api';
import { AgentConfig, ModeloCatalogo } from '../types';

export const agentConfigService = {
  async getConfig(): Promise<AgentConfig> {
    const response = await api.get<{ config: AgentConfig }>('/agent-config');
    return response.data.config;
  },

  async updateConfig(config: Partial<AgentConfig>): Promise<AgentConfig & { avisos?: string[] }> {
    const response = await api.put<{ config: AgentConfig; message: string; avisos?: string[] }>('/agent-config', config);
    return { ...response.data.config, avisos: response.data.avisos };
  },

  /** Etapa 6: catálogo do OpenRouter (o que cada modelo aceita e o preço). */
  async listarModelos(atualizar = false): Promise<ModeloCatalogo[]> {
    const response = await api.get<{ modelos: ModeloCatalogo[] }>('/agent-config/modelos', { params: atualizar ? { atualizar: 1 } : {} });
    return response.data.modelos || [];
  },
};

