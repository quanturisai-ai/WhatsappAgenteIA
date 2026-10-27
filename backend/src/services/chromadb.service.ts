import { ChromaClient } from 'chromadb';
import logger from '../utils/logger';

export class ChromaDBService {
  private client: ChromaClient;
  private collections: Map<string, any> = new Map();

  constructor() {
    const chromaHost = process.env.CHROMA_HOST || 'localhost';
    const chromaPort = process.env.CHROMA_PORT || '8000';
    const chromaUrl = `http://${chromaHost}:${chromaPort}`;

    // Conectar ao servidor ChromaDB
    this.client = new ChromaClient({
      path: chromaUrl,
    });

    logger.info(`ChromaDB configurado para conectar em: ${chromaUrl}`);
  }

  /**
   * Obter ou criar coleção para um usuário
   */
  async getOrCreateCollection(userId: number): Promise<any> {
    const collectionName = `user_${userId}`;

    if (this.collections.has(collectionName)) {
      return this.collections.get(collectionName)!;
    }

    try {
      // Verificar se a coleção já existe
      let collection: any;
      
      try {
        // Tentar obter a coleção existente primeiro
        collection = await this.client.getCollection({
          name: collectionName,
          // @ts-ignore - embeddingFunction é opcional no nosso caso
        });
        logger.debug(`Coleção ChromaDB existente obtida para usuário ${userId}`);
      } catch (getError: any) {
        // Se não existir, criar nova coleção
        if (getError.message?.includes('not found') || getError.message?.includes('does not exist')) {
          try {
            collection = await this.client.createCollection({
              name: collectionName,
            });
            logger.info(`Coleção ChromaDB criada para usuário ${userId}`);
          } catch (createError: any) {
            // Se falhar ao criar (pode ser que já existe), tentar obter novamente
            if (createError.message?.includes('already exists') || createError.message?.includes('The resource already exists')) {
              collection = await this.client.getCollection({
                name: collectionName,
                // @ts-ignore - embeddingFunction é opcional no nosso caso
              });
              logger.debug(`Coleção ChromaDB obtida após tentativa de criação (já existia) para usuário ${userId}`);
            } else {
              throw createError;
            }
          }
        } else {
          throw getError;
        }
      }

      this.collections.set(collectionName, collection);
      return collection;
    } catch (error: any) {
      logger.error(`Erro ao obter/criar coleção ChromaDB: ${error.message}`);
      
      // Verificar se é um erro de conexão
      if (error.message?.includes('Failed to connect') || error.message?.includes('ECONNREFUSED') || error.message?.includes('connect')) {
        const chromaHost = process.env.CHROMA_HOST || 'localhost';
        const chromaPort = process.env.CHROMA_PORT || '8000';
        const errorMessage = `ChromaDB não está disponível em ${chromaHost}:${chromaPort}. Verifique se o servidor ChromaDB está rodando.`;
        const connectionError: any = new Error(errorMessage);
        connectionError.statusCode = 503; // Service Unavailable
        connectionError.isConnectionError = true;
        throw connectionError;
      }
      
      throw error;
    }
  }

  /**
   * Adicionar documentos à coleção
   */
  async addDocuments(
    userId: number,
    documents: Array<{
      id: string;
      text: string;
      embedding: number[];
      metadata?: Record<string, any>;
    }>
  ): Promise<void> {
    try {
      const collection = await this.getOrCreateCollection(userId);

      const ids = documents.map((doc) => doc.id);
      const embeddings = documents.map((doc) => doc.embedding);
      const texts = documents.map((doc) => doc.text);
      const metadatas = documents.map((doc) => doc.metadata || {});

      await collection.add({
        ids,
        embeddings,
        documents: texts,
        metadatas,
      });

      logger.info(`Adicionados ${documents.length} documentos à coleção do usuário ${userId}`);
    } catch (error: any) {
      logger.error(`Erro ao adicionar documentos ao ChromaDB: ${error.message}`);
      throw error;
    }
  }

