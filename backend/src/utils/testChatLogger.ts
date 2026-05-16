import fs from 'fs';
import path from 'path';
import logger from './logger';

const TEST_CHAT_LOG_DIR = path.join(__dirname, '../../logs');
const TEST_CHAT_LOG_FILE = path.join(TEST_CHAT_LOG_DIR, 'test-chat.log');

/**
 * Logger específico para chat de teste - registra prompts e respostas para curadoria
 */
export class TestChatLogger {
  /**
   * Garantir que o diretório de logs existe
   */
  private static ensureLogDir(): void {
    if (!fs.existsSync(TEST_CHAT_LOG_DIR)) {
      fs.mkdirSync(TEST_CHAT_LOG_DIR, { recursive: true });
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
   * Logar interação de teste completa
   */
  static logTestInteraction(
    userId: number,
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

💬 MENSAGEM DO USUÁRIO:
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
      fs.appendFileSync(TEST_CHAT_LOG_FILE, logEntry, 'utf-8');

      logger.debug(`Interação de teste logada para usuário ${userId}`);
    } catch (error: any) {
      logger.error(`Erro ao logar interação de teste: ${error.message}`);
    }
  }

  /**
   * Limpar arquivo de log (opcional - para manutenção)
   */
  static clearLog(): void {
    try {
      if (fs.existsSync(TEST_CHAT_LOG_FILE)) {
        fs.unlinkSync(TEST_CHAT_LOG_FILE);
        logger.info('Arquivo de log de teste limpo');
      }
    } catch (error: any) {
      logger.error(`Erro ao limpar log de teste: ${error.message}`);
    }
  }

  /**
   * Obter caminho do arquivo de log
   */
  static getLogFilePath(): string {
    return TEST_CHAT_LOG_FILE;
  }
}

