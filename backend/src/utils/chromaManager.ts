import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';
import logger from './logger';
import axios from 'axios';

class ChromaManager {
  private chromaProcess: ChildProcess | null = null;
  private chromaHost: string;
  private chromaPort: string;
  private chromaUrl: string;
  private chromaDbPath: string;
  private isManuallyStarted: boolean = false;
  private retryInterval: NodeJS.Timeout | null = null;
  private isRetrying: boolean = false;

  constructor() {
    this.chromaHost = process.env.CHROMA_HOST || 'localhost';
    this.chromaPort = process.env.CHROMA_PORT || '8000';
    this.chromaUrl = `http://${this.chromaHost}:${this.chromaPort}`;
    this.chromaDbPath = path.resolve(process.env.CHROMA_DB_PATH || './chroma_db');
  }

  /**
   * Verifica se o ChromaDB já está rodando
   */
  async isRunning(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.chromaUrl}/api/v2/heartbeat`, {
        timeout: 2000,
      });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  /**
   * Inicia o ChromaDB se não estiver rodando
   */
  async start(): Promise<void> {
    try {
      // Verificar se já está rodando
      const running = await this.isRunning();
      
      if (running) {
        logger.info('ChromaDB já está rodando');
        this.isManuallyStarted = true;
        // Garantir que a verificação periódica está ativa
        this.startPeriodicRetry();
        return;
      }

      logger.info('Iniciando ChromaDB...');
      logger.info(`  Host: ${this.chromaHost}`);
      logger.info(`  Porta: ${this.chromaPort}`);
      logger.info(`  Path: ${this.chromaDbPath}`);

      // Iniciar processo do ChromaDB
      // No Windows, usar caminho completo do chroma.exe para evitar problemas de PATH
      let command: string;
      let args: string[];
      let chromaDir: string | null = null;
      
      if (process.platform === 'win32') {
        // Detectar se estamos em ambiente de serviço (sem USERPROFILE ou com variáveis limitadas)
        const isServiceEnvironment = !process.env.USERPROFILE || 
                                     process.env.USERPROFILE.includes('systemprofile') ||
                                     !process.env.APPDATA ||
                                     process.env.APPDATA.includes('systemprofile');
        
        // Em ambiente de serviço, preferir usar Python diretamente para evitar problemas com PYTHONPATH
        if (isServiceEnvironment) {
          logger.info('Ambiente de serviço detectado. Usando Python diretamente para executar ChromaDB...');
          
          // Tentar encontrar Python
          const pythonPaths = [
            'C:\\Python313\\python.exe',
            path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python313', 'python.exe'),
            'python.exe',
            'python',
          ];
          
          let pythonPath: string | null = null;
          for (const testPythonPath of pythonPaths) {
            try {
              if (testPythonPath === 'python.exe' || testPythonPath === 'python') {
                pythonPath = testPythonPath;
                break;
              } else if (fs.existsSync(testPythonPath)) {
                pythonPath = testPythonPath;
                break;
              }
            } catch (error) {
              // Continuar tentando
            }
          }
          
          if (pythonPath) {
            command = pythonPath;
            // Executar chromadb.cli.cli diretamente via Python
            // Como chromadb.cli.cli não tem __main__.py, precisamos chamar a função app() diretamente
            const pythonScript = `import sys; sys.argv = ['chroma', 'run', '--path', '${this.chromaDbPath.replace(/\\/g, '\\\\')}', '--host', '${this.chromaHost}', '--port', '${this.chromaPort}']; from chromadb.cli.cli import app; app()`;
            args = ['-c', pythonScript];
            logger.info(`Usando Python para executar ChromaDB: ${pythonPath}`);
          } else {
            throw new Error('Python não encontrado. Instale Python 3.13 para executar ChromaDB.');
          }
        } else {
          // Ambiente normal: tentar usar chroma.exe primeiro
          const possiblePaths: string[] = [];
          
          // 1. Usar USERPROFILE (mais confiável que APPDATA em serviços)
          if (process.env.USERPROFILE) {
            possiblePaths.push(
              path.join(process.env.USERPROFILE, 'AppData', 'Roaming', 'Python', 'Python313', 'Scripts', 'chroma.exe')
            );
          }
          
          // 2. Usar os.homedir() como alternativa
          const homeDir = os.homedir();
          possiblePaths.push(
            path.join(homeDir, 'AppData', 'Roaming', 'Python', 'Python313', 'Scripts', 'chroma.exe')
          );
          
          // 3. Usar APPDATA se disponível
          if (process.env.APPDATA && !process.env.APPDATA.includes('systemprofile')) {
            possiblePaths.push(
              path.join(process.env.APPDATA, 'Python', 'Python313', 'Scripts', 'chroma.exe')
            );
          }
          
          // 4. Fallback hardcoded (último recurso)
          possiblePaths.push('C:\\Users\\Barbara\\AppData\\Roaming\\Python\\Python313\\Scripts\\chroma.exe');
          
          // Encontrar o primeiro caminho que existe
          let chromaPath: string | null = null;
          for (const testPath of possiblePaths) {
            try {
              if (fs.existsSync(testPath)) {
                chromaPath = testPath;
                chromaDir = path.dirname(chromaPath);
                logger.debug(`ChromaDB encontrado em: ${chromaPath}`);
                break;
              }
            } catch (error) {
              // Continuar tentando outros caminhos
            }
          }
          
          if (chromaPath) {
            command = chromaPath;
            // Ordem correta: --path primeiro, depois --host e --port
            args = ['run', '--path', this.chromaDbPath, '--host', this.chromaHost, '--port', this.chromaPort];
          } else {
            // Fallback: usar Python diretamente se chroma.exe não foi encontrado
            logger.warn('chroma.exe não encontrado. Tentando executar via Python diretamente...');
            
            const pythonPaths = [
              'C:\\Python313\\python.exe',
              path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python313', 'python.exe'),
              'python.exe',
              'python',
            ];
            
            let pythonPath: string | null = null;
            for (const testPythonPath of pythonPaths) {
              try {
                if (testPythonPath === 'python.exe' || testPythonPath === 'python') {
                  pythonPath = testPythonPath;
                  break;
                } else if (fs.existsSync(testPythonPath)) {
                  pythonPath = testPythonPath;
                  break;
                }
              } catch (error) {
                // Continuar tentando
              }
            }
            
            if (pythonPath) {
              command = pythonPath;
              // Executar chromadb.cli.cli diretamente via Python
              // Como chromadb.cli.cli não tem __main__.py, precisamos chamar a função app() diretamente
              const pythonScript = `import sys; sys.argv = ['chroma', 'run', '--path', '${this.chromaDbPath.replace(/\\/g, '\\\\')}', '--host', '${this.chromaHost}', '--port', '${this.chromaPort}']; from chromadb.cli.cli import app; app()`;
              args = ['-c', pythonScript];
              logger.info(`Usando Python para executar ChromaDB: ${pythonPath}`);
            } else {
              throw new Error(`ChromaDB não encontrado. Caminhos testados: ${possiblePaths.join(', ')}`);
            }
          }
        }
      } else {
        command = 'chroma';
        args = ['run', '--host', this.chromaHost, '--port', this.chromaPort, '--path', this.chromaDbPath];
      }

      logger.info(`  Comando: ${command} ${args.join(' ')}`);

      // Preparar variáveis de ambiente
      // IMPORTANTE: Quando executado via NSSM (serviço Windows), o processo não herda
      // as variáveis de ambiente do usuário. Precisamos configurar manualmente.
      const env = { ...process.env };
      if (process.platform === 'win32') {
        // Adicionar o diretório do chroma.exe ao PATH se existir
        if (chromaDir) {
          env.PATH = `${env.PATH};${chromaDir}`;
        }
        
        // Garantir que o Python correto esteja no PATH
        const pythonPaths = [
          'C:\\Python313',
          'C:\\Python313\\Scripts',
          path.join(process.env.USERPROFILE || os.homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python313'),
          path.join(process.env.USERPROFILE || os.homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python313', 'Scripts'),
        ];
        
        // Adicionar Python ao PATH se não estiver
        const currentPath = env.PATH || '';
        for (const pythonPath of pythonPaths) {
          if (fs.existsSync(pythonPath) && !currentPath.includes(pythonPath)) {
            env.PATH = `${pythonPath};${env.PATH}`;
          }
        }
        
        // Configurar PYTHONPATH para incluir os site-packages onde chromadb está instalado
        // Tentar múltiplos caminhos possíveis para site-packages
        // IMPORTANTE: Em ambiente de serviço, USERPROFILE pode não estar disponível
        const homeDir = os.homedir();
        const isServiceEnv = !process.env.USERPROFILE || 
                             process.env.USERPROFILE.includes('systemprofile') ||
                             !process.env.APPDATA ||
                             process.env.APPDATA.includes('systemprofile');
        
        // Em ambiente de serviço, priorizar caminhos hardcoded conhecidos
        const possibleSitePackages = isServiceEnv ? [
          // Caminho hardcoded conhecido (mais confiável em serviços)
          'C:\\Users\\Barbara\\AppData\\Roaming\\Python\\Python313\\site-packages',
          // Tentar usar homeDir mesmo em serviço (pode funcionar)
          path.join(homeDir, 'AppData', 'Roaming', 'Python', 'Python313', 'site-packages'),
          // Python padrão do sistema
          path.join('C:\\Python313', 'Lib', 'site-packages'),
        ] : [
          // Ambiente normal: tentar caminhos do usuário primeiro
          path.join(homeDir, 'AppData', 'Roaming', 'Python', 'Python313', 'site-packages'),
          process.env.APPDATA ? path.join(process.env.APPDATA, 'Python', 'Python313', 'site-packages') : null,
          'C:\\Users\\Barbara\\AppData\\Roaming\\Python\\Python313\\site-packages',
          path.join('C:\\Python313', 'Lib', 'site-packages'),
          path.join(homeDir, 'AppData', 'Local', 'Programs', 'Python', 'Python313', 'Lib', 'site-packages'),
        ].filter((p): p is string => p !== null);
        
        const pythonPathParts: string[] = [];
        const currentPythonPath = env.PYTHONPATH || '';
        
        // Adicionar caminhos existentes do PYTHONPATH atual
        if (currentPythonPath) {
          pythonPathParts.push(...currentPythonPath.split(';').filter(p => p.trim()));
        }
        
        // Adicionar site-packages encontrados (prioridade para os que existem)
        for (const sitePackagesPath of possibleSitePackages) {
          if (sitePackagesPath && fs.existsSync(sitePackagesPath)) {
            const normalizedPath = path.normalize(sitePackagesPath);
            if (!pythonPathParts.some(p => path.normalize(p) === normalizedPath)) {
              pythonPathParts.unshift(normalizedPath); // Adicionar no início para prioridade
              logger.debug(`Site-packages encontrado: ${normalizedPath}`);
            }
          }
        }
        
        // Configurar PYTHONPATH
        if (pythonPathParts.length > 0) {
          env.PYTHONPATH = pythonPathParts.join(';');
          logger.info(`PYTHONPATH configurado: ${env.PYTHONPATH}`);
        } else {
          logger.warn('Nenhum site-packages encontrado para configurar PYTHONPATH');
        }
        
        // Configurar também PYTHONHOME se necessário
        const pythonHome = 'C:\\Python313';
        if (fs.existsSync(pythonHome) && !env.PYTHONHOME) {
          env.PYTHONHOME = pythonHome;
        }
      }

      this.chromaProcess = spawn(command, args, {
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,  // Não usar shell para evitar problemas com aspas
        env,
      });

      // Capturar saída do processo
      if (this.chromaProcess.stdout) {
        this.chromaProcess.stdout.on('data', (data) => {
          const output = data.toString().trim();
          if (output && !output.includes('(((((') && !output.includes('####')) {
            logger.debug(`[ChromaDB] ${output}`);
          }
        });
      }

      if (this.chromaProcess.stderr) {
        this.chromaProcess.stderr.on('data', (data) => {
          const output = data.toString().trim();
          if (output) {
            logger.warn(`[ChromaDB Error] ${output}`);
          }
        });
      }

      this.chromaProcess.on('error', (error) => {
        logger.error(`Erro ao iniciar ChromaDB: ${error.message}`);
      });

      this.chromaProcess.on('exit', (code) => {
        if (code !== null && code !== 0) {
          logger.warn(`ChromaDB encerrado com código ${code}`);
        }
        this.chromaProcess = null;
      });

      // Aguardar inicialização (até 10 segundos)
      logger.info('Aguardando ChromaDB inicializar...');
      const maxAttempts = 20;
      let attempts = 0;

      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const isNowRunning = await this.isRunning();
        if (isNowRunning) {
          logger.info('✅ ChromaDB iniciado com sucesso');
          // Iniciar verificação periódica em background
          this.startPeriodicRetry();
          return;
        }
        
        attempts++;
      }

      // Se não respondeu em 10 segundos, iniciar verificação periódica
      logger.warn('ChromaDB não respondeu imediatamente. Iniciando verificação periódica a cada 2 minutos...');
      this.startPeriodicRetry();
    } catch (error: any) {
      logger.error(`Erro ao iniciar ChromaDB: ${error.message}`);
      
      if (error.code === 'ENOENT') {
        logger.error('');
        logger.error('❌ ChromaDB não encontrado no PATH');
        logger.error('');
        logger.error('💡 Soluções:');
        logger.error('   1. Instale o ChromaDB: pip install chromadb');
        logger.error('   2. Adicione o Python Scripts ao PATH:');
        logger.error('      - Windows: %APPDATA%\\Python\\Python313\\Scripts');
        logger.error('      - Linux/Mac: ~/.local/bin');
        logger.error('   3. Ou inicie manualmente: chroma run --host localhost --port 8000 --path ./chroma_db');
        logger.error('');
      }
      
      throw error;
    }
  }

  /**
   * Para o ChromaDB (apenas se foi iniciado pelo backend)
   */
  async stop(): Promise<void> {
    // Parar verificação periódica
    this.stopPeriodicRetry();

    if (this.isManuallyStarted) {
      logger.info('ChromaDB foi iniciado manualmente, não será encerrado automaticamente');
      return;
    }

    if (this.chromaProcess) {
      logger.info('Encerrando ChromaDB...');
      
      try {
        // Tentar encerrar graciosamente
        this.chromaProcess.kill('SIGTERM');
        
        // Aguardar até 3 segundos
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            if (this.chromaProcess && !this.chromaProcess.killed) {
              this.chromaProcess.kill('SIGKILL');
            }
            resolve();
          }, 3000);

          if (this.chromaProcess) {
            this.chromaProcess.on('exit', () => {
              clearTimeout(timeout);
              resolve();
            });
          } else {
            clearTimeout(timeout);
            resolve();
          }
        });

        logger.info('ChromaDB encerrado');
      } catch (error: any) {
        logger.error(`Erro ao encerrar ChromaDB: ${error.message}`);
      }
      
      this.chromaProcess = null;
    }
  }

  /**
   * Retorna a URL do ChromaDB
   */
  getUrl(): string {
    return this.chromaUrl;
  }

  /**
   * Inicia verificação periódica do ChromaDB a cada 2 minutos
   */
  private async startPeriodicRetry(): Promise<void> {
    // Limpar intervalo anterior se existir
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
      this.retryInterval = null;
    }

    // Verificar se já está rodando antes de iniciar o intervalo
    const running = await this.isRunning();
    if (running) {
      logger.info('✅ ChromaDB já está disponível');
      this.isRetrying = false;
      return;
    }

    // Se já está tentando, não iniciar outra tentativa
    if (this.isRetrying) {
      return;
    }

    this.isRetrying = true;
    logger.info('🔄 Iniciando verificação periódica do ChromaDB (a cada 2 minutos)...');

    this.retryInterval = setInterval(async () => {
      try {
        const isRunning = await this.isRunning();
        if (isRunning) {
          logger.info('✅ ChromaDB está disponível agora!');
          this.stopPeriodicRetry();
          this.isRetrying = false;
        } else {
          logger.debug('⏳ ChromaDB ainda não está disponível. Tentando novamente em 2 minutos...');
        }
      } catch (error: any) {
        logger.debug(`⏳ Verificação do ChromaDB: ${error.message}`);
      }
    }, 2 * 60 * 1000); // 2 minutos em milissegundos
  }

  /**
   * Para a verificação periódica
   */
  private stopPeriodicRetry(): void {
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
      this.retryInterval = null;
      logger.debug('Verificação periódica do ChromaDB encerrada');
    }
    this.isRetrying = false;
  }

  /**
   * Retorna o status do ChromaDB
   */
  async getStatus(): Promise<{ running: boolean; url: string; managedByBackend: boolean }> {
    const running = await this.isRunning();
    return {
      running,
      url: this.chromaUrl,
      managedByBackend: this.chromaProcess !== null,
    };
  }
}

// Singleton
export const chromaManager = new ChromaManager();

