import fs from 'fs';
import path from 'path';
import logger from './logger';

const TOKEN_RENEWAL_LOG_DIR = path.join(__dirname, '../../logs');
const TOKEN_RENEWAL_LOG_FILE = path.join(TOKEN_RENEWAL_LOG_DIR, 'vm-lav-token-renewal-test.log');

/**
 * Logger específico para testes de renovação de token VM Lav
 * Registra todas as etapas do teste para monitoramento e análise
 */
export class TestTokenRenewalLogger {
  /**
   * Garantir que o diretório de logs existe
   */
  private static ensureLogDir(): void {
    if (!fs.existsSync(TOKEN_RENEWAL_LOG_DIR)) {
      fs.mkdirSync(TOKEN_RENEWAL_LOG_DIR, { recursive: true });
    }
  }

  /**
   * Formatar data e hora
   */
  private static formatDateTime(): string {
    const now = new Date();
    return now.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });
  }

  /**
   * Obter separador visual
   */
  private static getSeparator(): string {
    return '═'.repeat(80);
  }

  /**
   * Logar início de teste
   */
  static logTestStart(): void {
    try {
      this.ensureLogDir();
      const timestamp = this.formatDateTime();
      const separator = this.getSeparator();

      const logEntry = `\n${separator}
🔄 INÍCIO DO TESTE DE RENOVAÇÃO DE TOKEN VM LAV
📅 Data/Hora: ${timestamp}
${separator}\n\n`;

      fs.appendFileSync(TOKEN_RENEWAL_LOG_FILE, logEntry, 'utf-8');
      logger.debug('Teste de renovação de token iniciado - log gravado');
    } catch (error: any) {
      logger.error(`Erro ao logar início do teste: ${error.message}`);
    }
  }

  /**
   * Logar etapa do teste
   */
  static logStep(stepNumber: string, stepName: string, details?: string): void {
    try {
      this.ensureLogDir();
      const timestamp = this.formatDateTime();

      let logEntry = `[${timestamp}] ${stepNumber} ${stepName}\n`;
      if (details) {
        logEntry += `   ${details}\n`;
      }
      logEntry += '\n';

      fs.appendFileSync(TOKEN_RENEWAL_LOG_FILE, logEntry, 'utf-8');
    } catch (error: any) {
      logger.error(`Erro ao logar etapa: ${error.message}`);
    }
  }

  /**
   * Logar resultado de teste
   */
  static logResult(success: boolean, message: string, data?: any): void {
    try {
      this.ensureLogDir();
      const timestamp = this.formatDateTime();
      const icon = success ? '✅' : '❌';
      const status = success ? 'SUCESSO' : 'FALHA';

      let logEntry = `[${timestamp}] ${icon} ${status}: ${message}\n`;
      
      if (data) {
        if (typeof data === 'object') {
          logEntry += `   Dados: ${JSON.stringify(data, null, 2)}\n`;
        } else {
          logEntry += `   Dados: ${data}\n`;
        }
      }
      logEntry += '\n';

      fs.appendFileSync(TOKEN_RENEWAL_LOG_FILE, logEntry, 'utf-8');
    } catch (error: any) {
      logger.error(`Erro ao logar resultado: ${error.message}`);
    }
  }

  /**
   * Logar informações de token
   */
  static logTokenInfo(tokenType: string, token: string | null, tempoRestante?: number | null): void {
    try {
      this.ensureLogDir();
      const timestamp = this.formatDateTime();

      let logEntry = `[${timestamp}] 🔑 Informações do Token: ${tokenType}\n`;
      
      if (token) {
        logEntry += `   Token (primeiros 50 chars): ${token.substring(0, 50)}...\n`;
        logEntry += `   Token completo: ${token}\n`;
        
        if (tempoRestante !== null && tempoRestante !== undefined) {
          logEntry += `   ⏰ Tempo até expiração: ${tempoRestante} minutos\n`;
          
          if (tempoRestante < 30) {
            logEntry += `   ⚠️  ATENÇÃO: Token expira em menos de 30 minutos!\n`;
          }
        }
      } else {
        logEntry += `   ❌ Token não disponível\n`;
      }
      logEntry += '\n';

      fs.appendFileSync(TOKEN_RENEWAL_LOG_FILE, logEntry, 'utf-8');
    } catch (error: any) {
      logger.error(`Erro ao logar informações de token: ${error.message}`);
    }
  }

  /**
   * Logar requisição HTTP
   */
  static logHttpRequest(method: string, url: string, status?: number, responseTime?: number, error?: string): void {
    try {
      this.ensureLogDir();
      const timestamp = this.formatDateTime();

      let logEntry = `[${timestamp}] 🌐 Requisição HTTP: ${method} ${url}\n`;
      
      if (status) {
        const icon = status >= 200 && status < 300 ? '✅' : '❌';
        logEntry += `   ${icon} Status: ${status}\n`;
      }
      
      if (responseTime !== undefined) {
        logEntry += `   ⏱️  Tempo de resposta: ${responseTime}ms\n`;
      }
      
      if (error) {
        logEntry += `   ❌ Erro: ${error}\n`;
      }
      logEntry += '\n';

      fs.appendFileSync(TOKEN_RENEWAL_LOG_FILE, logEntry, 'utf-8');
    } catch (error: any) {
      logger.error(`Erro ao logar requisição HTTP: ${error.message}`);
    }
  }

  /**
   * Logar teste de keep-alive
   */
  static logKeepAlive(attempt: number, total: number, success: boolean, responseTime?: number, error?: string): void {
    try {
      this.ensureLogDir();
      const timestamp = this.formatDateTime();
      const icon = success ? '✅' : '❌';

      let logEntry = `[${timestamp}] ${icon} Keep-Alive ${attempt}/${total}\n`;
      
      if (responseTime !== undefined) {
        logEntry += `   ⏱️  Tempo de resposta: ${responseTime}ms\n`;
      }
      
      if (error) {
        logEntry += `   ❌ Erro: ${error}\n`;
      }
      logEntry += '\n';

      fs.appendFileSync(TOKEN_RENEWAL_LOG_FILE, logEntry, 'utf-8');
    } catch (error: any) {
      logger.error(`Erro ao logar keep-alive: ${error.message}`);
    }
  }

  /**
   * Logar renovação de token
   */
  static logTokenRenewal(
    tokenAnterior: string | null,
    tokenNovo: string | null,
    mudou: boolean | null,
    motivo?: string
  ): void {
    try {
      this.ensureLogDir();
      const timestamp = this.formatDateTime();

      let logEntry = `[${timestamp}] 🔄 Renovação de Token\n`;
      
      if (tokenAnterior) {
        logEntry += `   Token Anterior: ${tokenAnterior.substring(0, 50)}...\n`;
      }
      
      if (tokenNovo) {
        logEntry += `   Token Novo: ${tokenNovo.substring(0, 50)}...\n`;
      }
      
      if (mudou !== null) {
        if (mudou) {
          logEntry += `   🔄 RESULTADO: Token MUDOU após renovação\n`;
        } else {
          logEntry += `   🔄 RESULTADO: Token PERMANECEU O MESMO após renovação\n`;
        }
      }
      
      if (motivo) {
        logEntry += `   📝 Motivo: ${motivo}\n`;
      }
      logEntry += '\n';

      fs.appendFileSync(TOKEN_RENEWAL_LOG_FILE, logEntry, 'utf-8');
    } catch (error: any) {
      logger.error(`Erro ao logar renovação de token: ${error.message}`);
    }
  }

  /**
   * Logar erro
   */
  static logError(error: Error | string, context?: string): void {
    try {
      this.ensureLogDir();
      const timestamp = this.formatDateTime();

      let logEntry = `[${timestamp}] ❌ ERRO`;
      if (context) {
        logEntry += ` (${context})`;
      }
      logEntry += '\n';
      
      if (error instanceof Error) {
        logEntry += `   Mensagem: ${error.message}\n`;
        if (error.stack) {
          logEntry += `   Stack: ${error.stack}\n`;
        }
      } else {
        logEntry += `   Mensagem: ${error}\n`;
      }
      logEntry += '\n';

      fs.appendFileSync(TOKEN_RENEWAL_LOG_FILE, logEntry, 'utf-8');
    } catch (logError: any) {
      logger.error(`Erro ao logar erro: ${logError.message}`);
    }
  }

  /**
   * Logar fim de teste
   */
  static logTestEnd(success: boolean, summary?: string): void {
    try {
      this.ensureLogDir();
      const timestamp = this.formatDateTime();
      const separator = this.getSeparator();
      const icon = success ? '✅' : '❌';
      const status = success ? 'TESTE CONCLUÍDO COM SUCESSO' : 'TESTE CONCLUÍDO COM FALHAS';

      let logEntry = `\n${separator}
${icon} ${status}
📅 Data/Hora: ${timestamp}
`;

      if (summary) {
        logEntry += `\n📊 Resumo:\n${summary}\n`;
      }

      logEntry += `${separator}\n\n`;

      fs.appendFileSync(TOKEN_RENEWAL_LOG_FILE, logEntry, 'utf-8');
      logger.debug('Teste de renovação de token finalizado - log gravado');
    } catch (error: any) {
      logger.error(`Erro ao logar fim do teste: ${error.message}`);
    }
  }

  /**
   * Logar informações gerais
   */
  static logInfo(message: string, data?: any): void {
    try {
      this.ensureLogDir();
      const timestamp = this.formatDateTime();

      let logEntry = `[${timestamp}] ℹ️  ${message}\n`;
      
      if (data) {
        if (typeof data === 'object') {
          logEntry += `   ${JSON.stringify(data, null, 2)}\n`;
        } else {
          logEntry += `   ${data}\n`;
        }
      }
      logEntry += '\n';

      fs.appendFileSync(TOKEN_RENEWAL_LOG_FILE, logEntry, 'utf-8');
    } catch (error: any) {
      logger.error(`Erro ao logar informação: ${error.message}`);
    }
  }

  /**
   * Limpar arquivo de log (opcional - para manutenção)
   */
  static clearLog(): void {
    try {
      if (fs.existsSync(TOKEN_RENEWAL_LOG_FILE)) {
        fs.unlinkSync(TOKEN_RENEWAL_LOG_FILE);
        logger.info('Arquivo de log de teste de renovação de token limpo');
      }
    } catch (error: any) {
      logger.error(`Erro ao limpar log: ${error.message}`);
    }
  }

  /**
   * Obter caminho do arquivo de log
   */
  static getLogFilePath(): string {
    return TOKEN_RENEWAL_LOG_FILE;
  }
}

