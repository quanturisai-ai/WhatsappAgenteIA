import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import axios from 'axios';
import logger from './logger';

const HEALTH_TIMEOUT_MS = 3000;
const MAX_ATTEMPTS = 10;
const WAIT_FIRST_ATTEMPTS_SEC = 5;
const WAIT_LATER_ATTEMPTS_SEC = 10;

export class WhisperServiceManager {
  private baseUrl: string;
  private childProcess: ChildProcess | null = null;
  private startedByBackend: boolean = false;

  constructor() {
    const url = (process.env.WHISPER_SERVICE_URL || 'http://localhost:8787').replace(/\/$/, '');
    this.baseUrl = url;
  }

  /**
   * Verifica se o serviço de transcrição está respondendo (GET /health).
   */
  async checkHealth(): Promise<boolean> {
    try {
      const res = await axios.get(`${this.baseUrl}/health`, { timeout: HEALTH_TIMEOUT_MS });
      return res.status === 200 && res.data?.status === 'ok';
    } catch {
      return false;
    }
  }

  /**
   * Inicia o microserviço Whisper em background (detached).
   */
  private startService(): void {
    const scriptDir = path.resolve(__dirname, '..', '..', 'whisper-service');
    const isWindows = process.platform === 'win32';
    const script = isWindows ? 'start.bat' : 'start.sh';

    try {
      const child = spawn(isWindows ? 'cmd' : 'bash', isWindows ? ['/c', script] : [script], {
        cwd: scriptDir,
        detached: true,
        stdio: 'ignore',
        env: { ...process.env },
      });
      child.unref();
      this.childProcess = child;
      this.startedByBackend = true;
      logger.info(`🎙️ Whisper Service: processo iniciado em background (cwd: ${scriptDir})`);
    } catch (err: any) {
      logger.warn(`Whisper Service: falha ao iniciar script: ${err?.message || err}`);
    }
  }

  /**
   * Verifica se o serviço está disponível; se não, tenta iniciar e recheca até 10 vezes.
   * Não bloqueia o backend em caso de falha — apenas loga aviso.
   */
  async ensureRunning(maxAttempts: number = MAX_ATTEMPTS): Promise<void> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const healthy = await this.checkHealth();
      if (healthy) {
        logger.info('✅ Whisper Service disponível');
        return;
      }

      if (attempt === 1) {
        logger.info('🎙️ Whisper Service não encontrado. Tentando iniciar...');
        this.startService();
      }

      const waitSec = attempt <= 3 ? WAIT_FIRST_ATTEMPTS_SEC : WAIT_LATER_ATTEMPTS_SEC;
      logger.info(`   Tentativa ${attempt}/${maxAttempts} — aguardando ${waitSec}s...`);
      await new Promise((r) => setTimeout(r, waitSec * 1000));
    }

    logger.warn('⚠️  Whisper Service não respondeu após 10 tentativas');
    logger.warn('   O backend continuará rodando. Áudios não serão transcritos.');
  }

  /**
   * Encerra o processo do Whisper Service se foi iniciado pelo backend.
   */
  stop(): void {
    if (this.childProcess && this.startedByBackend) {
      try {
        this.childProcess.kill('SIGTERM');
        logger.info('Whisper Service (processo iniciado pelo backend) encerrado');
      } catch (err: any) {
        logger.warn(`Erro ao encerrar Whisper Service: ${err?.message || err}`);
      }
      this.childProcess = null;
      this.startedByBackend = false;
    }
  }
}
