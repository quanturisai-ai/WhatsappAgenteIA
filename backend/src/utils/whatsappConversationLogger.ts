import fs from 'fs';
import path from 'path';
import logger from './logger';

const WHATSAPP_CONVERSATION_LOG_DIR = path.join(__dirname, '../../logs');
const WHATSAPP_CONVERSATION_LOG_FILE = path.join(WHATSAPP_CONVERSATION_LOG_DIR, 'whatsapp-conversations.log');

/**
 * Logger específico para conversas reais do WhatsApp - registra prompts e respostas para curadoria
 */
export class WhatsAppConversationLogger {
  /**
   * Garantir que o diretório de logs existe
   */
  private static ensureLogDir(): void {
    if (!fs.existsSync(WHATSAPP_CONVERSATION_LOG_DIR)) {
      fs.mkdirSync(WHATSAPP_CONVERSATION_LOG_DIR, { recursive: true });
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
   * Adicionar separador visual
   */
  private static getSeparator(): string {
    return '\n' + '='.repeat(100) + '\n';
  }

  /**
   * Logar interação de conversa real completa
   */
  static logConversationInteraction(
    userId: number,
    conversationId: number,
    contactNumber: string,
    contactName: string,
    userMessage: string,
    fullPrompt: string,
    aiResponse: string
  ): void {
    try {
      this.ensureLogDir();

      const timestamp = this.formatDateTime();
      const separator = this.getSeparator();

      const logEntry = `${separator}📅 DATA/HORA: ${timestamp}
👤 USUÁRIO ID: ${userId}
💬 CONVERSA ID: ${conversationId}
📱 CONTATO: ${contactName} (${contactNumber})

💬 MENSAGEM DO CLIENTE:
${userMessage}

📝 PROMPT COMPLETO ENVIADO À IA:
${separator}
${fullPrompt}
${separator}

🤖 RESPOSTA DA IA (SEM LIMPEZA):
${separator}
${aiResponse}
${separator}

`;

      // Anexar ao arquivo de log
      fs.appendFileSync(WHATSAPP_CONVERSATION_LOG_FILE, logEntry, 'utf-8');

      logger.debug(`Interação de conversa real logada para usuário ${userId}, conversa ${conversationId}`);
    } catch (error: any) {
      logger.error(`Erro ao logar interação de conversa real: ${error.message}`);
    }
  }

  /**
   * Limpar arquivo de log (opcional - para manutenção)
   */
  static clearLog(): void {
    try {
      if (fs.existsSync(WHATSAPP_CONVERSATION_LOG_FILE)) {
        fs.unlinkSync(WHATSAPP_CONVERSATION_LOG_FILE);
        logger.info('Arquivo de log de conversas reais limpo');
      }
    } catch (error: any) {
      logger.error(`Erro ao limpar log de conversas reais: ${error.message}`);
    }
  }

  /**
   * Obter caminho do arquivo de log
   */
  static getLogFilePath(): string {
    return WHATSAPP_CONVERSATION_LOG_FILE;
  }
}

