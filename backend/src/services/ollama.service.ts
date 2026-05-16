import axios, { AxiosInstance } from 'axios';
import http from 'http';
import https from 'https';
import logger from '../utils/logger';

export class OllamaService {
  private baseUrl: string;
  private defaultEmbeddingModel: string;
  private defaultGenerationModel: string;
  private defaultKeepAlive: string;
  private axiosInstance: AxiosInstance;
  private httpAgent: http.Agent;
  private httpsAgent: https.Agent;

  constructor() {
    this.baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.defaultEmbeddingModel = process.env.OLLAMA_EMBEDDING_MODEL || process.env.OLLAMA_MODEL || 'deepseek-r1';
    this.defaultGenerationModel = process.env.OLLAMA_GENERATION_MODEL || process.env.OLLAMA_MODEL || 'deepseek-r1';
    // Keep-alive padrão: 5 minutos (configurável via OLLAMA_KEEP_ALIVE)
    this.defaultKeepAlive = process.env.OLLAMA_KEEP_ALIVE || '5m';
    
    // Criar agentes HTTP com keep-alive para reutilizar conexões TCP
    this.httpAgent = new http.Agent({
      keepAlive: true,
      keepAliveMsecs: 1000,
      maxSockets: 5,
      maxFreeSockets: 2,
    });

    this.httpsAgent = new https.Agent({
      keepAlive: true,
      keepAliveMsecs: 1000,
      maxSockets: 5,
      maxFreeSockets: 2,
    });

    // Criar instância compartilhada do axios com keep-alive HTTP
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      httpAgent: this.httpAgent,
      httpsAgent: this.httpsAgent,
      headers: {
        'Connection': 'keep-alive',
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    });
    
