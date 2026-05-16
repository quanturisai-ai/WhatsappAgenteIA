import fs from 'fs';
import path from 'path';
import logger from './logger';

const RAW_MESSAGE_LOG_DIR = path.join(__dirname, '../../logs');
const RAW_MESSAGE_LOG_FILE = path.join(RAW_MESSAGE_LOG_DIR, 'whatsapp-raw-messages.log');

/**
 * Logger específico para capturar TODOS os dados brutos recebidos do WhatsApp
 * Independente de tipo, filtro ou processamento
 * 
 * Este logger grava dados completos para análise posterior, especialmente útil para:
 * - Reações/curtidas
 * - Mensagens de sistema
 * - Eventos não processados
 * - Debug de problemas
 */
export class WhatsAppRawMessageLogger {
  /**
   * Garantir que o diretório de logs existe
   */
  private static ensureLogDir(): void {
    if (!fs.existsSync(RAW_MESSAGE_LOG_DIR)) {
      fs.mkdirSync(RAW_MESSAGE_LOG_DIR, { recursive: true });
    }
  }

  /**
   * Formatar data e hora
   */
  private static formatDateTime(): string {
    const now = new Date();
    return now.toISOString();
  }

  /**
   * Serializar objeto Message do whatsapp-web.js de forma segura
   * Remove funções e propriedades circulares que não podem ser serializadas
   */
  private static serializeMessage(msg: any): any {
    try {
      const serialized: any = {
        // Propriedades básicas
        id: msg.id ? {
          _serialized: msg.id._serialized,
          fromMe: msg.id.fromMe,
          remote: msg.id.remote,
          id: msg.id.id,
        } : null,
        from: msg.from,
        to: msg.to,
        body: msg.body,
        type: msg.type,
        timestamp: msg.timestamp,
        author: msg.author,
        isForwarded: msg.isForwarded,
        isStatus: msg.isStatus,
        hasMedia: msg.hasMedia,
        hasQuotedMsg: msg.hasQuotedMsg,
        location: msg.location,
        vCards: msg.vCards,
        mentionedIds: msg.mentionedIds,
        links: msg.links,
        
        // Propriedades de reação (se existirem)
        hasReaction: msg.hasReaction,
        reaction: msg.reaction,
        
        // Dados internos (_data) - importante para reações
        _data: msg._data ? {
          id: msg._data.id,
          from: msg._data.from,
          to: msg._data.to,
          body: msg._data.body,
          type: msg._data.type,
          t: msg._data.t, // timestamp
          notifyName: msg._data.notifyName,
          fromMe: msg._data.fromMe,
          isForwarded: msg._data.isForwarded,
          isStatus: msg._data.isStatus,
          hasMedia: msg._data.hasMedia,
          hasQuotedMsg: msg._data.hasQuotedMsg,
          reactionMessage: msg._data.reactionMessage,
          react: msg._data.react,
          isNotification: msg._data.isNotification,
          isEphemeral: msg._data.isEphemeral,
          mediaKey: msg._data.mediaKey,
          mimetype: msg._data.mimetype,
          filename: msg._data.filename,
          caption: msg._data.caption,
          location: msg._data.location,
          vcard: msg._data.vcard,
          vcards: msg._data.vcards,
          mentionedJidList: msg._data.mentionedJidList,
          links: msg._data.links,
          // Adicionar outras propriedades relevantes
          ...Object.keys(msg._data).reduce((acc: any, key: string) => {
            // Incluir propriedades que não são funções ou objetos complexos
            if (!['getChat', 'getContact', 'getQuotedMessage'].includes(key)) {
              const value = msg._data[key];
              if (typeof value !== 'function' && typeof value !== 'object') {
                acc[key] = value;
              } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                // Tentar serializar objetos simples
                try {
                  JSON.stringify(value);
                  acc[key] = value;
                } catch {
                  acc[key] = '[Object não serializável]';
                }
              }
            }
            return acc;
          }, {}),
        } : null,
        
        // Informações adicionais
        chatId: msg.chatId,
        isGroupMsg: msg.isGroupMsg,
        isMMS: msg.isMMS,
        isMedia: msg.isMedia,
        isNotification: msg.isNotification,
        isPSA: msg.isPSA,
      };

      return serialized;
    } catch (error: any) {
      return {
        error: 'Erro ao serializar mensagem',
        errorMessage: error.message,
        rawKeys: Object.keys(msg),
      };
    }
  }

  /**
   * Logar mensagem recebida (ANTES de qualquer filtro ou processamento)
   */
  static logIncomingMessage(msg: any, userId: number): void {
    try {
      this.ensureLogDir();
      
      const timestamp = this.formatDateTime();
      const serializedMsg = this.serializeMessage(msg);
      
      const logEntry = {
        timestamp,
        event: 'INCOMING_MESSAGE_RAW',
        userId,
        message: serializedMsg,
        metadata: {
          hasBody: !!msg.body,
          bodyLength: msg.body ? msg.body.length : 0,
          bodyPreview: msg.body ? (msg.body.length > 100 ? msg.body.substring(0, 100) + '...' : msg.body) : null,
          isStatus: msg.isStatus,
          hasMedia: msg.hasMedia,
          hasReaction: msg.hasReaction || !!(msg._data?.reactionMessage || msg._data?.react),
          type: msg.type || msg._data?.type,
          from: msg.from,
        },
      };

      const logLine = JSON.stringify(logEntry, null, 2) + '\n\n' + '='.repeat(80) + '\n\n';
      
      fs.appendFileSync(RAW_MESSAGE_LOG_FILE, logLine, 'utf8');
      
      // Também logar no logger principal para visibilidade
      logger.debug(`[RAW MESSAGE] Recebido de ${msg.from}: tipo=${msg.type || 'unknown'}, hasBody=${!!msg.body}, hasReaction=${!!(msg.hasReaction || msg._data?.reactionMessage || msg._data?.react)}`);
    } catch (error: any) {
      logger.error(`Erro ao logar mensagem raw: ${error.message}`);
    }
  }

  /**
   * Serializar evento de reação (estrutura diferente de mensagem completa)
   */
  private static serializeReactionEvent(data: any): any {
    try {
      // O evento message_reaction tem estrutura: { id: {...}, timestamp: ..., reaction: "...", _data: null }
      const serialized: any = {
        // Propriedades diretas do evento
        id: data.id ? {
          _serialized: data.id._serialized,
          fromMe: data.id.fromMe,
          remote: data.id.remote,
          id: data.id.id,
          // Capturar TODAS as propriedades do id, caso haja outras
          ...Object.keys(data.id).reduce((acc: any, key: string) => {
            if (!acc[key] && typeof data.id[key] !== 'function') {
              try {
                JSON.stringify(data.id[key]);
                acc[key] = data.id[key];
              } catch {
                acc[key] = String(data.id[key]);
              }
            }
            return acc;
          }, {}),
        } : null,
        reaction: data.reaction,
        timestamp: data.timestamp,
        _data: data._data,
        
        // Capturar TODAS as propriedades do objeto data que não foram capturadas acima
        ...Object.keys(data).reduce((acc: any, key: string) => {
          // Pular propriedades já capturadas e funções
          if (!['id', 'reaction', 'timestamp', '_data'].includes(key) && typeof data[key] !== 'function') {
            try {
              const value = data[key];
              if (typeof value === 'object' && value !== null) {
                // Tentar serializar objetos
                JSON.stringify(value);
                acc[key] = value;
              } else {
                acc[key] = value;
              }
            } catch {
              acc[key] = String(data[key]);
            }
          }
          return acc;
        }, {}),
      };

      return serialized;
    } catch (error: any) {
      return {
        error: 'Erro ao serializar evento de reação',
        errorMessage: error.message,
        rawKeys: Object.keys(data),
        rawData: JSON.stringify(data, (key, value) => {
          if (typeof value === 'function') return '[Function]';
          if (value && typeof value === 'object') {
            try {
              JSON.stringify(value);
              return value;
            } catch {
              return '[Object não serializável]';
            }
          }
          return value;
        }),
      };
    }
  }

  /**
   * Logar evento de mensagem (para capturar eventos que não são mensagens diretas)
   */
  static logMessageEvent(eventName: string, data: any, userId: number): void {
    try {
      this.ensureLogDir();
      
      const timestamp = this.formatDateTime();
      
      // Para eventos de reação, usar serialização específica
      // Para outros eventos, tentar serializar como mensagem ou capturar tudo
      let serializedData: any;
      if (eventName === 'message_reaction') {
        serializedData = this.serializeReactionEvent(data);
      } else {
        // Tentar serializar como mensagem primeiro
        try {
          serializedData = this.serializeMessage(data);
        } catch {
          // Se falhar, capturar tudo que for possível
          serializedData = JSON.parse(JSON.stringify(data, (key, value) => {
            if (typeof value === 'function') return '[Function]';
            if (value && typeof value === 'object') {
              try {
                JSON.stringify(value);
                return value;
              } catch {
                return '[Object não serializável]';
              }
            }
            return value;
          }));
        }
      }
      
      const logEntry = {
        timestamp,
        event: 'MESSAGE_EVENT',
        eventName,
        userId,
        data: serializedData,
        // Adicionar metadados para facilitar análise
        metadata: {
          hasId: !!data.id,
          hasReaction: !!data.reaction,
          hasTimestamp: !!data.timestamp,
          idStructure: data.id ? {
            hasSerialized: !!data.id._serialized,
            hasId: !!data.id.id,
            hasRemote: !!data.id.remote,
            hasFromMe: data.id.fromMe !== undefined,
            allKeys: Object.keys(data.id || {}),
          } : null,
          allDataKeys: Object.keys(data || {}),
        },
      };

      const logLine = JSON.stringify(logEntry, null, 2) + '\n\n' + '='.repeat(80) + '\n\n';
      
      fs.appendFileSync(RAW_MESSAGE_LOG_FILE, logLine, 'utf8');
      
      logger.debug(`[RAW MESSAGE EVENT] ${eventName} para usuário ${userId}`);
    } catch (error: any) {
      logger.error(`Erro ao logar evento raw: ${error.message}`);
      // Tentar logar pelo menos os dados básicos em caso de erro
      try {
        const fallbackLog = {
          timestamp: this.formatDateTime(),
          event: 'MESSAGE_EVENT_ERROR',
          eventName,
          userId,
          error: error.message,
          rawDataKeys: Object.keys(data || {}),
          rawDataString: String(data),
        };
        fs.appendFileSync(RAW_MESSAGE_LOG_FILE, JSON.stringify(fallbackLog, null, 2) + '\n\n' + '='.repeat(80) + '\n\n', 'utf8');
      } catch (fallbackError: any) {
        logger.error(`Erro ao logar fallback: ${fallbackError.message}`);
      }
    }
  }

  /**
   * Logar qualquer evento relacionado a mensagens
   */
  static logAnyEvent(eventName: string, payload: any, userId?: number): void {
    try {
      this.ensureLogDir();
      
      const timestamp = this.formatDateTime();
      
      const logEntry = {
        timestamp,
        event: 'ANY_EVENT',
        eventName,
        userId: userId || null,
        payload: typeof payload === 'object' ? JSON.parse(JSON.stringify(payload, (key, value) => {
          // Remover funções e objetos circulares
          if (typeof value === 'function') {
            return '[Function]';
          }
          if (value && typeof value === 'object') {
            try {
              JSON.stringify(value);
              return value;
            } catch {
              return '[Object não serializável]';
            }
          }
          return value;
        })) : payload,
      };

      const logLine = JSON.stringify(logEntry, null, 2) + '\n\n' + '='.repeat(80) + '\n\n';
      
      fs.appendFileSync(RAW_MESSAGE_LOG_FILE, logLine, 'utf8');
      
      logger.debug(`[RAW EVENT] ${eventName} logado`);
    } catch (error: any) {
      logger.error(`Erro ao logar evento qualquer: ${error.message}`);
    }
  }
}

