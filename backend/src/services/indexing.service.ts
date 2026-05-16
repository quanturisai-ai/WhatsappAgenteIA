import crypto from 'crypto';
import { ChromaDBService } from './chromadb.service';
import { OllamaService } from './ollama.service';
import { AgentConfigModel } from '../models/agentConfig.model';
import { TopicModel } from '../models/topic.model';
import { DocumentModel } from '../models/document.model';
import { MediaModel } from '../models/media.model';
import { DocumentChunkModel } from '../models/documentChunk.model';
import logger from '../utils/logger';
import pool from '../config/database';

export interface IndexableContent {
  id: string;
  type: 'agent_config' | 'topic' | 'document' | 'media';
  title: string;
  content: string;
  metadata: Record<string, any>;
  currentHash?: string;
  lastIndexedAt?: string; // ISO string format
  indexingStatus?: 'pending' | 'indexing' | 'indexed' | 'error';
}

export class IndexingService {
  private chromaService: ChromaDBService;
  private ollamaService: OllamaService;
  private agentConfigModel: AgentConfigModel;
  private topicModel: TopicModel;
  private documentModel: DocumentModel;
  private mediaModel: MediaModel;
  private chunkModel: DocumentChunkModel;

  constructor() {
    this.chromaService = new ChromaDBService();
    this.ollamaService = new OllamaService();
    this.agentConfigModel = new AgentConfigModel();
    this.topicModel = new TopicModel();
    this.documentModel = new DocumentModel();
    this.mediaModel = new MediaModel();
    this.chunkModel = new DocumentChunkModel();
  }

  /**
   * Calcular hash do conteúdo
   */
  private calculateHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Listar todo o conteúdo indexável com status
   */
  async listIndexableContent(userId: number): Promise<IndexableContent[]> {
    const contents: IndexableContent[] = [];

    try {
      // 1. Informações do Negócio (Agent Config)
      const agentConfig = await this.agentConfigModel.findByUserId(userId);
      if (agentConfig) {
        const content = this.buildAgentConfigContent(agentConfig);
        const hash = this.calculateHash(content);
        const configRow = agentConfig as any;
        contents.push({
          id: `agent_config_${agentConfig.id}`,
          type: 'agent_config',
          title: 'Informações do Negócio',
          content,
          metadata: {
            id: agentConfig.id,
            user_id: agentConfig.user_id,
            content_hash: configRow.content_hash,
          },
          currentHash: hash,
          lastIndexedAt: configRow.last_indexed_at ? (typeof configRow.last_indexed_at === 'string' ? configRow.last_indexed_at : new Date(configRow.last_indexed_at).toISOString()) : undefined,
          indexingStatus: (configRow.indexing_status as any) || 'pending',
        });
      }

      // 2. Tópicos
      const topics = await this.topicModel.findByUserId(userId);
      for (const topic of topics) {
        const content = this.buildTopicContent(topic);
        const hash = this.calculateHash(content);
        contents.push({
          id: `topic_${topic.id}`,
          type: 'topic',
          title: topic.title,
          content,
          metadata: {
            id: topic.id,
            user_id: topic.user_id,
            context: topic.context,
            priority: topic.priority,
            content_hash: topic.content_hash || undefined,
          },
          currentHash: hash,
          lastIndexedAt: topic.last_indexed_at ? new Date(topic.last_indexed_at).toISOString() : undefined,
          indexingStatus: (topic.indexing_status as 'pending' | 'indexing' | 'indexed' | 'error') || 'pending',
        });
      }

      // 3. Documentos
      const documents = await this.documentModel.findByUserId(userId);
      for (const doc of documents) {
        if (doc.status === 'completed') {
          const content = `Documento: ${doc.filename}`;
          const hash = this.calculateHash(`${doc.id}_${doc.updated_at}`);
          const docRow = doc as any;
          contents.push({
            id: `document_${doc.id}`,
            type: 'document',
            title: doc.filename,
            content,
            metadata: {
              id: doc.id,
              user_id: doc.user_id,
              filename: doc.filename,
              file_type: doc.file_type,
              content_hash: docRow.content_hash,
            },
            currentHash: hash,
            lastIndexedAt: docRow.last_indexed_at ? (typeof docRow.last_indexed_at === 'string' ? docRow.last_indexed_at : new Date(docRow.last_indexed_at).toISOString()) : undefined,
            indexingStatus: (docRow.indexing_status as any) || 'pending',
          });
        }
      }

      // 4. Mídias (apenas ativas)
      const medias = await this.mediaModel.findByUserId(userId);
      for (const media of medias) {
        // Apenas indexar mídias ativas
        if (media.is_active === false) {
          continue;
        }
        
        const content = this.buildMediaContent(media);
        const hash = this.calculateHash(content);
        const mediaRow = media as any;
        contents.push({
          id: `media_${media.id}`,
          type: 'media',
          title: media.title,
          content,
          metadata: {
            id: media.id,
            user_id: media.user_id,
            file_type: media.file_type,
            filename: media.filename,
            content_hash: mediaRow.content_hash,
          },
          currentHash: hash,
          lastIndexedAt: mediaRow.last_indexed_at ? (typeof mediaRow.last_indexed_at === 'string' ? mediaRow.last_indexed_at : new Date(mediaRow.last_indexed_at).toISOString()) : undefined,
          indexingStatus: (mediaRow.indexing_status as any) || 'pending',
        });
      }
    } catch (error: any) {
      logger.error(`Erro ao listar conteúdo indexável: ${error.message}`);
      throw error;
    }

    return contents;
  }