    logger.info(`OllamaService inicializado:`);
    logger.info(`  - Base URL: ${this.baseUrl}`);
    logger.info(`  - Modelo padrão para embeddings: ${this.defaultEmbeddingModel}`);
    logger.info(`  - Modelo padrão para geração: ${this.defaultGenerationModel}`);
    logger.info(`  - Keep-alive padrão: ${this.defaultKeepAlive}`);
    logger.info(`  - HTTP Keep-alive: Habilitado`);
  }

  /**
   * Gerar embeddings usando Ollama
   */
  async generateEmbedding(text: string, model?: string): Promise<number[]> {
    try {
      const embeddingModel = model || this.defaultEmbeddingModel;
      
      logger.debug(`Gerando embedding com modelo: ${embeddingModel}`);
      
      const response = await this.axiosInstance.post('/api/embeddings', {
        model: embeddingModel,
        prompt: text,
        keep_alive: this.defaultKeepAlive,
      });

      if (response.data && response.data.embedding) {
        return response.data.embedding;
      }

      throw new Error('Resposta do Ollama não contém embedding');
    } catch (error: any) {
      const embeddingModel = model || this.defaultEmbeddingModel;
      logger.error(`Erro ao gerar embedding com modelo '${embeddingModel}': ${error.message}`);
      if (error.response) {
        logger.error(`Status: ${error.response.status}, Dados: ${JSON.stringify(error.response.data)}`);
        if (error.response.status === 404) {
          throw new Error(`Modelo '${embeddingModel}' não encontrado no Ollama. Verifique se o modelo está instalado.`);
        }
        if (error.response.status === 500 && error.response.data?.error?.includes('does not support embeddings')) {
          throw new Error(`Modelo '${embeddingModel}' não suporta embeddings. Use um modelo que suporte embeddings.`);
        }
      }
      throw new Error(`Erro ao gerar embedding: ${error.message}`);
    }
  }

  /**
   * Gerar embeddings para múltiplos textos
   */
  async generateEmbeddings(texts: string[], model?: string): Promise<number[][]> {
    try {
      const embeddings: number[][] = [];

      for (const text of texts) {
        const embedding = await this.generateEmbedding(text, model);
        embeddings.push(embedding);
      }

      return embeddings;
    } catch (error: any) {
      logger.error(`Erro ao gerar embeddings em lote: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verificar se o Ollama está disponível
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await this.axiosInstance.get('/api/tags');
      return response.status === 200;
    } catch (error: any) {
      logger.error(`Ollama não está disponível: ${error.message}`);
      return false;
    }
  }

  /**
   * Verificar se o modelo está disponível
   */
  async checkModel(model?: string): Promise<boolean> {
    try {
      const modelToCheck = model || this.defaultGenerationModel;
      const response = await this.axiosInstance.get('/api/tags');
      const models = response.data.models || [];
      return models.some((m: any) => m.name === modelToCheck);
    } catch (error: any) {
      logger.error(`Erro ao verificar modelo: ${error.message}`);
      return false;
    }
  }

  /**
   * Listar todos os modelos disponíveis no Ollama
   */
  async listModels(): Promise<Array<{ name: string; size: number; modified_at: string }>> {
    try {
      const response = await this.axiosInstance.get('/api/tags');
      const models = response.data.models || [];
      return models.map((m: any) => ({
        name: m.name,
        size: m.size || 0,
        modified_at: m.modified_at || '',
      }));
    } catch (error: any) {
      logger.error(`Erro ao listar modelos: ${error.message}`);
      throw error;
    }
  }

  /**
   * Gerar resposta usando o modelo de linguagem
   */
  async generateResponse(
    prompt: string, 
    context?: string, 
    model?: string,
    options?: {
      temperature?: number;
      top_p?: number;
      top_k?: number;
      repeat_penalty?: number;
    }
  ): Promise<string> {
    try {
      const fullPrompt = context
        ? `Contexto: ${context}\n\nPergunta: ${prompt}\n\nResposta:`
        : prompt;

      const generationModel = model || this.defaultGenerationModel;
      
      // Preparar parâmetros de geração
      const generateOptions: any = {
        model: generationModel,
        prompt: fullPrompt,
        stream: false,
        keep_alive: this.defaultKeepAlive,
      };

      // Adicionar parâmetros opcionais se fornecidos
      // Garantir que os valores sejam números (float32) e não strings
      if (options?.temperature !== undefined) {
        generateOptions.options = generateOptions.options || {};
        generateOptions.options.temperature = typeof options.temperature === 'string' 
          ? parseFloat(options.temperature) 
          : Number(options.temperature);
      }
      if (options?.top_p !== undefined) {
        generateOptions.options = generateOptions.options || {};
        generateOptions.options.top_p = typeof options.top_p === 'string' 
          ? parseFloat(options.top_p) 
          : Number(options.top_p);
      }
      if (options?.top_k !== undefined) {
        generateOptions.options = generateOptions.options || {};
        generateOptions.options.top_k = typeof options.top_k === 'string' 
          ? parseInt(options.top_k, 10) 
          : Number(options.top_k);
      }
      if (options?.repeat_penalty !== undefined) {
        generateOptions.options = generateOptions.options || {};
        generateOptions.options.repeat_penalty = typeof options.repeat_penalty === 'string' 
          ? parseFloat(options.repeat_penalty) 
          : Number(options.repeat_penalty);
      }

      logger.debug(`Gerando resposta com modelo: ${generationModel}, keep_alive: ${generateOptions.keep_alive}${options ? `, opções: ${JSON.stringify(options)}` : ''}`);
      
      const response = await this.axiosInstance.post('/api/generate', generateOptions);

      if (response.data && response.data.response) {
        return response.data.response;
      }

      throw new Error('Resposta do Ollama não contém texto');
    } catch (error: any) {
      const generationModel = model || this.defaultGenerationModel;
      logger.error(`Erro ao gerar resposta com modelo '${generationModel}': ${error.message}`);
      if (error.response) {
        logger.error(`Status: ${error.response.status}, Dados: ${JSON.stringify(error.response.data)}`);
        if (error.response.status === 404) {
          throw new Error(`Modelo '${generationModel}' não encontrado no Ollama. Verifique se o modelo está instalado.`);
        }
      }
      throw new Error(`Erro ao gerar resposta: ${error.message}`);
    }
  }

  /**
   * Gerar resumo de texto
   */
  async generateSummary(text: string, maxLength: number = 500, model?: string): Promise<string> {
    try {
      const prompt = `Resuma o seguinte texto em no máximo ${maxLength} caracteres, mantendo as informações mais importantes:\n\n${text}`;

      const response = await this.generateResponse(prompt, undefined, model);
      return response.substring(0, maxLength);
    } catch (error: any) {
      logger.error(`Erro ao gerar resumo: ${error.message}`);
      throw error;
    }
  }
}

