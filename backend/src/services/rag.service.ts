import { OllamaService } from './ollama.service';
import { ChromaDBService } from './chromadb.service';
import { AgentConfigModel } from '../models/agentConfig.model';
import { ConversationModel } from '../models/conversation.model';
import { MessageModel } from '../models/message.model';
import { TopicModel } from '../models/topic.model';
import { MediaModel } from '../models/media.model';
import logger from '../utils/logger';
import { TestChatLogger } from '../utils/testChatLogger';
import { WhatsAppConversationLogger } from '../utils/whatsappConversationLogger';

export class RAGService {
  private ollamaService: OllamaService;
  private chromaService: ChromaDBService;
  private agentConfigModel: AgentConfigModel;
  private conversationModel: ConversationModel;
  private messageModel: MessageModel;
  private topicModel: TopicModel;
  private mediaModel: MediaModel;

  // Configurações da busca híbrida
  private readonly MAX_DISTANCE_THRESHOLD = 0.8; // Threshold de similaridade
  private readonly TRIGGER_KEYWORD_WEIGHT = 0.5; // Peso para match de trigger keywords
  private readonly VECTOR_SIMILARITY_WEIGHT = 0.3; // Peso para similaridade vetorial
  private readonly PRIORITY_WEIGHT = 0.2; // Peso para prioridade do tópico

  constructor() {
    this.ollamaService = new OllamaService();
    this.chromaService = new ChromaDBService();
    this.agentConfigModel = new AgentConfigModel();
    this.conversationModel = new ConversationModel();
    this.messageModel = new MessageModel();
    this.topicModel = new TopicModel();
    this.mediaModel = new MediaModel();
  }