  /**
   * Construir conteúdo para indexação - Agent Config
   */
  private buildAgentConfigContent(config: any): string {
    const parts: string[] = [];
    
    if (config.business_name) parts.push(`Nome do Negócio: ${config.business_name}`);
    if (config.business_info) parts.push(`Informações: ${config.business_info}`);
    if (config.services) parts.push(`Serviços: ${config.services}`);
    if (config.hours) parts.push(`Horários: ${config.hours}`);
    if (config.personality) parts.push(`Personalidade: ${config.personality}`);
    
    return parts.join('\n\n');
  }

  /**
   * Construir conteúdo para indexação - Topic
   */
  private buildTopicContent(topic: any): string {
    const parts: string[] = [];
    
    parts.push(`Título: ${topic.title}`);
    parts.push(`Descrição: ${topic.description}`);
    
    if (topic.trigger_keywords && Array.isArray(topic.trigger_keywords)) {
      parts.push(`Palavras-chave: ${topic.trigger_keywords.join(', ')}`);
    }
    
    if (topic.context) {
      parts.push(`Contexto: ${topic.context}`);
    }
    
    return parts.join('\n\n');
  }

  /**
   * Construir conteúdo para indexação - Media
   */
  private buildMediaContent(media: any): string {
    return `Título: ${media.title}\n\nDescrição: ${media.description}\n\nTipo: ${media.file_type}`;
  }

  /**
   * Verificar se conteúdo precisa ser indexado
   */
  private needsIndexing(content: IndexableContent): boolean {
    // Se nunca foi indexado
    if (!content.lastIndexedAt) return true;
    
    // Se o status é pending ou error
    if (content.indexingStatus === 'pending' || content.indexingStatus === 'error') return true;
    
    // Se está indexando, não precisa reindexar
    if (content.indexingStatus === 'indexing') return false;
    
    // Se o hash mudou (conteúdo foi alterado)
    if (content.currentHash && content.metadata.content_hash) {
      return content.currentHash !== content.metadata.content_hash;
    }
    
    // Se não tem hash armazenado, precisa indexar
    if (!content.metadata.content_hash) return true;
    
    return false;
  }

