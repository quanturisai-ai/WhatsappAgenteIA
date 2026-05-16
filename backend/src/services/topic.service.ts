import logger from '../utils/logger';
import { TopicModel } from '../models/topic.model';
import { Topic } from '../types';

export class TopicService {
  private topicModel: TopicModel;

  constructor() {
    this.topicModel = new TopicModel();
  }

  /**
   * Listar todos os tópicos do usuário
   */
  async listTopics(userId: number): Promise<Topic[]> {
    try {
      const topics = await this.topicModel.findByUserId(userId);
      return topics;
    } catch (error: any) {
      logger.error(`Erro ao listar tópicos: ${error.message}`);
      throw error;
    }
  }

  /**
   * Listar apenas tópicos ativos do usuário
   */
  async listActiveTopics(userId: number): Promise<Topic[]> {
    try {
      const topics = await this.topicModel.findActiveByUserId(userId);
      return topics;
    } catch (error: any) {
      logger.error(`Erro ao listar tópicos ativos: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obter tópico por ID
   */
  async getTopicById(topicId: number, userId: number): Promise<Topic | null> {
    try {
      const topic = await this.topicModel.findById(topicId);
      
      if (!topic) {
        return null;
      }

      if (topic.user_id !== userId) {
        throw new Error('Não autorizado a acessar este tópico');
      }

      return topic;
    } catch (error: any) {
      logger.error(`Erro ao obter tópico: ${error.message}`);
      throw error;
    }
  }

  /**
   * Criar novo tópico
   */
  async createTopic(
    userId: number,
    title: string,
    description: string,
    triggerKeywords: string[],
    context: 'greeting' | 'farewell' | 'absence' | 'special_date' | 'custom',
    priority: number,
    isActive: boolean
  ): Promise<Topic> {
    try {
      // Validar dados
      if (!title.trim()) {
        throw new Error('Título é obrigatório');
      }

      if (!description.trim()) {
        throw new Error('Descrição é obrigatória');
      }

      // Verificar se já existe tópico com mesmo título para o usuário
      const existingTopics = await this.topicModel.findByUserId(userId);
      const duplicateTitle = existingTopics.find(
        t => t.title.toLowerCase().trim() === title.toLowerCase().trim()
      );

      if (duplicateTitle) {
        throw new Error('Já existe um tópico com este título');
      }

      // Garantir que triggerKeywords seja sempre um array
      const keywordsArray = Array.isArray(triggerKeywords) ? triggerKeywords : [];

      const topic = await this.topicModel.create({
        user_id: userId,
        title: title.trim(),
        description: description.trim(),
        trigger_keywords: keywordsArray,
        context: context || 'custom',
        priority: priority || 0,
        is_active: isActive !== undefined ? isActive : true,
      });

      logger.info(`Tópico criado: ${title} (ID: ${topic.id}) com ${keywordsArray.length} palavras-chave`);
      logger.debug(`Palavras-chave: ${JSON.stringify(keywordsArray)}`);
      return topic;
    } catch (error: any) {
      logger.error(`Erro ao criar tópico: ${error.message}`);
      throw error;
    }
  }

  /**
   * Atualizar tópico
   */
  async updateTopic(
    topicId: number,
    userId: number,
    updates: {
      title?: string;
      description?: string;
      triggerKeywords?: string[];
      context?: 'greeting' | 'farewell' | 'absence' | 'special_date' | 'custom';
      priority?: number;
      isActive?: boolean;
    }
  ): Promise<Topic> {
    try {
      const topic = await this.topicModel.findById(topicId);
      
      if (!topic) {
        throw new Error('Tópico não encontrado');
      }

      if (topic.user_id !== userId) {
        throw new Error('Não autorizado a atualizar este tópico');
      }

      // Validar título se estiver sendo atualizado
      if (updates.title !== undefined && !updates.title.trim()) {
        throw new Error('Título é obrigatório');
      }

      // Validar descrição se estiver sendo atualizada
      if (updates.description !== undefined && !updates.description.trim()) {
        throw new Error('Descrição é obrigatória');
      }

      // Verificar duplicata de título se estiver sendo atualizado
      if (updates.title !== undefined && updates.title.trim() !== topic.title) {
        const existingTopics = await this.topicModel.findByUserId(userId);
        const duplicateTitle = existingTopics.find(
          t => t.id !== topicId && t.title.toLowerCase().trim() === updates.title!.toLowerCase().trim()
        );

        if (duplicateTitle) {
          throw new Error('Já existe um tópico com este título');
        }
      }

      const updateData: any = {};
      if (updates.title !== undefined) updateData.title = updates.title.trim();
      if (updates.description !== undefined) updateData.description = updates.description.trim();
      // Sempre salvar triggerKeywords se fornecido (mesmo que seja array vazio)
      if (updates.triggerKeywords !== undefined) {
        updateData.trigger_keywords = Array.isArray(updates.triggerKeywords) ? updates.triggerKeywords : [];
        logger.debug(`Atualizando trigger_keywords para tópico ${topicId}: ${JSON.stringify(updateData.trigger_keywords)}`);
      }
      if (updates.context !== undefined) updateData.context = updates.context;
      if (updates.priority !== undefined) updateData.priority = updates.priority;
      if (updates.isActive !== undefined) updateData.is_active = updates.isActive;

      const updatedTopic = await this.topicModel.update(topicId, updateData);

      if (!updatedTopic) {
        throw new Error('Erro ao atualizar tópico');
      }

      logger.info(`Tópico atualizado: ${updatedTopic.title} (ID: ${topicId})`);
      return updatedTopic;
    } catch (error: any) {
      logger.error(`Erro ao atualizar tópico: ${error.message}`);
      throw error;
    }
  }

  /**
   * Deletar tópico
   */
  async deleteTopic(topicId: number, userId: number): Promise<void> {
    try {
      const topic = await this.topicModel.findById(topicId);
      
      if (!topic) {
        throw new Error('Tópico não encontrado');
      }

      if (topic.user_id !== userId) {
        throw new Error('Não autorizado a deletar este tópico');
      }

      const deleted = await this.topicModel.delete(topicId);
      
      if (!deleted) {
        throw new Error('Erro ao deletar tópico');
      }

      logger.info(`Tópico deletado: ${topic.title} (ID: ${topicId})`);
    } catch (error: any) {
      logger.error(`Erro ao deletar tópico: ${error.message}`);
      throw error;
    }
  }
}