  /**
   * Normalizar query para busca por trigger keywords
   */
  private normalizeQuery(query: string): string[] {
    // Remover pontuação e converter para lowercase
    const normalized = query
      .toLowerCase()
      .replace(/[.,!?;:()\[\]{}'"]/g, ' ')
      .trim();

    // Dividir em palavras e remover stopwords comuns em português
    const stopwords = [
      'a', 'o', 'e', 'de', 'do', 'da', 'dos', 'das', 'em', 'para', 'com', 'por', 'que',
      'é', 'são', 'um', 'uma', 'uns', 'umas', 'me', 'te', 'se', 'nos', 'vos', 'lhe',
      'lhes', 'meu', 'minha', 'meus', 'minhas', 'teu', 'tua', 'teus', 'tuas', 'seu',
      'sua', 'seus', 'suas', 'nosso', 'nossa', 'nossos', 'nossas', 'deles', 'delas',
      'como', 'qual', 'quais', 'onde', 'quando', 'quem', 'porque', 'porquê', 'por que',
      'mas', 'ou', 'se', 'não', 'sim', 'também', 'já', 'ainda', 'só', 'só', 'mais',
      'muito', 'muita', 'muitos', 'muitas', 'pouco', 'pouca', 'poucos', 'poucas',
      'este', 'esta', 'estes', 'estas', 'esse', 'essa', 'esses', 'essas', 'aquele',
      'aquela', 'aqueles', 'aquelas', 'isto', 'isso', 'aquilo'
    ];

    const words = normalized
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopwords.includes(word));

    return words;
  }

  /**
   * Calcular score de relevância para re-ranking
   */
  private calculateScore(
    hasTriggerKeyword: boolean,
    vectorSimilarity: number,
    priority: number
  ): number {
    // Converter distância em similaridade (distância menor = similaridade maior)
    // Distância 0 = similaridade 1, distância 1 = similaridade 0
    const similarity = 1 - Math.min(vectorSimilarity, 1);

    // Normalizar prioridade (assumindo que prioridade vai de 0 a 100)
    const normalizedPriority = Math.min(priority / 100, 1);

    // Calcular score ponderado
    let score = 0;
    
    if (hasTriggerKeyword) {
      score += this.TRIGGER_KEYWORD_WEIGHT;
    }
    
    score += similarity * this.VECTOR_SIMILARITY_WEIGHT;
    score += normalizedPriority * this.PRIORITY_WEIGHT;

    return score;
  }

  /**
   * Formatar tópico para o prompt no formato solicitado
   */
  private formatTopicForPrompt(topic: any): string {
    // Mapear context para nome legível
    const contextMap: Record<string, string> = {
      'greeting': 'Saudação',
      'farewell': 'Despedida',
      'absence': 'Ausência',
      'special_date': 'Data Especial',
      'custom': 'Personalizado'
    };

    const contextLabel = contextMap[topic.context] || topic.context || 'Personalizado';
    
    // Formatar trigger keywords
    const triggerKeywords = topic.trigger_keywords && Array.isArray(topic.trigger_keywords) && topic.trigger_keywords.length > 0
      ? topic.trigger_keywords.map((kw: string) => `"${kw}"`).join(', ')
      : '';

    // Construir texto formatado
    let formatted = `Contexto: ${contextLabel}\n`;
    
    if (triggerKeywords) {
      formatted += `Se o cliente disser: ${triggerKeywords} ou sinonimos.\n`;
    }
    
    formatted += `Considere: ${topic.description || ''}`;

    return formatted;
  }

  /**
   * Formatar mídia para o prompt no formato solicitado
   */
  private formatMediaForPrompt(media: any): string {
    const fileTypeMap: Record<string, string> = {
      'image': 'Imagem',
      'video': 'Vídeo',
      'document': 'Documento'
    };

    const fileTypeLabel = fileTypeMap[media.file_type] || media.file_type || 'Mídia';
    
    // Construir texto formatado
    let formatted = `Mídia disponível: ${fileTypeLabel}\n`;
    formatted += `Título: ${media.title || ''}\n`;
    formatted += `Descrição: ${media.description || ''}\n`;
    formatted += `ID da mídia: ${media.id}\nMídia ID: ${media.id}\nmedia_id: ${media.id}`;

    return formatted;
  }

  /**
   * Re-ranking de tópicos combinando trigger keywords e busca vetorial
   */
  private async rankTopics(
    topicsWithKeywords: any[],
    vectorResults: Array<{ id: string; text: string; distance: number; metadata?: Record<string, any> }>
  ): Promise<Array<{ id: string; text: string; score: number; metadata?: Record<string, any> }>> {
    const scoredResults: Array<{ id: string; text: string; score: number; metadata?: Record<string, any> }> = [];

    // Processar tópicos com trigger keywords
    for (const topic of topicsWithKeywords) {
      const topicId = `topic_${topic.id}`;
      const vectorResult = vectorResults.find(r => r.id === topicId);

      const score = this.calculateScore(
        true, // Tem trigger keyword
        vectorResult?.distance || 1.0, // Similaridade vetorial (ou 1.0 se não encontrado)
        topic.priority || 0 // Prioridade do tópico
      );

      // Formatar tópico no formato solicitado
      const text = this.formatTopicForPrompt(topic);

      scoredResults.push({
        id: topicId,
        text,
        score,
        metadata: {
          ...vectorResult?.metadata,
          type: 'topic',
          topic_id: topic.id,
          has_trigger_keyword: true,
          topic: topic, // Guardar tópico completo para formatação
        },
      });
    }

    // Processar outros resultados vetoriais que são tópicos mas não têm trigger keywords
    for (const result of vectorResults) {
      // Verificar se já foi adicionado (tópico com trigger keyword)
      if (scoredResults.find(r => r.id === result.id)) {
        continue;
      }

      // Extrair tipo e ID do metadata
      const type = result.metadata?.type || 'unknown';
      const topicId = result.metadata?.topic_id || result.metadata?.id;

      // Só processar se for tópico
      if (type !== 'topic' || !topicId) {
        continue;
      }

      // Buscar dados completos do banco para formatar
      let text = result.text;
      let priority = 0;
      
      try {
        const topic = await this.topicModel.findById(topicId);
        if (topic) {
          priority = topic.priority || 0;
          // Formatar tópico no formato solicitado
          text = this.formatTopicForPrompt(topic);
        }
      } catch (error) {
        // Ignorar erro e usar texto original
      }

      const score = this.calculateScore(
        false, // Não tem trigger keyword
        result.distance, // Similaridade vetorial
        priority // Prioridade
      );

      scoredResults.push({
        id: result.id,
        text,
        score,
        metadata: result.metadata,
      });
    }

    // Ordenar por score (maior primeiro) e retornar
    return scoredResults.sort((a, b) => b.score - a.score);
  }

  /**
   * Re-ranking de mídias combinando palavras-chave e busca vetorial
   */
  private async rankMedias(
    mediasWithKeywords: any[],
    vectorResults: Array<{ id: string; text: string; distance: number; metadata?: Record<string, any> }>
  ): Promise<Array<{ id: string; text: string; score: number; metadata?: Record<string, any> }>> {
    const scoredResults: Array<{ id: string; text: string; score: number; metadata?: Record<string, any> }> = [];

    // Processar mídias com palavras-chave correspondentes
    for (const media of mediasWithKeywords) {
      const mediaId = `media_${media.id}`;
      const vectorResult = vectorResults.find(r => r.id === mediaId);

      const score = this.calculateScore(
        true, // Tem palavra-chave correspondente
        vectorResult?.distance || 1.0, // Similaridade vetorial (ou 1.0 se não encontrado)
        0 // Mídias não têm prioridade, usar 0
      );

      // Formatar mídia no formato solicitado
      const text = this.formatMediaForPrompt(media);

      scoredResults.push({
        id: mediaId,
        text,
        score,
        metadata: {
          ...vectorResult?.metadata,
          type: 'media',
          media_id: media.id,
          has_keyword_match: true,
          media: media, // Guardar mídia completa para formatação
        },
      });
    }

    // Processar outros resultados vetoriais que são mídias mas não têm palavras-chave correspondentes
    for (const result of vectorResults) {
      // Verificar se já foi adicionado (mídia com palavra-chave)
      if (scoredResults.find(r => r.id === result.id)) {
        continue;
      }

      // Extrair tipo e ID do metadata
      const type = result.metadata?.type || 'unknown';
      const mediaId = result.metadata?.media_id;

      // Só processar se for mídia
      if (type !== 'media' || !mediaId) {
        continue;
      }

      // Buscar dados completos do banco para formatar
      let text = result.text;
      
      try {
        const media = await this.mediaModel.findById(mediaId);
        if (media) {
          // Formatar mídia no formato solicitado
          text = this.formatMediaForPrompt(media);
        }
      } catch (error) {
        // Ignorar erro e usar texto original
      }

      const score = this.calculateScore(
        false, // Não tem palavra-chave correspondente
        result.distance, // Similaridade vetorial
        0 // Mídias não têm prioridade
      );

      scoredResults.push({
        id: result.id,
        text,
        score,
        metadata: result.metadata,
      });
    }

    // Ordenar por score (maior primeiro) e retornar
    return scoredResults.sort((a, b) => b.score - a.score);
  }

  /**
   * Buscar contexto relevante usando busca híbrida (trigger keywords + busca vetorial)
   */
  private async retrieveContext(userId: number, query: string, nResults: number = 5): Promise<string> {
    try {
      logger.info(`[RAG] retrieveContext chamado com query: "${query.substring(0, 100)}..."`);
      
      // Obter configuração do agente para pegar o modelo de embedding
      const agentConfig = await this.agentConfigModel.findByUserId(userId);
      const embeddingModel = agentConfig?.embedding_model || undefined;
      
      logger.debug(`[RAG] Buscando contexto com modelo de embedding: ${embeddingModel || 'padrão'}`);

      // 1. Normalizar query para busca por trigger keywords
      const queryWords = this.normalizeQuery(query);
      logger.debug(`[RAG] Query normalizada: ${queryWords.join(', ')}`);

      // 2. Buscar tópicos por trigger keywords
      const topicsWithKeywords = await this.topicModel.findByTriggerKeywords(userId, queryWords);
      logger.info(`[RAG] Encontrados ${topicsWithKeywords.length} tópicos com trigger keywords correspondentes à query: "${query}"`);

      // 2b. Buscar mídias por palavras-chave no título e descrição
      const mediasWithKeywords = await this.mediaModel.findByKeywords(userId, queryWords);
      logger.info(`[RAG] Encontradas ${mediasWithKeywords.length} mídias com palavras-chave correspondentes à query: "${query}"`);

      // 3. Busca vetorial com threshold de similaridade (usando modelo do AgentConfig)
      const queryEmbedding = await this.ollamaService.generateEmbedding(query, embeddingModel);
      
      // Buscar mais resultados para depois filtrar e re-ranking
      const vectorResults = await this.chromaService.query(
        userId,
        queryEmbedding,
        Math.max(nResults * 2, 10), // Buscar mais para filtrar depois
        this.MAX_DISTANCE_THRESHOLD // Threshold de similaridade
      );

      logger.info(`[RAG] Encontrados ${vectorResults.length} resultados na busca vetorial para query: "${query}"`);

      // 4. Re-ranking separado para tópicos e mídias
      const rankedTopics = await this.rankTopics(topicsWithKeywords, vectorResults);
      const rankedMedias = await this.rankMedias(mediasWithKeywords, vectorResults);
      
      logger.debug(`[RAG] Após re-ranking: ${rankedTopics.length} tópicos, ${rankedMedias.length} mídias`);

      // 5. Combinar resultados mantendo rankings separados
      // Primeiro os tópicos, depois as mídias (cada um com seu próprio top N)
      const topTopics = rankedTopics.slice(0, nResults);
      const topMedias = rankedMedias.slice(0, nResults);
      
      // Combinar resultados
      const topResults = [...topTopics, ...topMedias];

      if (topResults.length === 0) {
        logger.info(`[RAG] Nenhum resultado relevante encontrado para query: "${query}"`);
        return '';
      }

      logger.info(`[RAG] Retornando ${topResults.length} resultados mais relevantes para query: "${query}"`);

      // Combinar textos dos documentos encontrados
      const contextTexts = topResults.map((result) => result.text);
      const combinedContext = contextTexts.join('\n\n');
      logger.debug(`[RAG] Contexto combinado (${combinedContext.length} chars) para query: "${query}"`);
      return combinedContext;
    } catch (error: any) {
      logger.error(`[RAG] Erro ao recuperar contexto para query "${query}": ${error.message}`);
      return '';
    }
  }

  /**
   * Obter histórico da conversa em formato narrativo
   * Retorna apenas as últimas 10 mensagens das últimas X horas (configurável)
   */
  private async getConversationHistory(conversationId: number, userId: number, limit: number = 10): Promise<{ history: string; lastMessage: string }> {
    try {
      // Obter max_age_hours da configuração do agente
      const agentConfig = await this.agentConfigModel.findByUserId(userId);
      const maxAgeHours = agentConfig?.max_age_hours ?? 12; // Padrão: 12 horas
      
      // Buscar apenas mensagens das últimas X horas, limitado a 10 mensagens
      const messages = await this.messageModel.findByConversationId(conversationId, limit, maxAgeHours);
      
      if (messages.length === 0) {
        return { history: '', lastMessage: '' };
      }

      // Separar última mensagem do cliente
      const lastMessage = messages[messages.length - 1];
      const isLastFromClient = lastMessage.direction === 'incoming';
      const lastClientMessage = isLastFromClient ? lastMessage.content : '';
      
      // Histórico sem a última mensagem (se for do cliente, já está separada)
      const historyMessages = isLastFromClient ? messages.slice(0, -1) : messages;
      
      // Formatar histórico em formato narrativo
      const historyLines: string[] = [];
      for (const msg of historyMessages) {
        if (msg.direction === 'incoming') {
          historyLines.push(`Cliente disse: ${msg.content}`);
        } else {
          historyLines.push(`Você agente respondeu: ${msg.content}`);
        }
      }

      return {
        history: historyLines.join('\n'),
        lastMessage: lastClientMessage
      };
    } catch (error: any) {
      logger.error(`Erro ao obter histórico da conversa: ${error.message}`);
      return { history: '', lastMessage: '' };
    }
  }

  /**
   * Formatar histórico customizado em formato narrativo
   */
  private formatCustomHistoryAsNarrative(customHistory: Array<{ role: string; content: string }>): { history: string; lastMessage: string } {
    if (customHistory.length === 0) {
      return { history: '', lastMessage: '' };
    }

    // Separar última mensagem do cliente
    const lastMessage = customHistory[customHistory.length - 1];
    const isLastFromClient = lastMessage.role === 'Cliente';
    const lastClientMessage = isLastFromClient ? lastMessage.content : '';
    
    // Histórico sem a última mensagem
    const historyMessages = isLastFromClient ? customHistory.slice(0, -1) : customHistory;
    
    // Formatar histórico em formato narrativo
    const historyLines: string[] = [];
    for (const msg of historyMessages) {
      if (msg.role === 'Cliente') {
        historyLines.push(`Cliente disse: ${msg.content}`);
      } else if (msg.role === 'Agente') {
        historyLines.push(`Você agente respondeu: ${msg.content}`);
      }
    }

    return {
      history: historyLines.join('\n'),
      lastMessage: lastClientMessage
    };
  }

  /**
   * Gerar resumo da conversa
   */
  async generateConversationSummary(conversationId: number, userId: number): Promise<string> {
    try {
      // Obter configuração do agente para pegar max_age_hours e modelo de geração
      const agentConfig = await this.agentConfigModel.findByUserId(userId);
      const maxAgeHours = agentConfig?.max_age_hours ?? 12; // Padrão: 12 horas
      const generationModel = agentConfig?.generation_model || undefined;
      
      // Buscar mensagens das últimas X horas para o resumo (limitado a 100 mensagens)
      const messages = await this.messageModel.findByConversationId(conversationId, 100, maxAgeHours);
      
      if (messages.length === 0) {
        return '';
      }

      const conversationText = messages.map((msg) => {
        const role = msg.direction === 'incoming' ? 'Cliente' : 'Agente';
        return `${role}: ${msg.content}`;
      }).join('\n');

      const summary = await this.ollamaService.generateSummary(conversationText, 500, generationModel);
      return summary;
    } catch (error: any) {
      logger.error(`Erro ao gerar resumo da conversa: ${error.message}`);
      return '';
    }
  }

  /**
   * Verificar se conversa precisa de recontextualização (inativa há mais de 24h)
   */
  async needsRecontextualization(conversationId: number): Promise<boolean> {
    try {
      const conversation = await this.conversationModel.findById(conversationId);
      
      if (!conversation || !conversation.last_message_at) {
        return false;
      }

      const lastMessageTime = new Date(conversation.last_message_at);
      const now = new Date();
      const hoursDiff = (now.getTime() - lastMessageTime.getTime()) / (1000 * 60 * 60);

      return hoursDiff > 24;
    } catch (error: any) {
      logger.error(`Erro ao verificar necessidade de recontextualização: ${error.message}`);
      return false;
    }
  }

  /**
   * Limpar resposta da IA removendo prefixos e diálogos indesejados
   */
  private cleanAIResponse(responseText: string): string {
    let cleanedResponse = responseText.trim();

    // Remover blocos de diálogo que a IA pode ter gerado
    // Se a resposta começa com "Cliente:" seguido de "Agente:", extrair apenas a parte do Agente
    const dialogPattern = /(?:Cliente|Usuário|User):\s*.*?\n\n?(?:Agente|Assistente|Assistant):\s*([\s\S]*?)$/i;
    const dialogMatch = cleanedResponse.match(dialogPattern);
    if (dialogMatch && dialogMatch[1]) {
      cleanedResponse = dialogMatch[1].trim();
    }

    // Remover prefixos indesejados (Cliente:, Agente:, etc.) no início da resposta
    cleanedResponse = cleanedResponse
      .replace(/^(Cliente|Agente|Usuário|Assistente|User|Assistant):\s*/gim, '')
      .trim();

    // Remover duplicatas de parágrafos (se a resposta contém o mesmo texto duas vezes)
    const lines = cleanedResponse.split('\n');
    const seen = new Set<string>();
    const uniqueLines: string[] = [];
    
    for (const line of lines) {
      const normalizedLine = line.trim();
      if (normalizedLine && !seen.has(normalizedLine)) {
        seen.add(normalizedLine);
        uniqueLines.push(line);
      } else if (normalizedLine) {
        // Se já vimos esta linha, pode ser uma duplicata - verificar se é realmente duplicata ou apenas similar
        // Se a linha já foi adicionada recentemente (últimas 3 linhas), pode ser duplicata intencional
        const recentLines = uniqueLines.slice(-3).map(l => l.trim());
        if (!recentLines.includes(normalizedLine)) {
          uniqueLines.push(line);
        }
      } else {
        uniqueLines.push(line); // Manter linhas vazias
      }
    }
    
    return uniqueLines.join('\n').trim();
  }

  /**
   * Obter data e hora atual formatada (horário local - America/Sao_Paulo)
   */
  private getCurrentDateTime(): string {
    const now = new Date();
    
    // Obter data/hora no fuso horário local (America/Sao_Paulo)
    // Usar Intl.DateTimeFormat para obter os componentes da data no fuso horário correto
    const formatter = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    
    const parts = formatter.formatToParts(now);
    const anoLocal = parseInt(parts.find(p => p.type === 'year')?.value || '0');
    const mesLocal = parts.find(p => p.type === 'month')?.value || '00';
    const diaLocal = parts.find(p => p.type === 'day')?.value || '00';
    const horaLocal = parts.find(p => p.type === 'hour')?.value || '00';
    const minutoLocal = parts.find(p => p.type === 'minute')?.value || '00';
    const segundoLocal = parts.find(p => p.type === 'second')?.value || '00';
    
    // Obter milissegundos
    const milissegundoLocal = String(now.getMilliseconds()).padStart(3, '0');
    
    // Calcular offset do fuso horário (America/Sao_Paulo é UTC-3)
    // Usar Intl.DateTimeFormat para obter o offset correto
    const offsetFormatter = new Intl.DateTimeFormat('en', {
      timeZone: 'America/Sao_Paulo',
      timeZoneName: 'longOffset',
    });
    
    // Extrair offset do formato (ex: "GMT-03:00")
    const offsetString = offsetFormatter.formatToParts(now).find(p => p.type === 'timeZoneName')?.value || '-03:00';
    const offsetStr = offsetString.replace('GMT', '').trim();
    
    const dataHoraLocal = `${anoLocal}-${mesLocal}-${diaLocal}T${horaLocal}:${minutoLocal}:${segundoLocal}.${milissegundoLocal}${offsetStr}`;
    
    return `DATA/HORA: ${dataHoraLocal}`;
  }

  /**
   * Gerar prompt completo com contexto
   */
  private async buildPrompt(
    userId: number,
    conversationId: number,
    userMessage: string,
    includeHistory: boolean = true,
    customHistory?: Array<{ role: string; content: string }>
  ): Promise<string> {
    try {
      // Obter data e hora atual
      const currentDateTime = this.getCurrentDateTime();

      // Obter configurações do agente
      const agentConfig = await this.agentConfigModel.findByUserId(userId);

      // Duas buscas RAG separadas:
      // 1. Histórico de contexto: baseado na interação anterior do cliente (apenas se houver)
      // 2. Contexto atual: baseado na resposta atual do cliente
      let lastClientContext = '';
      let currentClientContext = '';
      
      // Busca 1: Histórico de contexto (interação anterior do cliente)
      // Usar EXATAMENTE a mesma estrutura da busca do contexto atual
      if (conversationId > 0) {
        const lastClientMessage = await this.messageModel.findLastClientMessage(conversationId);
        if (lastClientMessage && lastClientMessage.content) {
          // Buscar contexto RAG com a interação anterior do cliente - EXATAMENTE como o contexto atual
          const previousMessage = lastClientMessage.content;
          logger.info(`[RAG] Buscando histórico de contexto com mensagem anterior do cliente: "${previousMessage.substring(0, 100)}..." (ID: ${lastClientMessage.id})`);
          lastClientContext = await this.retrieveContext(userId, previousMessage);
          logger.info(`[RAG] Histórico de contexto (cliente anterior): ${lastClientContext ? `encontrado (${lastClientContext.length} chars)` : 'não encontrado'}`);
        } else {
          logger.info(`[RAG] Nenhuma mensagem anterior do cliente encontrada para conversationId=${conversationId}`);
        }
      }
      
      // Busca 2: Contexto atual (resposta atual do cliente)
      // Sempre executar, independente de conversationId - mesma estrutura da busca 1
      logger.info(`[RAG] Buscando contexto atual com mensagem do cliente: "${userMessage.substring(0, 100)}..."`);
      currentClientContext = await this.retrieveContext(userId, userMessage);
      logger.info(`[RAG] Contexto atual (cliente): ${currentClientContext ? `encontrado (${currentClientContext.length} chars)` : 'não encontrado'}`);

      // Obter histórico da conversa se necessário
      let historyText = '';
      let lastClientMessage = userMessage; // Por padrão, a mensagem atual é a última
      
      if (includeHistory) {
        if (customHistory && customHistory.length > 0) {
          // Usar histórico customizado (para teste)
          const formatted = this.formatCustomHistoryAsNarrative(customHistory);
          historyText = formatted.history;
          // Se houver última mensagem do cliente no histórico, usar ela; senão usar a mensagem atual
          if (formatted.lastMessage) {
            lastClientMessage = formatted.lastMessage;
          }
        } else if (conversationId > 0) {
          // Só buscar histórico se conversationId for válido (não é teste)
          const needsRecontext = await this.needsRecontextualization(conversationId);
          if (needsRecontext) {
            // Se inativa há mais de 24h, usar resumo
            const summary = await this.generateConversationSummary(conversationId, userId);
            if (summary) {
              historyText = summary;
            }
          } else {
            // Usar histórico completo recente em formato narrativo
            const formatted = await this.getConversationHistory(conversationId, userId, 10);
            historyText = formatted.history;
            // Se houver última mensagem do cliente no histórico, usar ela; senão usar a mensagem atual
            if (formatted.lastMessage) {
              lastClientMessage = formatted.lastMessage;
            }
          }
        }
      }

      // Construir prompt
      let prompt = '';

      // 1. Apresentação da empresa
      if (agentConfig?.business_name) {
        prompt += `Você é um assistente de atendimento da empresa ${agentConfig.business_name}.\n`;
      }

      // 2. Personalidade (sem label, direto)
      if (agentConfig?.personality) {
        prompt += `\n${agentConfig.personality}\n\n`;
      }

      // 3. Informações sobre o negócio
      if (agentConfig?.business_info) {
        prompt += `Informações sobre o negócio:\n${agentConfig.business_info}\n\n`;
      }

      // 4. Serviços oferecidos
      if (agentConfig?.services) {
        prompt += `Serviços oferecidos:\n${agentConfig.services}\n\n`;
      }

      // 5. Horários de atendimento
      if (agentConfig?.hours) {
        prompt += `Horários de atendimento:\n${agentConfig.hours}\n\n`;
      }

      // 6. Outras instruções (SEMPRE presente com data/hora)
      prompt += `Outras instruções:\n${currentDateTime}\n`;
      
      // Histórico de contexto (apenas se houver resultado da busca RAG com interação anterior do cliente)
      if (lastClientContext) {
        prompt += `\nHistórico de contexto:\n${lastClientContext}\n`;
      }
      
      // Contexto atual (apenas se houver resultado da busca RAG com mensagem atual do cliente)
      if (currentClientContext) {
        prompt += `\nContexto atual:\n${currentClientContext}\n`;
      }
      
      prompt += '\n';

      // 7. Instruções sobre envio de mídias (apenas se houver mídias no contexto)
      // Verificar se há menção a mídias no contexto (procurar por "media_id", "Mídia ID", "ID da mídia")
      const hasMediaInContext = 
        (lastClientContext && /(?:media_id|Mídia ID|ID da mídia|media_)\s*:?\s*\d+/i.test(lastClientContext)) ||
        (currentClientContext && /(?:media_id|Mídia ID|ID da mídia|media_)\s*:?\s*\d+/i.test(currentClientContext));
      
      if (hasMediaInContext) {
        prompt += `Instruções sobre envio de mídias:\n`;
        prompt += `O contexto acima menciona mídias (imagens, vídeos, documentos) que podem ser enviadas ao cliente. Você pode solicitar o envio usando o seguinte comando especial:\n`;
        prompt += `[ENVIAR_MIDIA:ID_MIDIA]\n`;
        prompt += `Onde ID_MIDIA é o ID numérico da mídia mencionado no contexto.\n`;
        prompt += `Exemplo: Se o contexto mencionar "Mídia ID: 5" ou "media_id: 5", você deve incluir [ENVIAR_MIDIA:5] na sua resposta.\n`;
        prompt += `Você pode solicitar múltiplas mídias na mesma resposta usando múltiplos comandos: [ENVIAR_MIDIA:1] [ENVIAR_MIDIA:2]\n`;
        prompt += `IMPORTANTE: O comando [ENVIAR_MIDIA:ID] será processado automaticamente pelo sistema e a mídia será enviada junto com sua resposta.\n`;
        prompt += `NÃO mencione o comando ao cliente - apenas inclua-o na sua resposta quando apropriado.\n\n`;
      }

      // 8. Instrução de continuidade (SEMPRE presente)
      prompt += `Dê continuidade à conversa ABAIXO respondendo à última pergunta do cliente. Use o histórico como referência para entender o contexto e utilize as instruções acima. A resposta deve ser curta, objetiva, sem repetições desnecessárias e sem incluir informações não confirmadas. Utilize seu raciocínio para formular a melhor resposta possível.\n\n`;

      // 9. Histórico da conversa (formato narrativo - só aparece se houver)
      if (historyText) {
        prompt += `Histórico da conversa:\n${historyText}\n\n`;
      }

      // 10. Última pergunta do cliente (sempre destacada)
      prompt += `Última pergunta do cliente: ${lastClientMessage}`;

      return prompt;
    } catch (error: any) {
      logger.error(`Erro ao construir prompt: ${error.message}`);
      throw error;
    }
  }

  /**
   * Gerar resposta usando RAG
   */
  async generateResponse(
    userId: number,
    conversationId: number,
    userMessage: string,
    customHistory?: Array<{ role: string; content: string }>,
    includeHistory: boolean = true
  ): Promise<string> {
    try {
      // Obter configuração do agente para pegar o modelo de geração e parâmetros
      const agentConfig = await this.agentConfigModel.findByUserId(userId);
      const generationModel = agentConfig?.generation_model || undefined;
      
      // Preparar opções de geração
      // Garantir que os valores sejam números (MariaDB pode retornar DECIMAL como string)
      const generationOptions = {
        temperature: agentConfig?.temperature !== undefined && agentConfig?.temperature !== null
          ? (typeof agentConfig.temperature === 'string' ? parseFloat(agentConfig.temperature) : Number(agentConfig.temperature))
          : undefined,
        top_p: agentConfig?.top_p !== undefined && agentConfig?.top_p !== null
          ? (typeof agentConfig.top_p === 'string' ? parseFloat(agentConfig.top_p) : Number(agentConfig.top_p))
          : undefined,
        top_k: agentConfig?.top_k !== undefined && agentConfig?.top_k !== null
          ? (typeof agentConfig.top_k === 'string' ? parseInt(agentConfig.top_k, 10) : Number(agentConfig.top_k))
          : undefined,
        repeat_penalty: agentConfig?.repeat_penalty !== undefined && agentConfig?.repeat_penalty !== null
          ? (typeof agentConfig.repeat_penalty === 'string' ? parseFloat(agentConfig.repeat_penalty) : Number(agentConfig.repeat_penalty))
          : undefined,
      };
      
      logger.debug(`Gerando resposta com modelo de geração: ${generationModel || 'padrão'}, opções: ${JSON.stringify(generationOptions)}`);
      logger.debug(`Incluir histórico na resposta: ${includeHistory}`);

      // Construir prompt com contexto
      const prompt = await this.buildPrompt(userId, conversationId, userMessage, includeHistory, customHistory);

      // Gerar resposta usando OllamaService (usando modelo e parâmetros do AgentConfig)
      const responseText = await this.ollamaService.generateResponse(prompt, undefined, generationModel, generationOptions);

      // Se for teste (conversationId === 0), logar prompt e resposta para curadoria
      if (conversationId === 0) {
        TestChatLogger.logTestInteraction(
          userId,
          userMessage,
          prompt,
          responseText
        );
      } else {
        // Se for conversa real (conversationId !== 0), logar prompt e resposta para curadoria
        try {
          const conversation = await this.conversationModel.findById(conversationId);
          if (conversation) {
            WhatsAppConversationLogger.logConversationInteraction(
              userId,
              conversationId,
              conversation.contact_number || 'N/A',
              conversation.contact_name || conversation.contact_number || 'N/A',
              userMessage,
              prompt,
              responseText
            );
          } else {
            logger.warn(`Conversa ${conversationId} não encontrada para logging`);
          }
        } catch (error: any) {
          logger.error(`Erro ao buscar informações da conversa para logging: ${error.message}`);
          // Continuar mesmo se falhar o log
        }
      }

      // Limpar e formatar resposta
      const cleanedResponse = this.cleanAIResponse(responseText);

      logger.info(`Resposta RAG gerada para conversa ${conversationId}`);

      return cleanedResponse;
    } catch (error: any) {
      logger.error(`Erro ao gerar resposta RAG: ${error.message}`);
      throw error;
    }
  }

  /**
   * Gerar resposta simples (sem contexto de documentos)
   */
  async generateSimpleResponse(
    userId: number,
    conversationId: number,
    userMessage: string
  ): Promise<string> {
    try {
      // Obter data e hora atual
      const currentDateTime = this.getCurrentDateTime();

      // Obter configurações do agente
      const agentConfig = await this.agentConfigModel.findByUserId(userId);
      const generationModel = agentConfig?.generation_model || undefined;

      // Preparar opções de geração
      // Garantir que os valores sejam números (MariaDB pode retornar DECIMAL como string)
      const generationOptions = {
        temperature: agentConfig?.temperature !== undefined && agentConfig?.temperature !== null
          ? (typeof agentConfig.temperature === 'string' ? parseFloat(agentConfig.temperature) : Number(agentConfig.temperature))
          : undefined,
        top_p: agentConfig?.top_p !== undefined && agentConfig?.top_p !== null
          ? (typeof agentConfig.top_p === 'string' ? parseFloat(agentConfig.top_p) : Number(agentConfig.top_p))
          : undefined,
        top_k: agentConfig?.top_k !== undefined && agentConfig?.top_k !== null
          ? (typeof agentConfig.top_k === 'string' ? parseInt(agentConfig.top_k, 10) : Number(agentConfig.top_k))
          : undefined,
        repeat_penalty: agentConfig?.repeat_penalty !== undefined && agentConfig?.repeat_penalty !== null
          ? (typeof agentConfig.repeat_penalty === 'string' ? parseFloat(agentConfig.repeat_penalty) : Number(agentConfig.repeat_penalty))
          : undefined,
      };

      // Obter histórico da conversa em formato narrativo
      const historyData = await this.getConversationHistory(conversationId, userId, 10);
      const historyText = historyData.history;
      const lastClientMessage = historyData.lastMessage || userMessage;

      // Construir prompt simples
      let prompt = '';

      if (agentConfig) {
        if (agentConfig.business_name) {
          prompt += `Você é um assistente de atendimento da empresa ${agentConfig.business_name}.\n`;
        }
        
        if (agentConfig.personality) {
          prompt += `\n${agentConfig.personality}\n\n`;
        }
      }

      // Outras instruções (SEMPRE presente com data/hora)
      prompt += `Outras instruções:\n${currentDateTime}\n\n`;

      // Instrução de continuidade (SEMPRE presente)
      prompt += `Dê continuidade à conversa ABAIXO respondendo à última pergunta do cliente. Use o histórico como referência para entender o contexto e utilize as instruções acima. A resposta deve ser curta, objetiva, sem repetições desnecessárias e sem incluir informações não confirmadas. Utilize seu raciocínio para formular a melhor resposta possível.\n\n`;

      // Histórico da conversa (formato narrativo - só aparece se houver)
      if (historyText) {
        prompt += `Histórico da conversa:\n${historyText}\n\n`;
      }

      prompt += `Última pergunta do cliente: ${lastClientMessage}`;

      // Gerar resposta usando OllamaService (usando modelo e parâmetros do AgentConfig)
      const responseText = await this.ollamaService.generateResponse(prompt, undefined, generationModel, generationOptions);

      // Se for conversa real (conversationId !== 0), logar prompt e resposta para curadoria
      if (conversationId !== 0) {
        try {
          const conversation = await this.conversationModel.findById(conversationId);
          if (conversation) {
            WhatsAppConversationLogger.logConversationInteraction(
              userId,
              conversationId,
              conversation.contact_number || 'N/A',
              conversation.contact_name || conversation.contact_number || 'N/A',
              userMessage,
              prompt,
              responseText
            );
          } else {
            logger.warn(`Conversa ${conversationId} não encontrada para logging`);
          }
        } catch (error: any) {
          logger.error(`Erro ao buscar informações da conversa para logging: ${error.message}`);
          // Continuar mesmo se falhar o log
        }
      }

      // Limpar e formatar resposta
      const cleanedResponse = this.cleanAIResponse(responseText);

      return cleanedResponse;
    } catch (error: any) {
      logger.error(`Erro ao gerar resposta simples: ${error.message}`);
      throw error;
    }
  }

  /**
   * Processar mensagem e gerar resposta automática
   */
  async processMessageAndRespond(
    userId: number,
    conversationId: number,
    userMessage: string,
    useRAG: boolean = true,
    includeHistory: boolean = true
  ): Promise<string> {
    try {
      if (useRAG) {
        return await this.generateResponse(userId, conversationId, userMessage, undefined, includeHistory);
      } else {
        return await this.generateSimpleResponse(userId, conversationId, userMessage);
      }
    } catch (error: any) {
      logger.error(`Erro ao processar mensagem: ${error.message}`);
      // Fallback para resposta simples
      try {
        return await this.generateSimpleResponse(userId, conversationId, userMessage);
      } catch (fallbackError: any) {
        logger.error(`Erro no fallback: ${fallbackError.message}`);
        return 'Desculpe, não consegui processar sua mensagem no momento. Por favor, tente novamente.';
      }
    }
  }
}

