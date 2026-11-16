import { ConversationModel } from '../models/conversation.model';
import { MessageModel } from '../models/message.model';
import { WhatsAppService } from './whatsapp.service';
import { emitConversationUpdated } from '../utils/conversationSocketEmitter';
import { RAGService } from './rag.service';
import { AgentConfigModel } from '../models/agentConfig.model';
import { MediaModel } from '../models/media.model';
import { MediaSentTrackingModel } from '../models/mediaSentTracking.model';
import { HumanAttendantService } from './humanAttendant.service';
import { normalizePhoneNumber } from '../utils/phoneUtils';
import logger from '../utils/logger';

export interface ConversationStatus {
  id: number;
  status: 'new' | 'in_progress' | 'paused' | 'finished';
  isAutoResponding: boolean;
}

export class ConversationService {
  private conversationModel: ConversationModel;
  private _messageModel: MessageModel;
  private ragService: RAGService;
  private agentConfigModel: AgentConfigModel;
  private mediaModel: MediaModel;
  private mediaSentTrackingModel: MediaSentTrackingModel;
  private humanAttendantService: HumanAttendantService;

  constructor() {
    this.conversationModel = new ConversationModel();
    this._messageModel = new MessageModel();
    this.ragService = new RAGService();
    this.agentConfigModel = new AgentConfigModel();
    this.mediaModel = new MediaModel();
    this.mediaSentTrackingModel = new MediaSentTrackingModel();
    this.humanAttendantService = new HumanAttendantService();
  }

  /**
   * Verificar se conversa está em modo de resposta automática
   */
  async isAutoResponding(conversationId: number): Promise<boolean> {
    try {
      const conversation = await this.conversationModel.findById(conversationId);
      if (!conversation) {
        logger.warn(`Conversa ${conversationId} não encontrada ao verificar auto-resposta`);
        return true; // Default: auto-resposta ativa
      }
      // Converter de 0/1 (banco) para boolean
      // Se auto_responding é null ou undefined, retornar true (padrão: ativo)
      if (conversation.auto_responding === null || conversation.auto_responding === undefined) {
        return true; // Default: auto-resposta ativa
      }
      // Converter 0/1 para boolean - o banco pode retornar como number (0/1) ou boolean
      const value = conversation.auto_responding;
      if (typeof value === 'number') {
        return value === 1;
      }
      return value === true;
    } catch (error: any) {
      logger.error(`Erro ao verificar auto-resposta para conversa ${conversationId}: ${error.message}`);
      return true; // Default: auto-resposta ativa em caso de erro
    }
  }

