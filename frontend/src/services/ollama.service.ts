import api from './api';
import { OllamaModel } from '../types';

export const ollamaService = {
  async listModels(): Promise<OllamaModel[]> {
    const response = await api.get<{ models: OllamaModel[] }>('/ollama/models');
    return response.data.models;
  },

  async checkHealth(): Promise<boolean> {
    try {
      const response = await api.get<{ healthy: boolean }>('/ollama/health');
      return response.data.healthy;
    } catch (error) {
      return false;
    }
  },
};

