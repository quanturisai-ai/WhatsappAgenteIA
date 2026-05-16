import api from './api';

export interface IndexableContent {
  id: string;
  type: 'agent_config' | 'topic' | 'document' | 'media';
  title: string;
  content: string;
  metadata: Record<string, any>;
  currentHash?: string;
  lastIndexedAt?: string;
  indexingStatus?: 'pending' | 'indexing' | 'indexed' | 'error';
}

export interface IndexingStats {
  total: number;
  indexed: number;
  pending: number;
  indexing: number;
  error: number;
}

export const indexingService = {
  async listContents(): Promise<IndexableContent[]> {
    const response = await api.get<{ contents: IndexableContent[] }>('/indexing/list');
    return response.data.contents;
  },

  async getStatus(): Promise<{ stats: IndexingStats; contents: IndexableContent[] }> {
    const response = await api.get<{ stats: IndexingStats; contents: IndexableContent[] }>('/indexing/status');
    return response.data;
  },

  async startIndexing(): Promise<{ message: string }> {
    const response = await api.post<{ message: string }>('/indexing/start');
    return response.data;
  },

  async indexContent(type: string, id: number): Promise<{ message: string }> {
    const response = await api.post<{ message: string }>(`/indexing/${type}/${id}`);
    return response.data;
  },
};

