/**
 * Logger dedicado para operações de conexão e sincronização VM Lav
 * Registra em arquivo separado: logs/vm-lav-connection.log
 */

import winston from 'winston';
import path from 'path';
import fs from 'fs';

const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'vm-lav-connection.log');

// Garantir que o diretório existe
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const connectionLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'vm-lav-connection' },
  transports: [
    new winston.transports.File({ 
      filename: LOG_FILE,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5, // Manter últimos 5 arquivos
    }),
  ],
});

// Se não estiver em produção, também logar no console
if (process.env.NODE_ENV !== 'production') {
  connectionLogger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          return `${timestamp} [${level}]: ${message} ${
            Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
          }`;
        })
      ),
    })
  );
}

export class VmLavConnectionLogger {
  /**
   * Log de renovação de token
   */
  static logTokenRenewal(
    userId: number,
    success: boolean,
    method?: string,
    error?: string,
    tempoRestante?: number | null
  ): void {
    connectionLogger.info('Token Renewal', {
      userId,
      success,
      method,
      error,
      tempoRestante,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log de keep-alive
   */
  static logKeepAlive(
    userId: number,
    success: boolean,
    status?: number,
    error?: string
  ): void {
    connectionLogger.info('Keep-Alive', {
      userId,
      success,
      status,
      error,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log de atualização de tabela (clientes ou pedidos)
   */
  static logTableUpdate(
    userId: number,
    table: 'clientes' | 'pedidos',
    success: boolean,
    registrosNovos: number,
    registrosAlterados: number,
    registrosTotal: number,
    duracaoSegundos: number,
    error?: string
  ): void {
    connectionLogger.info('Table Update', {
      userId,
      table,
      success,
      registrosNovos,
      registrosAlterados,
      registrosTotal,
      duracaoSegundos,
      error,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log de atualização de credenciais
   */
  static logCredentialsUpdate(
    userId: number,
    fieldsUpdated: string[],
    success: boolean,
    error?: string
  ): void {
    connectionLogger.info('Credentials Update', {
      userId,
      fieldsUpdated,
      success,
      error,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log de reconexão
   */
  static logReconnection(
    userId: number,
    success: boolean,
    method: string,
    error?: string
  ): void {
    connectionLogger.info('Reconnection', {
      userId,
      success,
      method,
      error,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log de monitoramento de token
   */
  static logTokenMonitoring(
    userId: number,
    tempoRestante: number | null,
    action: 'check' | 'renew' | 'warning'
  ): void {
    connectionLogger.info('Token Monitoring', {
      userId,
      tempoRestante,
      action,
      timestamp: new Date().toISOString(),
    });
  }
}

export default VmLavConnectionLogger;