  /**
   * Indexar um conteúdo específico
   */
  async indexContent(userId: number, content: IndexableContent): Promise<void> {
    try {
      // Atualizar status para indexing
      await this.updateIndexingStatus(content.type, content.metadata.id, 'indexing');

      // Gerar embedding
      // Obter modelo de embedding do AgentConfig
      const agentConfig = await this.agentConfigModel.findByUserId(userId);
      const embeddingModel = agentConfig?.embedding_model || undefined;
      
      const embedding = await this.ollamaService.generateEmbedding(content.content, embeddingModel);

      // Adicionar ou atualizar no ChromaDB (usar upsert para evitar erro de duplicata)
      await this.chromaService.upsertDocuments(userId, [
        {
          id: content.id,
          text: content.content,
          embedding,
          metadata: {
            ...content.metadata,
            type: content.type,
            title: content.title,
            content_hash: content.currentHash,
          },
        },
      ]);

      // Atualizar status e hash no banco
      await this.updateIndexingStatus(
        content.type,
        content.metadata.id,
        'indexed',
        content.currentHash
      );

      logger.info(`Conteúdo indexado: ${content.id}`);
    } catch (error: any) {
      logger.error(`Erro ao indexar conteúdo ${content.id}: ${error.message}`);
      
      // Atualizar status para error
      await this.updateIndexingStatus(content.type, content.metadata.id, 'error');
      
      // Melhorar mensagem de erro para erros de conexão com ChromaDB
      if (error.isConnectionError || error.message?.includes('Failed to connect') || error.message?.includes('ChromaDB não está disponível')) {
        const improvedError: any = new Error(error.message || 'ChromaDB não está disponível. Verifique se o servidor ChromaDB está rodando.');
        improvedError.statusCode = error.statusCode || 503;
        throw improvedError;
      }
      
      throw error;
    }
  }

  /**
   * Indexar todos os conteúdos pendentes
   */
  async indexAllPending(userId: number): Promise<{ total: number; indexed: number; errors: number }> {
    try {
      const contents = await this.listIndexableContent(userId);
      const pendingContents = contents.filter(c => this.needsIndexing(c));

      logger.info(`Iniciando indexação de ${pendingContents.length} conteúdos para usuário ${userId}`);

      let indexed = 0;
      let errors = 0;

      for (const content of pendingContents) {
        try {
          if (content.type === 'document') {
            await this.indexDocument(userId, content.metadata.id);
          } else {
            await this.indexContent(userId, content);
          }
          indexed++;
        } catch (error: any) {
          logger.error(`Erro ao indexar ${content.id}: ${error.message}`);
          errors++;
        }
      }

      logger.info(`Indexação concluída: ${indexed} indexados, ${errors} erros`);

      return {
        total: pendingContents.length,
        indexed,
        errors,
      };
    } catch (error: any) {
      logger.error(`Erro ao indexar todos os conteúdos: ${error.message}`);
      throw error;
    }
  }

  /**
   * Indexar documento completo (com chunks)
   */
  async indexDocument(userId: number, documentId: number): Promise<void> {
    try {
      const doc = await this.documentModel.findById(documentId);
      if (!doc || doc.user_id !== userId) {
        throw new Error('Documento não encontrado');
      }

      // Atualizar status
      await this.updateIndexingStatus('document', documentId, 'indexing');

      // Buscar chunks do documento
      const chunks = await this.chunkModel.findByDocumentId(documentId);

      if (chunks.length === 0) {
        throw new Error('Documento não possui chunks');
      }

      // Obter modelo de embedding do AgentConfig
      const agentConfig = await this.agentConfigModel.findByUserId(userId);
      const embeddingModel = agentConfig?.embedding_model || undefined;

      // Gerar embeddings para todos os chunks (usando modelo do AgentConfig)
      const texts = chunks.map(c => c.chunk_text);
      const embeddings = await this.ollamaService.generateEmbeddings(texts, embeddingModel);

      // Preparar documentos para ChromaDB
      const chromaDocuments = chunks.map((chunk, index) => ({
        id: `doc_${documentId}_chunk_${chunk.chunk_index}`,
        text: chunk.chunk_text,
        embedding: embeddings[index],
        metadata: {
          type: 'document',
          document_id: documentId,
          chunk_index: chunk.chunk_index,
          filename: doc.filename,
        },
      }));

      // Adicionar ou atualizar no ChromaDB (usar upsert para evitar erro de duplicata)
      await this.chromaService.upsertDocuments(userId, chromaDocuments);

      // Atualizar status
      const hash = this.calculateHash(`${documentId}_${doc.updated_at}`);
      await this.updateIndexingStatus('document', documentId, 'indexed', hash);

      logger.info(`Documento ${documentId} indexado com ${chunks.length} chunks`);
    } catch (error: any) {
      logger.error(`Erro ao indexar documento ${documentId}: ${error.message}`);
      await this.updateIndexingStatus('document', documentId, 'error');
      
      // Melhorar mensagem de erro para erros de conexão com ChromaDB
      if (error.isConnectionError || error.message?.includes('Failed to connect') || error.message?.includes('ChromaDB não está disponível')) {
        const improvedError: any = new Error(error.message || 'ChromaDB não está disponível. Verifique se o servidor ChromaDB está rodando.');
        improvedError.statusCode = error.statusCode || 503;
        throw improvedError;
      }
      
      throw error;
    }
  }