  /**
   * Adicionar ou atualizar documentos na coleção (upsert)
   * Se o documento já existir, será atualizado; caso contrário, será adicionado
   */
  async upsertDocuments(
    userId: number,
    documents: Array<{
      id: string;
      text: string;
      embedding: number[];
      metadata?: Record<string, any>;
    }>
  ): Promise<void> {
    const collectionName = `user_${userId}`;
    const ids = documents.map((doc) => doc.id);
    const embeddings = documents.map((doc) => doc.embedding);
    const texts = documents.map((doc) => doc.text);
    const metadatas = documents.map((doc) => doc.metadata || {});

    const doUpsert = async () => {
      const collection = await this.getOrCreateCollection(userId);
      await collection.upsert({ ids, embeddings, documents: texts, metadatas });
    };

    try {
      try {
        await doUpsert();
      } catch (firstError: any) {
        if (
          firstError.message?.includes('not found') ||
          firstError.message?.includes('does not exist') ||
          firstError.message?.includes('could not be found')
        ) {
          logger.warn(`[ChromaDB] Coleção ${collectionName} stale no cache — reconectando...`);
          this.collections.delete(collectionName);
          await doUpsert();
        } else {
          throw firstError;
        }
      }
      logger.info(`Adicionados/atualizados ${documents.length} documentos na coleção do usuário ${userId}`);
    } catch (error: any) {
      logger.error(`Erro ao adicionar/atualizar documentos no ChromaDB: ${error.message}`);
      throw error;
    }
  }

  /**
   * Buscar documentos similares
   */
  async query(
    userId: number,
    queryEmbedding: number[],
    nResults: number = 5,
    maxDistance?: number
  ): Promise<Array<{ id: string; text: string; distance: number; metadata?: Record<string, any> }>> {
    const collectionName = `user_${userId}`;

    const doQuery = async () => {
      const collection = await this.getOrCreateCollection(userId);
      const searchResults = maxDistance !== undefined ? Math.max(nResults * 2, 10) : nResults;
      return collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: searchResults,
      });
    };

    try {
      let results: any;
      try {
        results = await doQuery();
      } catch (firstError: any) {
        // Se a coleção foi recriada (ID diferente do cacheado), limpar cache e tentar novamente
        if (
          firstError.message?.includes('not found') ||
          firstError.message?.includes('does not exist') ||
          firstError.message?.includes('could not be found')
        ) {
          logger.warn(`[ChromaDB] Coleção ${collectionName} não encontrada no cache — limpando e reconectando...`);
          this.collections.delete(collectionName);
          results = await doQuery();
        } else {
          throw firstError;
        }
      }

      if (!results.documents || results.documents.length === 0) {
        return [];
      }

      const documents: Array<{
        id: string;
        text: string;
        distance: number;
        metadata?: Record<string, any>;
      }> = [];

      for (let i = 0; i < results.ids[0].length; i++) {
        const distance = results.distances?.[0]?.[i] || 0;
        
        if (maxDistance !== undefined && distance >= maxDistance) {
          continue;
        }

        documents.push({
          id: results.ids[0][i],
          text: results.documents[0][i],
          distance,
          metadata: results.metadatas?.[0]?.[i] || {},
        });
      }

      return documents.slice(0, nResults);
    } catch (error: any) {
      logger.error(`Erro ao buscar documentos no ChromaDB: ${error.message}`);
      throw error;
    }
  }

  /**
   * Deletar documentos da coleção
   */
  async deleteDocuments(userId: number, documentIds: string[]): Promise<void> {
    try {
      const collection = await this.getOrCreateCollection(userId);

      await collection.delete({
        ids: documentIds,
      });

      logger.info(`Deletados ${documentIds.length} documentos da coleção do usuário ${userId}`);
    } catch (error: any) {
      logger.error(`Erro ao deletar documentos do ChromaDB: ${error.message}`);
      throw error;
    }
  }

  /**
   * Deletar coleção do usuário
   */
  async deleteCollection(userId: number): Promise<void> {
    try {
      const collectionName = `user_${userId}`;
      await this.client.deleteCollection({
        name: collectionName,
      });

      this.collections.delete(collectionName);
      logger.info(`Coleção ChromaDB deletada para usuário ${userId}`);
    } catch (error: any) {
      logger.error(`Erro ao deletar coleção ChromaDB: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obter contagem de documentos na coleção
   */
  async getCollectionCount(userId: number): Promise<number> {
    try {
      const collection = await this.getOrCreateCollection(userId);
      const count = await collection.count();
      return count;
    } catch (error: any) {
      logger.error(`Erro ao contar documentos do ChromaDB: ${error.message}`);
      return 0;
    }
  }
}

