import api from './api';
import { Topic } from '../types';

// Transformar tópico do backend (snake_case) para frontend (camelCase)
const transformTopic = (topic: any): Topic => ({
  id: topic.id,
  title: topic.title,
  description: topic.description,
  triggerKeywords: Array.isArray(topic.triggerKeywords) 
    ? topic.triggerKeywords 
    : (Array.isArray(topic.trigger_keywords) 
        ? topic.trigger_keywords 
        : []),
  context: topic.context,
  priority: topic.priority,
  isActive: topic.isActive !== undefined ? topic.isActive : (topic.is_active !== undefined ? topic.is_active : true),
  createdAt: topic.createdAt || topic.created_at,
  updatedAt: topic.updatedAt || topic.updated_at,
});

export const topicService = {
  async listTopics(activeOnly?: boolean): Promise<Topic[]> {
    const params = activeOnly ? { activeOnly: 'true' } : {};
    const response = await api.get<{ topics: any[] }>('/topics/list', { params });
    return response.data.topics.map(transformTopic);
  },

  async getTopic(id: number): Promise<Topic> {
    const response = await api.get<{ topic: any }>(`/topics/${id}`);
    return transformTopic(response.data.topic);
  },

  async createTopic(topic: Omit<Topic, 'id' | 'createdAt' | 'updatedAt'>): Promise<Topic> {
    // Garantir que triggerKeywords seja sempre um array
    const triggerKeywords = Array.isArray(topic.triggerKeywords) ? topic.triggerKeywords : [];
    console.log('Criando tópico com palavras-chave:', triggerKeywords);
    
    const response = await api.post<{ topic: any }>('/topics', {
      title: topic.title,
      description: topic.description,
      triggerKeywords: triggerKeywords,
      context: topic.context,
      priority: topic.priority,
      isActive: topic.isActive,
    });
    return transformTopic(response.data.topic);
  },

  async updateTopic(id: number, topic: Partial<Omit<Topic, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Topic> {
    // Garantir que triggerKeywords seja sempre um array se fornecido
    const triggerKeywords = topic.triggerKeywords !== undefined 
      ? (Array.isArray(topic.triggerKeywords) ? topic.triggerKeywords : [])
      : undefined;
    console.log('Atualizando tópico com palavras-chave:', triggerKeywords);
    
    const response = await api.put<{ topic: any }>(`/topics/${id}`, {
      title: topic.title,
      description: topic.description,
      triggerKeywords: triggerKeywords,
      context: topic.context,
      priority: topic.priority,
      isActive: topic.isActive,
    });
    return transformTopic(response.data.topic);
  },

  async deleteTopic(id: number): Promise<void> {
    await api.delete(`/topics/${id}`);
  },
};