  /**
   * Atualizar status de indexação no banco
   */
  private async updateIndexingStatus(
    type: 'agent_config' | 'topic' | 'document' | 'media',
    id: number,
    status: 'pending' | 'indexing' | 'indexed' | 'error',
    contentHash?: string
  ): Promise<void> {
    const conn = await pool.getConnection();
    try {
      const now = new Date();
      
      let query = '';
      let params: any[] = [];

      switch (type) {
        case 'agent_config':
          query = `UPDATE agent_config SET indexing_status = ?, last_indexed_at = ?`;
          params = [status, now];
          if (contentHash) {
            query += `, content_hash = ?`;
            params.push(contentHash);
          }
          query += ` WHERE id = ?`;
          params.push(id);
          break;

        case 'topic':
          query = `UPDATE topics SET indexing_status = ?, last_indexed_at = ?`;
          params = [status, now];
          if (contentHash) {
            query += `, content_hash = ?`;
            params.push(contentHash);
          }
          query += ` WHERE id = ?`;
          params.push(id);
          break;

        case 'document':
          query = `UPDATE documents SET indexing_status = ?, last_indexed_at = ?`;
          params = [status, now];
          if (contentHash) {
            query += `, content_hash = ?`;
            params.push(contentHash);
          }
          query += ` WHERE id = ?`;
          params.push(id);
          break;

        case 'media':
          query = `UPDATE medias SET indexing_status = ?, last_indexed_at = ?`;
          params = [status, now];
          if (contentHash) {
            query += `, content_hash = ?`;
            params.push(contentHash);
          }
          query += ` WHERE id = ?`;
          params.push(id);
          break;
      }

      const result = await conn.query(query, params);
      logger.debug(`Status de indexação atualizado: type=${type}, id=${id}, status=${status}, hash=${contentHash || 'não fornecido'}`);
      
      // Verificar se a atualização afetou alguma linha
      const affectedRows = Array.isArray(result) ? (result[0]?.affectedRows || result[0]?.affected_rows || 0) : (result?.affectedRows || result?.affected_rows || 0);
      if (affectedRows === 0) {
        logger.warn(`Nenhuma linha foi atualizada ao atualizar status de indexação: type=${type}, id=${id}`);
      }
    } catch (error: any) {
      logger.error(`Erro ao atualizar status de indexação: type=${type}, id=${id}, status=${status}, error=${error.message}`);
      throw error;
    } finally {
      conn.release();
    }
  }

  /**
   * Reindexar conteúdo específico
   */
  async reindexContent(userId: number, type: string, id: number): Promise<void> {
    if (type === 'document') {
      await this.indexDocument(userId, id);
    } else {
      const contents = await this.listIndexableContent(userId);
      const content = contents.find(c => c.type === type && c.metadata.id === id);

      if (!content) {
        throw new Error('Conteúdo não encontrado');
      }

      await this.indexContent(userId, content);
    }
  }
}