  /**
   * Pausar respostas automáticas
   */
  async pauseAutoResponding(conversationId: number): Promise<void> {
    try {
      await this.conversationModel.update(conversationId, {
        auto_responding: false,
      });
      await this.emitConversationCardIfFound(conversationId);
      logger.info(`Respostas automáticas pausadas para conversa ${conversationId}`);
    } catch (error: any) {
      logger.error(`Erro ao pausar auto-resposta para conversa ${conversationId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Resumir respostas automáticas
   */
  async resumeAutoResponding(conversationId: number): Promise<void> {
    try {
      await this.conversationModel.update(conversationId, {
        auto_responding: true,
      });
      await this.emitConversationCardIfFound(conversationId);
      logger.info(`Respostas automáticas retomadas para conversa ${conversationId}`);
    } catch (error: any) {
      logger.error(`Erro ao retomar auto-resposta para conversa ${conversationId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Pausar todas as conversas de um usuário
   */
  pauseAllConversations(userId: number): void {
    // Implementar lógica para pausar todas as conversas do usuário
    logger.info(`Respostas automáticas pausadas para todas as conversas do usuário ${userId}`);
  }

  /**
   * Resumir todas as conversas de um usuário
   */
  resumeAllConversations(userId: number): void {
    // Implementar lógica para retomar todas as conversas do usuário
    logger.info(`Respostas automáticas retomadas para todas as conversas do usuário ${userId}`);
  }

  /**
   * Processar mensagem recebida e responder automaticamente
   */
  async processIncomingMessage(
    userId: number,
    conversationId: number,
    messageContent: string,
    whatsappService: WhatsAppService
  ): Promise<void> {
    try {
      // Verificar se respostas automáticas estão ativas
      const isAutoResponding = await this.isAutoResponding(conversationId);
      if (!isAutoResponding) {
        logger.info(`Respostas automáticas pausadas para conversa ${conversationId} - ignorando mensagem`);
        return;
      }

      // Atualizar status da conversa
      await this.conversationModel.update(conversationId, {
        status: 'in_progress',
      });

      logger.info(`Iniciando processamento de mensagem para conversa ${conversationId}`);

      // Buscar número do contato para envio de mídias
      const conversation = await this.conversationModel.findById(conversationId);
      if (!conversation) {
        throw new Error('Conversa não encontrada');
      }

      // Enviar mídias obrigatórias ANTES da resposta da IA
      await this.sendMandatoryMedias(userId, conversationId, conversation.contact_number, whatsappService);

      // Detectar comando #contatoia (não remover da mensagem, apenas detectar)
      const hasContatoIA = messageContent.toLowerCase().includes('#contatoia');
      let includeHistory = true;
      
      if (hasContatoIA) {
        includeHistory = false;
        logger.info(`🔍 Comando #contatoia detectado na conversa ${conversationId} - histórico da conversa será omitido`);
      }

      // Gerar resposta usando RAG
      // Adicionar timeout para evitar que processos travados causem problemas
      const response = await Promise.race([
        this.ragService.processMessageAndRespond(
          userId,
          conversationId,
          messageContent, // Usar mensagem ORIGINAL (com #contatoia)
          true, // usar RAG
          includeHistory // Passar flag para incluir ou não histórico
        ),
        new Promise<string>((_, reject) => 
          setTimeout(() => reject(new Error('Timeout ao processar mensagem com RAG')), 60000) // 60 segundos
        )
      ]);

      logger.info(`Resposta gerada para conversa ${conversationId}: "${response.substring(0, 50)}..."`);

      // Processar comandos de alerta de atendente na resposta da IA
      const alertMessage = this.extractAlertCommand(response);
      let cleanedResponse = this.removeAlertCommand(response);

      // Processar comando de contato proativo (se houver)
      const proactiveContact = this.extractProactiveContactCommand(cleanedResponse);
      cleanedResponse = this.removeProactiveContactCommand(cleanedResponse);

      // Processar comandos de envio de mídias na resposta da IA
      const mediaIds = this.extractMediaCommands(cleanedResponse);
      cleanedResponse = this.removeMediaCommands(cleanedResponse);

      // Processar alerta de atendente (se houver)
      if (alertMessage) {
        try {
          logger.info(`IA solicitou alerta de atendente para conversa ${conversationId}`);
          
          // Enviar alerta para o atendente humano
          await this.humanAttendantService.sendAlert(
            userId,
            conversationId,
            alertMessage,
            null, // topic_id será identificado se necessário
            whatsappService
          );

          // Marcar conversa como precisa intervenção
          await this.conversationModel.update(conversationId, {
            needs_intervention: true,
          });

          logger.info(`✅ Alerta de atendente enviado e conversa ${conversationId} marcada como precisa intervenção`);
        } catch (error: any) {
          logger.error(`Erro ao processar alerta de atendente: ${error.message}`);
          // Não bloquear o envio da resposta mesmo se o alerta falhar
        }
      }

      // Processar contato proativo (se houver)
      if (proactiveContact) {
        try {
          logger.info(`📞 IA solicitou contato proativo para número: ${proactiveContact.numero}`);
          logger.debug(`Mensagem proativa: ${proactiveContact.mensagem.substring(0, 100)}...`);
          
          // Normalizar número do telefone
          const normalizedNumber = normalizePhoneNumber(proactiveContact.numero);
          
          if (!normalizedNumber || normalizedNumber.length < 12) {
            logger.error(`❌ Número inválido após normalização: ${proactiveContact.numero} → ${normalizedNumber}`);
            throw new Error(`Número de telefone inválido: ${proactiveContact.numero}`);
          }

          logger.info(`📱 Número normalizado: ${proactiveContact.numero} → ${normalizedNumber}`);

          // Enviar mensagem proativa para o número especificado
          await whatsappService.sendMessage(normalizedNumber, proactiveContact.mensagem, true);

          logger.info(`✅ Mensagem proativa enviada com sucesso para ${normalizedNumber}`);
        } catch (error: any) {
          logger.error(`❌ Erro ao processar contato proativo: ${error.message}`);
          logger.error(`Stack trace: ${error.stack}`);
          // Não bloquear o envio da resposta ao cliente atual mesmo se o contato proativo falhar
        }
      } else {
        // Log para debug - verificar se o comando foi detectado
        if (response.includes('CONTATO_PROATIVO')) {
          logger.debug(`⚠️ Comando CONTATO_PROATIVO detectado na resposta mas não foi extraído corretamente`);
          logger.debug(`Trecho da resposta: ${response.substring(response.indexOf('CONTATO_PROATIVO') - 20, response.indexOf('CONTATO_PROATIVO') + 200)}`);
        }
      }

      // Enviar mídias solicitadas pela IA (se houver)
      if (mediaIds.length > 0) {
        logger.info(`IA solicitou envio de ${mediaIds.length} mídia(s): ${mediaIds.join(', ')}`);
        
        // Remover IDs duplicados
        const uniqueMediaIds = [...new Set(mediaIds)];
        
        // Contador para rastrear quantas mídias foram realmente enviadas com sucesso
        let mediaSentCount = 0;
        
        for (const mediaId of uniqueMediaIds) {
          try {
            // Mídias solicitadas pela IA devem SEMPRE ser enviadas quando solicitadas
            // Não verificar se já foi enviada - isso só se aplica a mídias obrigatórias (mandatory_send)
            
            const media = await this.mediaModel.findById(mediaId);
            if (media && media.user_id === userId && media.status === 'completed') {
              // Usar a resposta limpa da IA como caption (não a descrição da mídia)
              // Se houver múltiplas mídias, usar a mesma resposta para todas
              const caption = cleanedResponse.trim() || undefined;
              
              await whatsappService.sendMedia(conversation.contact_number, media.file_path, caption, true, mediaId);
              
              // Registrar que a mídia foi enviada (para estatísticas, mas não bloqueia reenvio)
              await this.mediaSentTrackingModel.markMediaAsSent(conversationId, mediaId);
              
              mediaSentCount++; // Incrementar contador de mídias enviadas com sucesso
              
              logger.info(`✅ Mídia ${mediaId} (${media.title}) enviada conforme solicitação da IA`);
            } else {
              logger.warn(`Mídia ${mediaId} não encontrada ou não disponível para envio`);
            }
          } catch (error: any) {
            logger.error(`Erro ao enviar mídia ${mediaId} solicitada pela IA: ${error.message}`);
            // Continuar com as outras mídias mesmo se uma falhar
          }
        }
        
        // Só pular o envio da mensagem de texto se pelo menos uma mídia foi enviada com sucesso
        if (mediaSentCount > 0) {
          logger.info(`${mediaSentCount} mídia(s) enviada(s) - resposta da IA enviada como caption das mídias`);
        } else {
          // Nenhuma mídia foi enviada (todas falharam ou não foram encontradas)
          // Enviar a mensagem de texto normalmente para o cliente não ficar sem resposta
          logger.warn(`Nenhuma mídia foi enviada com sucesso - enviando resposta da IA como mensagem de texto`);
          await whatsappService.sendMessage(conversation.contact_number, cleanedResponse, true);
        }
      } else {
        // Se não houver mídias, enviar resposta via WhatsApp normalmente
        // Não salvar manualmente aqui - o handleOutgoingMessage vai salvar automaticamente
        await whatsappService.sendMessage(conversation.contact_number, cleanedResponse, true);
      }

      logger.info(`Resposta automática enviada para conversa ${conversationId}`);
    } catch (error: any) {
      logger.error(`Erro ao processar mensagem recebida para conversa ${conversationId}: ${error.message}`);
      logger.error(`Stack trace: ${error.stack}`);
      
      // Não lançar erro - apenas logar para evitar crash
      // O processamento continua mesmo se uma mensagem falhar
    }
  }

  /**
   * Assumir conversa manualmente
   */
  async takeOverConversation(conversationId: number): Promise<void> {
    await this.pauseAutoResponding(conversationId);
    await this.conversationModel.update(conversationId, {
      status: 'in_progress',
    });
    logger.info(`Conversa ${conversationId} assumida manualmente`);
  }

  /**
   * Encerrar atendimento
   * Marca auto_responding = true para que, ao receber nova mensagem (reabertura), o bot responda automaticamente
   */
  async finishConversation(conversationId: number): Promise<void> {
    await this.conversationModel.update(conversationId, {
      status: 'finished',
      auto_responding: true,
    });
    await this.emitConversationCardIfFound(conversationId);
    logger.info(`Atendimento encerrado para conversa ${conversationId}`);
  }

  private async emitConversationCardIfFound(conversationId: number): Promise<void> {
    try {
      const conv = await this.conversationModel.findById(conversationId);
      if (conv && conv.user_id) {
        const card = await this.conversationModel.getConversationCardById(conv.user_id, conversationId);
        if (card) emitConversationUpdated(conv.user_id, card);
      }
    } catch (err: any) {
      logger.warn(`Erro ao emitir conversation:updated: ${err?.message}`);
    }
  }

  /**
   * Finalizar automaticamente conversas antigas sem interação
   * Usa max_age_hours da configuração de cada usuário
   * @returns Número de conversas finalizadas
   */
  async finalizeOldConversations(): Promise<number> {
    try {
      // Buscar TODAS as conversas ativas (new ou in_progress) com última mensagem
      // Não usar filtro de data inicial - buscar todas e depois filtrar por max_age_hours de cada usuário
      const allActiveConversations = await this.conversationModel.findActiveConversations();
      
      if (!allActiveConversations || allActiveConversations.length === 0) {
        logger.debug('Nenhuma conversa ativa encontrada para verificar finalização');
        return 0;
      }

      logger.info(`Verificando ${allActiveConversations.length} conversa(s) ativa(s) para finalização automática`);

      // Agrupar conversas por user_id
      const conversationsByUser = new Map<number, typeof allActiveConversations>();
      for (const conversation of allActiveConversations) {
        if (!conversation.last_message_at) {
          continue; // Pular conversas sem última mensagem
        }
        if (!conversationsByUser.has(conversation.user_id)) {
          conversationsByUser.set(conversation.user_id, []);
        }
        conversationsByUser.get(conversation.user_id)!.push(conversation);
      }

      // Processar cada usuário com seu max_age_hours
      let finalizedCount = 0;
      const configCache = new Map<number, number>(); // Cache de max_age_hours por usuário

      for (const [userId, conversations] of conversationsByUser) {
        try {
          // Buscar max_age_hours do config (com cache)
          let maxAgeHours = configCache.get(userId);
          if (maxAgeHours === undefined) {
            const agentConfig = await this.agentConfigModel.findByUserId(userId);
            maxAgeHours = agentConfig?.max_age_hours ?? 12; // Padrão: 12 horas
            configCache.set(userId, maxAgeHours);
            logger.debug(`Usuário ${userId}: max_age_hours = ${maxAgeHours}h`);
          }

          // Calcular data limite para este usuário
          const maxAgeDate = new Date();
          maxAgeDate.setHours(maxAgeDate.getHours() - maxAgeHours);

          logger.debug(`Usuário ${userId}: verificando conversas com última mensagem anterior a ${maxAgeDate.toISOString()} (max_age_hours: ${maxAgeHours}h)`);

          // Filtrar conversas deste usuário que são mais antigas que max_age_hours
          for (const conversation of conversations) {
            try {
              if (!conversation.last_message_at) {
                continue;
              }

              const lastMessageDate = new Date(conversation.last_message_at);
              
              // Se a última mensagem é mais antiga que max_age_hours, finalizar
              if (lastMessageDate < maxAgeDate && conversation.status !== 'finished') {
                const hoursAgo = Math.round((Date.now() - lastMessageDate.getTime()) / (1000 * 60 * 60));
                await this.conversationModel.update(conversation.id, {
                  status: 'finished',
                });
                finalizedCount++;
                logger.info(
                  `Conversa ${conversation.id} (${conversation.contact_name || conversation.contact_number}) ` +
                  `finalizada automaticamente - última mensagem: ${conversation.last_message_at} ` +
                  `(${hoursAgo}h atrás, max_age_hours: ${maxAgeHours}h para usuário ${userId})`
                );
              }
            } catch (error: any) {
              logger.error(`Erro ao finalizar conversa ${conversation.id}: ${error.message}`);
            }
          }
        } catch (error: any) {
          logger.error(`Erro ao processar conversas do usuário ${userId}: ${error.message}`);
        }
      }

      if (finalizedCount > 0) {
        logger.info(`Total de ${finalizedCount} conversa(s) finalizada(s) automaticamente`);
      }

      return finalizedCount;
    } catch (error: any) {
      logger.error(`Erro ao finalizar conversas antigas: ${error.message}`);
      logger.error(`Stack trace: ${error.stack}`);
      return 0;
    }
  }

  /**
   * Enviar mídias obrigatórias para uma conversa
   * Envia apenas se:
   * - A mídia ainda não foi enviada para esta conversa, OU
   * - A última interação do cliente foi há mais de maxAgeHours (considerada nova interação)
   */
  private async sendMandatoryMedias(
    userId: number,
    conversationId: number,
    contactNumber: string,
    whatsappService: WhatsAppService
  ): Promise<void> {
    try {
      // Buscar mídias obrigatórias ativas
      const mandatoryMedias = await this.mediaModel.findMandatoryMedias(userId);
      
      if (mandatoryMedias.length === 0) {
        logger.debug(`Nenhuma mídia obrigatória encontrada para usuário ${userId}`);
        return;
      }

      logger.info(`Encontradas ${mandatoryMedias.length} mídia(s) obrigatória(s) para usuário ${userId}`);

      // Buscar maxAgeHours da configuração
      const agentConfig = await this.agentConfigModel.findByUserId(userId);
      const maxAgeHours = agentConfig?.max_age_hours ?? 12; // Padrão: 12 horas

      // Buscar mensagens do cliente nesta conversa
      // Usar findByConversationId para buscar todas as mensagens recentes e filtrar
      const recentMessages = await this._messageModel.findByConversationId(conversationId, 10, maxAgeHours * 2);
      const clientMessages = recentMessages.filter(msg => msg.direction === 'incoming');
      
      // A última mensagem do cliente é a atual (que acabou de ser recebida)
      // A penúltima mensagem do cliente é a anterior à atual
      // Precisamos verificar a penúltima para determinar se passou maxAgeHours
      const previousClientMessage = clientMessages.length >= 2 ? clientMessages[clientMessages.length - 2] : null;
      
      // Verificar se deve enviar (nova interação ou nunca enviada)
      let shouldSend = false;
      if (clientMessages.length === 0) {
        // Nenhuma mensagem do cliente - não deve acontecer, mas por segurança
        logger.warn(`Nenhuma mensagem do cliente encontrada para conversa ${conversationId}`);
        shouldSend = true;
      } else if (clientMessages.length === 1) {
        // Primeira interação do cliente - sempre enviar
        shouldSend = true;
        logger.info(`Primeira interação do cliente na conversa ${conversationId} - enviando mídias obrigatórias`);
      } else if (previousClientMessage) {
        // Verificar se a penúltima mensagem do cliente foi há mais de maxAgeHours
        const previousMessageDate = new Date(previousClientMessage.created_at);
        const maxAgeDate = new Date();
        maxAgeDate.setHours(maxAgeDate.getHours() - maxAgeHours);
        
        if (previousMessageDate < maxAgeDate) {
          // Penúltima interação foi há mais de maxAgeHours - considerar como nova interação
          shouldSend = true;
          const hoursAgo = Math.round((Date.now() - previousMessageDate.getTime()) / (1000 * 60 * 60));
          logger.info(
            `Penúltima interação do cliente foi há mais de ${maxAgeHours}h ` +
            `(${hoursAgo}h atrás) - enviando mídias obrigatórias novamente`
          );
        }
      }

      if (!shouldSend) {
        logger.debug(`Última interação do cliente foi recente - verificando se mídias já foram enviadas`);
      }

      // Enviar cada mídia obrigatória que ainda não foi enviada ou se é nova interação
      for (const media of mandatoryMedias) {
        try {
          // Verificar se já foi enviada para esta conversa
          const wasSent = await this.mediaSentTrackingModel.wasMediaSent(conversationId, media.id);
          
          if (wasSent && !shouldSend) {
            // Já foi enviada e não é nova interação - pular
            logger.debug(`Mídia ${media.id} (${media.title}) já foi enviada para conversa ${conversationId}`);
            continue;
          }

          // Enviar mídia
          logger.info(`Enviando mídia obrigatória ${media.id} (${media.title}) para conversa ${conversationId}`);
          
          // Usar campo caption se disponível e não vazio, caso contrário não enviar caption
          const caption = media.caption && media.caption.trim() ? media.caption.trim() : undefined;
          
          await whatsappService.sendMedia(contactNumber, media.file_path, caption, true, media.id);
          
          // Registrar que foi enviada
          await this.mediaSentTrackingModel.markMediaAsSent(conversationId, media.id);
          
          logger.info(`✅ Mídia obrigatória ${media.id} enviada com sucesso para conversa ${conversationId}`);
        } catch (error: any) {
          logger.error(`Erro ao enviar mídia obrigatória ${media.id} para conversa ${conversationId}: ${error.message}`);
          // Continuar com as outras mídias mesmo se uma falhar
        }
      }
    } catch (error: any) {
      logger.error(`Erro ao processar envio de mídias obrigatórias para conversa ${conversationId}: ${error.message}`);
      // Não lançar erro - apenas logar para não bloquear o processamento da mensagem
    }
  }

  /**
   * Extrair IDs de mídias dos comandos [ENVIAR_MIDIA:ID] na resposta da IA
   */
  private extractMediaCommands(response: string): number[] {
    const mediaIds: number[] = [];
    const regex = /\[ENVIAR_MIDIA:(\d+)\]/g;
    let match;
    
    while ((match = regex.exec(response)) !== null) {
      const mediaId = parseInt(match[1], 10);
      if (!isNaN(mediaId) && !mediaIds.includes(mediaId)) {
        mediaIds.push(mediaId);
      }
    }
    
    return mediaIds;
  }

  /**
   * Remover comandos [ENVIAR_MIDIA:ID] da resposta da IA
   */
  private removeMediaCommands(response: string): string {
    return response.replace(/\[ENVIAR_MIDIA:\d+\]/g, '').trim();
  }

  /**
   * Extrair mensagem do comando [ALERTAR_ATENDENTE:mensagem] na resposta da IA
   */
  private extractAlertCommand(response: string): string | null {
    const regex = /\[ALERTAR_ATENDENTE:(.*?)\]/s; // 's' flag para permitir que . corresponda a \n
    const match = response.match(regex);
    
    if (match && match[1]) {
      return match[1].trim();
    }
    
    return null;
  }

  /**
   * Remover comando [ALERTAR_ATENDENTE:mensagem] da resposta da IA
   */
  private removeAlertCommand(response: string): string {
    return response.replace(/\[ALERTAR_ATENDENTE:.*?\]/s, '').trim();
  }

  /**
   * Extrair dados do comando [CONTATO_PROATIVO: {...}] na resposta da IA
   * Retorna objeto com numero e mensagem, ou null se não encontrar
   * Aceita formatos: [CONTATO_PROATIVO: {...}] ou [ "CONTATO_PROATIVO": {...}]
   */
  private extractProactiveContactCommand(response: string): { numero: string; mensagem: string } | null {
    // Tentar múltiplas regex para diferentes formatos
    // Formato 1: [ "CONTATO_PROATIVO": {...}]
    let regex = /\[\s*"CONTATO_PROATIVO"\s*:\s*(\{[\s\S]*?\})\s*\]/;
    let match = response.match(regex);
    
    // Formato 2: [ CONTATO_PROATIVO: {...}]
    if (!match) {
      regex = /\[\s*CONTATO_PROATIVO\s*:\s*(\{[\s\S]*?\})\s*\]/;
      match = response.match(regex);
    }
    
    // Formato 3: [CONTATO_PROATIVO: {...}]
    if (!match) {
      regex = /\[CONTATO_PROATIVO\s*:\s*(\{[\s\S]*?\})\s*\]/;
      match = response.match(regex);
    }
    
    if (!match || !match[1]) {
      return null;
    }

    const jsonStr = match[1];
    logger.debug(`📋 JSON extraído do comando CONTATO_PROATIVO: ${jsonStr.substring(0, 150)}...`);

    try {
      // Tentar fazer parse do JSON
      const parsed = JSON.parse(jsonStr);
      
      if (parsed.numero && parsed.mensagem) {
        logger.info(`✅ Comando CONTATO_PROATIVO extraído com sucesso: numero=${parsed.numero}`);
        return {
          numero: String(parsed.numero).trim(),
          mensagem: String(parsed.mensagem).trim(),
        };
      }
      
      logger.warn(`⚠️ Comando CONTATO_PROATIVO encontrado mas sem numero ou mensagem válidos`);
      logger.debug(`Conteúdo do JSON: ${JSON.stringify(parsed)}`);
      return null;
    } catch (error: any) {
      logger.warn(`⚠️ Erro ao fazer parse do JSON no comando CONTATO_PROATIVO: ${error.message}`);
      logger.debug(`JSON capturado (primeiros 300 chars): ${jsonStr.substring(0, 300)}`);
      
      // Tentar extração manual como fallback (para casos onde o JSON pode estar mal formatado)
      try {
        // Extrair número
        const numeroMatch = jsonStr.match(/"numero"\s*:\s*"([^"]+)"/);
        if (!numeroMatch) {
          logger.warn(`Não foi possível extrair número do comando CONTATO_PROATIVO`);
          return null;
        }
        
        // Extrair mensagem - pode ter múltiplas linhas e caracteres especiais
        // Primeiro tentar com regex simples
        let mensagemMatch = jsonStr.match(/"mensagem"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/);
        
        // Se não encontrar, tentar capturar até o fechamento do objeto
        if (!mensagemMatch) {
          const mensagemStart = jsonStr.indexOf('"mensagem"');
          if (mensagemStart !== -1) {
            const afterMensagem = jsonStr.substring(mensagemStart);
            const mensagemValueMatch = afterMensagem.match(/:\s*"([\s\S]*?)"\s*\n?\s*\}/);
            if (mensagemValueMatch) {
              mensagemMatch = mensagemValueMatch;
            }
          }
        }
        
        if (numeroMatch && mensagemMatch) {
          const numero = numeroMatch[1].trim();
          let mensagem = mensagemMatch[1]
            .replace(/\\n/g, '\n')
            .replace(/\\"/g, '"')
            .replace(/\\t/g, '\t')
            .trim();
          
          logger.info(`✅ Comando CONTATO_PROATIVO extraído via fallback: numero=${numero}`);
          return {
            numero,
            mensagem,
          };
        }
        
        logger.warn(`⚠️ Não foi possível extrair mensagem do comando CONTATO_PROATIVO`);
      } catch (fallbackError: any) {
        logger.error(`❌ Erro no fallback de extração do comando CONTATO_PROATIVO: ${fallbackError.message}`);
      }
    }

    return null;
  }

  /**
   * Remover comando [CONTATO_PROATIVO: {...}] da resposta da IA
   * Aceita diferentes formatos do comando
   */
  private removeProactiveContactCommand(response: string): string {
    // Remove o comando completo, incluindo JSON multilinha
    // Aceita múltiplos formatos:
    // - [ "CONTATO_PROATIVO": {...}]
    // - [ CONTATO_PROATIVO: {...}]
    // - [CONTATO_PROATIVO: {...}]
    let cleaned = response;
    
    // Formato 1: [ "CONTATO_PROATIVO": {...}]
    cleaned = cleaned.replace(/\[\s*"CONTATO_PROATIVO"\s*:\s*\{[\s\S]*?\}\s*\]/g, '');
    
    // Formato 2: [ CONTATO_PROATIVO: {...}] ou [CONTATO_PROATIVO: {...}]
    cleaned = cleaned.replace(/\[\s*CONTATO_PROATIVO\s*:\s*\{[\s\S]*?\}\s*\]/g, '');
    
    return cleaned.trim();
  }

  /**
   * Obter status da conversa
   */
  async getConversationStatus(conversationId: number): Promise<ConversationStatus> {
    const conversation = await this.conversationModel.findById(conversationId);
    if (!conversation) {
      throw new Error('Conversa não encontrada');
    }

    const isAutoResponding = await this.isAutoResponding(conversationId);
    return {
      id: conversation.id,
      status: conversation.status,
      isAutoResponding,
    };
  }
}

