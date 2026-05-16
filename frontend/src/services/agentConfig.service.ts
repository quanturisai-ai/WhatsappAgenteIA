import api from './api';
import { AgentConfig } from '../types';

export const agentConfigService = {
  async getConfig(): Promise<AgentConfig> {
    const response = await api.get<{ config: AgentConfig }>('/agent-config');
    return response.data.config;
  },

  async updateConfig(config: Partial<AgentConfig>): Promise<AgentConfig> {
    const response = await api.put<{ config: AgentConfig; message: string }>('/agent-config', config);
    return response.data.config;
  },
};

