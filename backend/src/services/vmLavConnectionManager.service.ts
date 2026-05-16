/**
 * Gerenciador de Conexão VM Lav
 * Gerencia estado do token, renovação automática e keep-alive
 * 
 * ✅ ATUALIZADO: Usa páginas dedicadas para cada operação
 * Isso evita o erro "Network.setExtraHTTPHeaders timed out" causado
 * por concorrência ao compartilhar uma única página entre operações
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import axios from 'axios';
import logger from '../utils/logger';

// IMPORTANTE: Configurar cache do Puppeteer ANTES de qualquer uso
// ✅ CORREÇÃO: Usar LOCALAPPDATA no Windows para evitar cache do sistema
// Isso evita que o Puppeteer tente usar o cache do sistema do Windows
// (C:\WINDOWS\system32\config\systemprofile\.puppeteer_cache)
if (!process.env.PUPPETEER_CACHE_DIR) {
  let userCacheDir: string = '';
  
  if (process.platform === 'win32') {
    // ✅ No Windows, usar LOCALAPPDATA que é mais confiável que os.homedir()
    // Isso evita o problema quando o processo roda como serviço
    const localAppData = process.env.LOCALAPPDATA || process.env.APPDATA || os.homedir();
    
    // Tentar encontrar cache existente primeiro
    const possiblePaths = [
      path.join(localAppData, '.cache', 'puppeteer'),
      path.join(localAppData, '.puppeteer_cache'),
      path.join(os.homedir(), '.cache', 'puppeteer'),
      path.join(os.homedir(), '.puppeteer_cache'),
    ];
    
    // Usar o primeiro diretório que existe e contém Chrome
    let foundCache = false;
    for (const cachePath of possiblePaths) {
      if (fs.existsSync(cachePath)) {
        // Verificar se contém Chrome
        const findChrome = (dir: string, depth: number = 0): boolean => {
          if (depth > 3) return false;
          try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
              const fullPath = path.join(dir, entry.name);
              if (entry.isFile() && entry.name === 'chrome.exe') return true;
              if (entry.isDirectory() && (entry.name.includes('chrome') || entry.name.includes('win'))) {
                if (findChrome(fullPath, depth + 1)) return true;
              }
            }
          } catch {}
          return false;
        };
        
        if (findChrome(cachePath)) {
          userCacheDir = cachePath;
          foundCache = true;
          logger.info(`✅ Cache do Puppeteer encontrado (com Chrome) em: ${userCacheDir}`);
          break;
        }
      }
    }
    
    // Se não encontrou cache existente, usar LOCALAPPDATA
    if (!foundCache) {
      userCacheDir = path.join(localAppData, '.puppeteer_cache');
    }
  } else {
    // Linux/Mac: usar cache padrão
    const defaultCacheDir = path.join(os.homedir(), '.cache', 'puppeteer');
    const fallbackCacheDir = path.join(os.homedir(), '.puppeteer_cache');
    userCacheDir = fs.existsSync(defaultCacheDir) ? defaultCacheDir : fallbackCacheDir;
  }
  
  // Garantir que userCacheDir está definido
  if (!userCacheDir) {
    userCacheDir = path.join(process.cwd(), '.puppeteer_cache');
  }
  
  process.env.PUPPETEER_CACHE_DIR = userCacheDir;
  
  // Criar diretório de cache se não existir
  if (!fs.existsSync(userCacheDir)) {
    try {
      fs.mkdirSync(userCacheDir, { recursive: true });
      logger.info(`✅ Cache do Puppeteer criado em: ${userCacheDir}`);
    } catch (error: any) {
      logger.error(`❌ Erro ao criar cache do Puppeteer: ${error.message}`);
      // Fallback para um caminho alternativo no diretório do projeto
      const fallbackPath = path.join(process.cwd(), '.puppeteer_cache');
      try {
        fs.mkdirSync(fallbackPath, { recursive: true });
        process.env.PUPPETEER_CACHE_DIR = fallbackPath;
        logger.info(`✅ Cache do Puppeteer criado em fallback: ${fallbackPath}`);
      } catch (fallbackError: any) {
        logger.error(`❌ Erro ao criar cache fallback: ${fallbackError.message}`);
      }
    }
  } else {
    logger.info(`✅ Cache do Puppeteer encontrado em: ${userCacheDir}`);
  }
} else {
  logger.info(`✅ Cache do Puppeteer configurado via env: ${process.env.PUPPETEER_CACHE_DIR}`);
}
import { VmLavConnectionLogger } from '../utils/vmLavConnectionLogger';
import { VmLavCredentialsModel, VmLavCredentials } from '../models/vmLavCredentials.model';
import {
  renovarTokenMetodo4A_PageGoto_Fixo,
  renovarTokenMetodo4B_PageGoto_Dinamico,
  obterTempoRestanteToken,
} from '../utils/vmLavTokenRenewal';

export class VmLavConnectionManager {
  private credentialsModel: VmLavCredentialsModel;
  private browser: Browser | null = null;
  private tokenCache: Map<number, string> = new Map(); // userId -> token
  private isRenovando: Map<number, boolean> = new Map(); // userId -> isRenovando
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private monitorInterval: NodeJS.Timeout | null = null;
  private browserInactiveCheckInterval: NodeJS.Timeout | null = null; // ✅ NOVO: Monitor de browser inativo
  
  // Configuração do Puppeteer (calculada uma vez)
  private puppeteerConfig: any = null;
  private chromeExecPath: string | undefined = undefined;
  
  // ✅ Sistema de lock para evitar concorrência no navegador
  private browserLock: Map<string, Promise<any>> = new Map(); // operationKey -> Promise
  
  // ✅ NOVO: Controle de inatividade do browser
  private browserLastUsed: number = 0;
  private readonly BROWSER_IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutos de inatividade

  constructor() {
    this.credentialsModel = new VmLavCredentialsModel();
    this.detectarChrome(); // Detectar Chrome na inicialização
  }
  
  /**
   * Detecta o Chrome instalado no sistema (executado uma vez na inicialização)
   */
  private detectarChrome(): void {
    if (process.platform === 'win32') {
      // 1. Primeiro tentar encontrar Chrome instalado no sistema
      const CHROME_CANDIDATES = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        process.env.PROGRAMFILES ? path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
        process.env['PROGRAMFILES(X86)'] ? path.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
        process.env.PROGRAMFILES ? path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application') : '',
        process.env['PROGRAMFILES(X86)'] ? path.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application') : '',
      ].filter(p => p);
      
      for (const p of CHROME_CANDIDATES) {
        if (!fs.existsSync(p)) continue;
        try {
          const stat = fs.statSync(p);
          if (stat.isDirectory()) {
            const exe = path.join(p, 'chrome.exe');
            if (fs.existsSync(exe)) {
              this.chromeExecPath = exe;
              logger.info(`✅ Chrome encontrado no sistema para VmLav: ${this.chromeExecPath}`);
              return;
            }
          } else if (stat.isFile() && p.endsWith('.exe')) {
            this.chromeExecPath = p;
            logger.info(`✅ Chrome encontrado no sistema para VmLav: ${this.chromeExecPath}`);
            return;
          }
        } catch (error: any) {
          // Ignorar erros
        }
      }
      
      // 2. Se não encontrou no sistema, tentar encontrar Chrome instalado via Puppeteer
      if (!this.chromeExecPath) {
        const findChromeInDir = (dir: string, depth: number = 0): string | null => {
          if (depth > 5) return null;
          try {
            if (!fs.existsSync(dir)) return null;
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
              const fullPath = path.join(dir, entry.name);
              if (entry.isFile() && entry.name === 'chrome.exe') {
                return fullPath;
              } else if (entry.isDirectory() && (entry.name.includes('chrome') || entry.name.includes('win'))) {
                const found = findChromeInDir(fullPath, depth + 1);
                if (found) return found;
              }
            }
          } catch (error: any) {
            // Ignorar erros
          }
          return null;
        };
        
        // ✅ MELHORADO: Buscar primeiro no cache configurado, depois em outros locais
        const puppeteerCachePaths = [
          process.env.PUPPETEER_CACHE_DIR, // Prioridade: cache configurado
          process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, '.puppeteer_cache') : null,
          process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, '.cache', 'puppeteer') : null,
          path.join(os.homedir(), '.cache', 'puppeteer'),
          path.join(os.homedir(), '.puppeteer_cache'),
          path.join(process.cwd(), '.puppeteer_cache'),
        ].filter(p => p);
        
        for (const cachePath of puppeteerCachePaths) {
          if (!cachePath) continue;
          try {
            const foundChrome = findChromeInDir(cachePath);
            if (foundChrome && fs.existsSync(foundChrome)) {
              this.chromeExecPath = foundChrome;
              logger.info(`✅ Chrome instalado via Puppeteer encontrado para VmLav: ${this.chromeExecPath}`);
              return;
            }
          } catch (error: any) {
            // Ignorar erros
          }
        }
      }
    }
    
    if (!this.chromeExecPath) {
      logger.warn(`⚠️ Chrome não encontrado. Puppeteer tentará usar Chromium do cache.`);
      logger.warn(`💡 Cache configurado: ${process.env.PUPPETEER_CACHE_DIR || 'não definido'}`);
    }
  }
  
  /**
   * Obtém a configuração do Puppeteer
   * ✅ MELHORADO: Força o uso do cache correto
   */
  private getPuppeteerConfig(): any {
    if (this.puppeteerConfig) {
      return this.puppeteerConfig;
    }
    
    this.puppeteerConfig = {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      protocolTimeout: 60000,
      timeout: 60000,
    };
    
    // ✅ FORÇAR cache path se configurado
    if (process.env.PUPPETEER_CACHE_DIR) {
      // O Puppeteer usa esta variável internamente, mas vamos garantir que está setada
      process.env.PUPPETEER_CACHE_DIR = process.env.PUPPETEER_CACHE_DIR;
      logger.info(`✅ Puppeteer usando cache em: ${process.env.PUPPETEER_CACHE_DIR}`);
    }
    
    // Se encontrou Chrome, usar explicitamente
    if (this.chromeExecPath) {
      try {
        const stats = fs.statSync(this.chromeExecPath);
        if (stats.isFile()) {
          this.puppeteerConfig.executablePath = this.chromeExecPath;
          logger.info(`✅ Configurando Puppeteer para usar Chrome em: ${this.chromeExecPath}`);
        }
      } catch (error: any) {
        logger.warn(`Erro ao verificar Chrome: ${error.message}`);
        // Não definir executablePath - deixar Puppeteer usar Chromium
        logger.info(`Usando Chromium padrão do Puppeteer`);
      }
    } else {
      // Não definir executablePath - deixar Puppeteer baixar/usar Chromium automaticamente
      logger.info(`Usando Chromium padrão do Puppeteer (será baixado automaticamente se necessário)`);
    }
    
    return this.puppeteerConfig;
  }
  
  /**
   * ✅ Adquire lock exclusivo para usar o navegador
   * Isso evita que múltiplas operações tentem controlar o navegador simultaneamente
   */
  private async acquireBrowserLock(operationKey: string): Promise<void> {
    // Se já existe um lock para esta operação específica, aguardar
    while (this.browserLock.has(operationKey)) {
      logger.debug(`[Browser Lock] Aguardando lock para operação: ${operationKey}`);
      await this.browserLock.get(operationKey);
      await new Promise(resolve => setTimeout(resolve, 100)); // pequeno delay
    }
    
    // Se há qualquer outro lock ativo, aguardar
    while (this.browserLock.size > 0) {
      logger.debug(`[Browser Lock] Aguardando outros locks (${this.browserLock.size} ativos)`);
      await Promise.race(Array.from(this.browserLock.values()));
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Criar o lock
    let resolveLock: Function;
    const lockPromise = new Promise<void>(resolve => {
      resolveLock = resolve;
    });
    
    this.browserLock.set(operationKey, lockPromise);
    logger.debug(`[Browser Lock] Lock adquirido para: ${operationKey}`);
    
    // Retornar função para liberar o lock
    return resolveLock! as any;
  }
  
  /**
   * ✅ Libera lock do navegador
   */
  private releaseBrowserLock(operationKey: string): void {
    this.browserLock.delete(operationKey);
    logger.debug(`[Browser Lock] Lock liberado para: ${operationKey}`);
  }

  /**
   * ✅ NOVO: Verifica e fecha browser se estiver inativo há muito tempo
   */
  private async verificarEfecharBrowserInativo(): Promise<void> {
    if (!this.browser) return;
    
    // Se há locks ativos, não fechar
    if (this.browserLock.size > 0) {
      return;
    }
    
    const now = Date.now();
    const idleTime = now - this.browserLastUsed;
    
    if (idleTime > this.BROWSER_IDLE_TIMEOUT) {
      logger.info(`🔒 Fechando browser VM Lav (inativo há ${Math.floor(idleTime / 1000)}s)`);
      try {
        await this.browser.close();
        this.browser = null;
        this.browserLastUsed = 0;
      } catch (error: any) {
        logger.warn(`Erro ao fechar browser inativo: ${error.message}`);
      }
    }
  }

  /**
   * Inicializa o gerenciador de conexão
   * 
   * LÓGICA DE RENOVAÇÃO:
   * - Monitor (5 min): Verifica tokens; renova APENAS quando ≤30 min restantes
   * - Keep-alive (10 min): GET de teste; renova se 401/403
   * - Startup: Verifica e renova tokens imediatamente se necessário
   * - Browser Monitor (1 min): Fecha browser inativo após 5 min
   * 
   * Isso evita bloqueio por excesso de requisições ao servidor VM Lav
   */
  async initialize(): Promise<void> {
    logger.info('🔄 Inicializando VmLavConnectionManager...');
    
    // ✅ STARTUP: Verificar e renovar tokens imediatamente
    logger.info('📋 Verificando tokens no startup...');
    try {
      await this.monitorarTokens();
      logger.info('✅ Verificação inicial de tokens concluída');
    } catch (error: any) {
      logger.error(`Erro na verificação inicial de tokens: ${error.message}`);
    }
    
    // Iniciar monitor de expiração (a cada 5 minutos)
    // IMPORTANTE: Só renova quando tempo restante ≤ 30 min
    this.monitorInterval = setInterval(() => {
      this.monitorarTokens().catch(error => {
        logger.error(`Erro no monitor de tokens: ${error.message}`);
      });
    }, 5 * 60 * 1000); // 5 minutos

    // Iniciar keep-alive (a cada 10 minutos)
    // Faz GET de teste; força renovação se receber 401/403
    this.keepAliveInterval = setInterval(() => {
      this.executarKeepAlive().catch(error => {
        logger.error(`Erro no keep-alive: ${error.message}`);
      });
    }, 10 * 60 * 1000); // 10 minutos

    // ✅ NOVO: Monitor para fechar browser inativo (a cada 1 minuto)
    this.browserInactiveCheckInterval = setInterval(() => {
      this.verificarEfecharBrowserInativo().catch(error => {
        logger.error(`Erro ao verificar browser inativo: ${error.message}`);
      });
    }, 60 * 1000); // 1 minuto

    logger.info('✅ VmLavConnectionManager inicializado');
    logger.info('   📊 Monitor de tokens: a cada 5 min (renova quando ≤30 min restantes)');
    logger.info('   🔄 Keep-alive: a cada 10 min (força renovação em 401/403)');
    logger.info('   🔒 Monitor de browser: a cada 1 min (fecha se inativo >5 min)');
  }

  /**
   * Para o gerenciador de conexão
   */
  async shutdown(): Promise<void> {
    logger.info('Encerrando VmLavConnectionManager...');

    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }

    // ✅ NOVO: Limpar monitor de browser inativo
    if (this.browserInactiveCheckInterval) {
      clearInterval(this.browserInactiveCheckInterval);
      this.browserInactiveCheckInterval = null;
    }

    if (this.browser) {
      try {
        await this.browser.close();
      } catch (error: any) {
        logger.warn(`Erro ao fechar browser: ${error.message}`);
      }
      this.browser = null;
      this.browserLastUsed = 0;
    }

    logger.info('VmLavConnectionManager encerrado');
  }

  /**
   * ✅ NOVO: Obtém ou cria apenas a instância do browser (sem página)
   * ATUALIZADO: Registra timestamp de uso para controle de inatividade
   */
  private async getBrowserOnly(): Promise<Browser> {
    // Verificar se browser inativo precisa ser fechado
    await this.verificarEfecharBrowserInativo();
    
    if (!this.browser) {
      const config = this.getPuppeteerConfig();
      
      logger.info(`Iniciando Puppeteer com configuração: ${JSON.stringify({ 
        headless: config.headless, 
        hasExecutablePath: !!config.executablePath,
        executablePath: config.executablePath || 'não definido (usando Chromium)',
        cacheDir: process.env.PUPPETEER_CACHE_DIR || 'não definido'
      })}`);
      
      try {
        this.browser = await puppeteer.launch(config);
      } catch (error: any) {
        logger.error(`❌ Erro ao iniciar Puppeteer: ${error.message}`);
        
        // ✅ FALLBACK: Se falhar com Chrome, tentar sem executablePath (usar Chromium)
        if (config.executablePath) {
          logger.warn(`Tentando fallback: usar Chromium do Puppeteer em vez de Chrome`);
          const fallbackConfig = { ...config };
          delete fallbackConfig.executablePath;
          
          try {
            this.browser = await puppeteer.launch(fallbackConfig);
            logger.info(`✅ Puppeteer iniciado com sucesso usando Chromium (fallback)`);
          } catch (fallbackError: any) {
            logger.error(`❌ Erro no fallback do Puppeteer: ${fallbackError.message}`);
            throw new Error(`Não foi possível iniciar Puppeteer: ${error.message}. Fallback também falhou: ${fallbackError.message}`);
          }
        } else {
          throw error;
        }
      }
      
      // Tratar evento de desconexão do browser
      this.browser.on('disconnected', () => {
        logger.warn('Browser Puppeteer foi desconectado');
        this.browser = null;
        this.browserLastUsed = 0;
      });
    }
    
    // ✅ Atualizar timestamp de uso
    this.browserLastUsed = Date.now();
    
    return this.browser;
  }
  
  /**
   * ✅ NOVO: Cria uma página dedicada para uma operação específica
   * A página é NOVA e LIMPA, sem estado de operações anteriores
   */
  private async criarPaginaDedicada(): Promise<Page> {
    const browser = await this.getBrowserOnly();
    const page = await browser.newPage();
    
    // Configurar timeout padrão para a página
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(30000);
    
    return page;
  }
  
  /**
   * ✅ NOVO: Restaura sessão em uma página específica (não compartilhada)
   */
  private async restaurarSessaoNaPagina(page: Page, credentials: VmLavCredentials): Promise<void> {
    // Navegar para a aplicação
    await page.goto('https://vmlav.vmhub.vmtecnologia.io', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // Restaurar cookies
    if (credentials.cookies) {
      const cookies = Array.isArray(credentials.cookies)
        ? credentials.cookies
        : JSON.parse(credentials.cookies || '[]');
      if (cookies.length > 0) {
        await page.setCookie(...cookies);
      }
    }

    // Restaurar localStorage
    if (credentials.dados_localstorage) {
      const localStorageData =
        typeof credentials.dados_localstorage === 'string'
          ? JSON.parse(credentials.dados_localstorage)
          : credentials.dados_localstorage;

      await page.evaluate((localStorageData) => {
        // @ts-ignore
        for (const key in localStorageData) {
          // @ts-ignore
          window.localStorage.setItem(key, localStorageData[key]);
        }
      }, localStorageData);
    }

    // Recarregar página para aplicar localStorage
    await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  /**
   * Monitora tokens e renova se necessário
   * LÓGICA: Só renova quando tempo restante ≤ 30 min
   * - > 30 min: Apenas loga, NÃO renova (evita bloqueio por excesso de requisições)
   * - ≤ 30 min: Entra em "modo de renovação" - tenta a cada ciclo (5 min) até sucesso
   * - ≤ 0 min: Token expirado - renovação urgente
   */
  private async monitorarTokens(): Promise<void> {
    try {
      const credentials = await this.credentialsModel.findAll();
      
      for (const cred of credentials) {
        if (!cred.token_aplicacao || !cred.ativo) continue;

        const tempoRestante = obterTempoRestanteToken(cred.token_aplicacao);
        
        if (tempoRestante === null) {
          // Token inválido/corrompido - renovar imediatamente
          logger.warn(`⚠️ Token INVÁLIDO para user_id ${cred.user_id} - renovando imediatamente`);
          VmLavConnectionLogger.logTokenMonitoring(cred.user_id, null, 'renew');
          await this.renovarToken(cred.user_id);
        } else if (tempoRestante <= 0) {
          // Token já expirou - renovação URGENTE
          logger.error(`🔴 Token EXPIRADO para user_id ${cred.user_id} (${tempoRestante} min) - renovação URGENTE`);
          VmLavConnectionLogger.logTokenMonitoring(cred.user_id, tempoRestante, 'renew');
          await this.renovarToken(cred.user_id);
        } else if (tempoRestante <= 30) {
          // Token expirando em ≤30 min - MODO DE RENOVAÇÃO
          // Tenta renovar; se falhar, tentará novamente no próximo ciclo (5 min)
          logger.info(`🔄 Token expirando para user_id ${cred.user_id} (${tempoRestante} min) - renovando proativamente`);
          VmLavConnectionLogger.logTokenMonitoring(cred.user_id, tempoRestante, 'renew');
          await this.renovarToken(cred.user_id);
        } else {
          // Token ainda válido por mais de 30 min - NÃO renovar
          // Isso evita bloqueio por excesso de requisições ao servidor VM Lav
          logger.debug(`✅ Token OK para user_id ${cred.user_id} (${tempoRestante} min restantes)`);
          VmLavConnectionLogger.logTokenMonitoring(cred.user_id, tempoRestante, 'check');
        }
      }
    } catch (error: any) {
      logger.error(`Erro ao monitorar tokens: ${error.message}`);
    }
  }

  /**
   * Executa keep-alive para todos os usuários ativos
   * ✅ OTIMIZADO: Usa axios diretamente em vez de Puppeteer
   * Isso evita conflitos de página e é muito mais rápido
   */
  private async executarKeepAlive(): Promise<void> {
    logger.info(`🔄 [Keep-Alive] Iniciando verificação de conexão...`);
    try {
      const credentials = await this.credentialsModel.findAll();
      
      for (const cred of credentials) {
        if (!cred.token_aplicacao || !cred.ativo) continue;
        
        logger.debug(`🔄 [Keep-Alive] Verificando user_id ${cred.user_id}...`);

        try {
          // ✅ Usar axios diretamente (muito mais rápido e sem conflitos)
          const keepAliveUrl = 'https://apps.vmhub.vmtecnologia.io/vmlav/api/v1/relatorios/clientes';
          
          const startTime = Date.now();
          const response = await axios.post(keepAliveUrl, null, {
            params: {
              execCount: true,
              pagina: 0,
              quantidade: 1,
              direcaoOrdenacao: 'ASC',
              campoOrdenacao: 'cliente.nome',
            },
            headers: {
              'Authorization': `Bearer ${cred.token_aplicacao}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json, text/plain, */*',
              'X-Vm-App': 'vmlav',
              'X-Vm-Emp': 'lavateriajdnovomundo',
            },
            timeout: 30000,
          });
          const elapsed = Date.now() - startTime;

          if (response.status === 200) {
            logger.info(`✅ Keep-alive OK para user_id ${cred.user_id} (${elapsed}ms)`);
            VmLavConnectionLogger.logKeepAlive(cred.user_id, true, response.status);
            // Atualizar cache
            this.tokenCache.set(cred.user_id, cred.token_aplicacao);
          } else if (response.status === 401 || response.status === 403) {
            // Token inválido - renovar
            logger.error(`🔴 Keep-alive detectou token INVÁLIDO para user_id ${cred.user_id} (status: ${response.status}) - renovação URGENTE`);
            VmLavConnectionLogger.logKeepAlive(cred.user_id, false, response.status);
            await this.renovarToken(cred.user_id);
          } else if (response.status >= 500 && response.status < 600) {
            // Erro do servidor - não renovar token
            logger.warn(`⚠️ Keep-alive: Servidor VM Lav retornou erro ${response.status} para user_id ${cred.user_id} (erro temporário do servidor)`);
            VmLavConnectionLogger.logKeepAlive(cred.user_id, false, response.status, `Server error`);
            // NÃO renovar token - erro do servidor, não do token
          } else {
            // Outro status (ex: 400, 404, etc.)
            logger.warn(`⚠️ Keep-alive retornou status ${response.status} para user_id ${cred.user_id}`);
            VmLavConnectionLogger.logKeepAlive(cred.user_id, false, response.status);
            // Não renovar token para outros erros
          }
        } catch (error: any) {
          // Determinar severidade baseada no erro
          const status = error.response?.status;
          const isTokenInvalido = status === 401 || status === 403;
          const isServerError = status >= 500 && status < 600;
          
          if (isTokenInvalido) {
            // Token inválido/expirado - Renovação URGENTE
            logger.error(`🔴 Keep-alive detectou token INVÁLIDO para user_id ${cred.user_id} (status: ${status}) - renovação URGENTE`);
            VmLavConnectionLogger.logKeepAlive(cred.user_id, false, status, error.message);
            await this.renovarToken(cred.user_id);
          } else if (isServerError) {
            // Erro do servidor (500, 502, 503, etc.) - Não é problema nosso
            // Não tentar renovar token, apenas logar como aviso
            logger.warn(`⚠️ Keep-alive: Servidor VM Lav retornou erro ${status} para user_id ${cred.user_id} (erro temporário do servidor)`);
            VmLavConnectionLogger.logKeepAlive(cred.user_id, false, status, `Server error: ${error.message}`);
            // NÃO renovar token - erro do servidor, não do token
          } else {
            // Outro erro (rede, timeout, etc.)
            logger.warn(`⚠️ Keep-alive falhou para user_id ${cred.user_id}: ${error.message} (status: ${status || 'N/A'})`);
            VmLavConnectionLogger.logKeepAlive(cred.user_id, false, status, error.message);
            // Não renovar token para erros de rede/timeout
          }
        }
      }
      logger.info(`✅ [Keep-Alive] Verificação concluída para todos os usuários`);
    } catch (error: any) {
      logger.error(`❌ [Keep-Alive] Erro ao executar keep-alive: ${error.message}`);
    }
  }

  /**
   * Renova token com fallback em cascata
   * ✅ ATUALIZADO: Usa página dedicada para cada operação
   */
  async renovarToken(userId: number): Promise<string | null> {
    // Evitar múltiplas renovações simultâneas
    if (this.isRenovando.get(userId)) {
      logger.debug(`Renovação já em andamento para user_id ${userId}`);
      return null;
    }

    this.isRenovando.set(userId, true);
    
    const operationKey = `renovar_token_${userId}`;
    let releaseLock: Function | null = null;
    let dedicatedPage: Page | null = null;

    try {
      // ✅ Adquirir lock exclusivo do navegador
      releaseLock = await this.acquireBrowserLock(operationKey) as any;
      
      const credentials = await this.credentialsModel.findByUserId(userId);
      if (!credentials || !credentials.token_aplicacao) {
        logger.warn(`Credenciais não encontradas para user_id ${userId}`);
        return null;
      }

      // ✅ Criar página dedicada para esta operação
      dedicatedPage = await this.criarPaginaDedicada();

      // Restaurar sessão se necessário
      if (credentials.dados_localstorage && credentials.cookies) {
        await this.restaurarSessaoNaPagina(dedicatedPage, credentials);
      }

      // Nível 1: Método 4B (dinâmico)
      logger.info(`Tentando renovar token para user_id ${userId} - Método 4B (dinâmico)`);
      let resultado = await renovarTokenMetodo4B_PageGoto_Dinamico(dedicatedPage, credentials.token_aplicacao);
      
      if (resultado.success && resultado.token) {
        await this.salvarTokenDireto(userId, resultado.token, credentials);
        logger.info(`✅ Token renovado com sucesso para user_id ${userId} (Método 4B)`);
        const tempoRestante = obterTempoRestanteToken(resultado.token);
        VmLavConnectionLogger.logTokenRenewal(userId, true, '4B (Dinâmico)', undefined, tempoRestante);
        return resultado.token;
      }

      // Nível 2: Método 4A (fixo)
      logger.info(`Método 4B falhou, tentando Método 4A (fixo) para user_id ${userId}`);
      resultado = await renovarTokenMetodo4A_PageGoto_Fixo(dedicatedPage, credentials.token_aplicacao);
      
      if (resultado.success && resultado.token) {
        await this.salvarTokenDireto(userId, resultado.token, credentials);
        logger.info(`✅ Token renovado com sucesso para user_id ${userId} (Método 4A)`);
        const tempoRestante = obterTempoRestanteToken(resultado.token);
        VmLavConnectionLogger.logTokenRenewal(userId, true, '4A (Fixo)', undefined, tempoRestante);
        return resultado.token;
      }

      // Nível 3: Usar token_inicial para obter novo token_aplicacao via VmLavService
      if (credentials.token_inicial) {
        logger.warn(`Métodos 4A e 4B falharam, tentando Nível 3 (token_inicial) para user_id ${userId}`);
        VmLavConnectionLogger.logTokenRenewal(userId, false, '4B/4A', 'Tentando Nível 3: token_inicial');
        
        try {
          const { VmLavService } = await import('./vmLav.service');
          const vmLavService = new VmLavService();
          const novoToken = await vmLavService.obterTokenAplicacao(credentials.token_inicial);
          
          if (novoToken) {
            await this.salvarTokenDireto(userId, novoToken, credentials);
            logger.info(`✅ Token renovado com sucesso para user_id ${userId} (Nível 3: token_inicial)`);
            const tempoRestante = obterTempoRestanteToken(novoToken);
            VmLavConnectionLogger.logTokenRenewal(userId, true, 'Nível 3 (token_inicial)', undefined, tempoRestante);
            return novoToken;
          } else {
            logger.warn(`Nível 3 falhou para user_id ${userId}: token_inicial não retornou novo token`);
          }
        } catch (error: any) {
          logger.error(`Nível 3 falhou para user_id ${userId}: ${error.message}`);
        }
      }

      // Nível 4: Tentar restaurar sessão via cookies/localStorage salvos
      // IMPORTANTE: Fazemos um reload para forçar o servidor a renovar o token automaticamente
      if (credentials.dados_localstorage && credentials.cookies) {
        logger.warn(`Tentando Nível 4 (restaurar sessão + reload) para user_id ${userId}`);
        VmLavConnectionLogger.logTokenRenewal(userId, false, 'Nível 3', 'Tentando Nível 4: restaurar sessão');
        
        try {
          // Usar a página dedicada que já temos (pode estar com sessão restaurada)
          // Navegar para dashboard para forçar renovação
          await dedicatedPage.goto('https://vmlav.vmhub.vmtecnologia.io/dashboard', {
            waitUntil: 'networkidle2',
            timeout: 30000,
          });
          
          // Aguardar um pouco para o servidor processar
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // Tentar extrair token do localStorage após navegação
          const tokenRestaurado = await dedicatedPage.evaluate(() => {
            // @ts-ignore - window está disponível no contexto do navegador
            const win = window as any;
            return win.localStorage.getItem('authToken') || 
                   win.localStorage.getItem('token') ||
                   win.localStorage.getItem('access_token') ||
                   win.localStorage.getItem('vm_token');
          });
          
          if (tokenRestaurado) {
            const tempoRestanteRestaurado = obterTempoRestanteToken(tokenRestaurado);
            
            // IMPORTANTE: Verificar se o token é diferente do atual (foi realmente renovado)
            const tokenAtualExpirado = credentials.token_aplicacao 
              ? (obterTempoRestanteToken(credentials.token_aplicacao) || 0) <= 0 
              : true;
            const tokenNovoValido = tempoRestanteRestaurado && tempoRestanteRestaurado > 5;
            
            if (tokenNovoValido) {
              // Verificar se é um token diferente ou se o token antigo estava expirado
              if (tokenRestaurado !== credentials.token_aplicacao || tokenAtualExpirado) {
                // Capturar cookies e localStorage atualizados da página dedicada
                const cookiesAtualizados = await dedicatedPage.cookies();
                const localStorageAtualizado = await dedicatedPage.evaluate(() => {
                  // @ts-ignore
                  const storage: any = {};
                  // @ts-ignore
                  for (let i = 0; i < window.localStorage.length; i++) {
                    // @ts-ignore
                    const key = window.localStorage.key(i);
                    if (key) {
                      // @ts-ignore
                      storage[key] = window.localStorage.getItem(key);
                    }
                  }
                  return storage;
                });
                
                await this.salvarTokenComDados(userId, tokenRestaurado, credentials, cookiesAtualizados, localStorageAtualizado);
                logger.info(`✅ Token restaurado com sucesso para user_id ${userId} (Nível 4: sessão) - ${tempoRestanteRestaurado} min restantes`);
                VmLavConnectionLogger.logTokenRenewal(userId, true, 'Nível 4 (sessão)', undefined, tempoRestanteRestaurado);
                return tokenRestaurado;
              } else {
                logger.warn(`Nível 4: Token não foi renovado pelo servidor (mesmo token, ${tempoRestanteRestaurado} min restantes)`);
              }
            } else {
              logger.warn(`Nível 4 falhou para user_id ${userId}: token restaurado está expirado ou inválido (${tempoRestanteRestaurado} min)`);
            }
          } else {
            logger.warn(`Nível 4 falhou para user_id ${userId}: nenhum token encontrado no localStorage`);
          }
        } catch (error: any) {
          logger.error(`Nível 4 falhou para user_id ${userId}: ${error.message}`);
        }
      }

      // Nível 5: Falha total - Marcar credencial com erro e notificar
      logger.error(`❌ FALHA TOTAL: Todos os níveis de renovação falharam para user_id ${userId}`);
      logger.error(`⚠️ INTERVENÇÃO MANUAL NECESSÁRIA - Login com CAPTCHA requerido para user_id ${userId}`);
      
      // Marcar credencial como erro para que o dashboard exiba alerta
      try {
        await this.credentialsModel.update(credentials.id, {
          status: 'erro',
          ultimo_erro: `Renovação falhou em todos os níveis em ${new Date().toISOString()}. Intervenção manual necessária.`,
        });
        logger.info(`Credencial user_id ${userId} marcada como 'erro' - requer reconfiguração manual`);
      } catch (updateError: any) {
        logger.error(`Erro ao atualizar status da credencial: ${updateError.message}`);
      }

      VmLavConnectionLogger.logTokenRenewal(userId, false, 'Todos os níveis', 'INTERVENÇÃO MANUAL NECESSÁRIA');
      return null;
    } catch (error: any) {
      logger.error(`Erro ao renovar token para user_id ${userId}: ${error.message}`);
      VmLavConnectionLogger.logTokenRenewal(userId, false, 'Erro', error.message);
      return null;
    } finally {
      // ✅ Fechar página dedicada
      if (dedicatedPage) {
        await dedicatedPage.close().catch(() => {});
      }
      
      // ✅ NOVO: Fechar browser após renovação para liberar recursos
      // Verificar se não há outras operações em andamento
      if (this.browser && this.browserLock.size === 0) {
        try {
          logger.debug('🔒 Fechando browser VM Lav após renovação de token');
          await this.browser.close();
          this.browser = null;
          this.browserLastUsed = 0;
        } catch (error: any) {
          logger.warn(`Erro ao fechar browser: ${error.message}`);
        }
      }
      
      // ✅ Liberar lock do navegador
      if (releaseLock) {
        releaseLock();
        this.releaseBrowserLock(operationKey);
      }
      this.isRenovando.set(userId, false);
    }
  }

  /**
   * ✅ NOVO: Salva token diretamente sem acessar o browser
   * Usa os dados existentes das credenciais como fallback
   */
  private async salvarTokenDireto(userId: number, token: string, credentials: VmLavCredentials): Promise<void> {
    try {
      const expiracao = this.getTokenExpiration(token);
      
      // Usar valores existentes como fallback (não precisa acessar browser)
      const cookiesExistentes = Array.isArray(credentials.cookies) 
        ? credentials.cookies 
        : (credentials.cookies ? JSON.parse(credentials.cookies as any) : []);
      const localStorageExistente = credentials.dados_localstorage || null;

      // Atualizar credenciais com token, expiração
      await this.credentialsModel.update(credentials.id, {
        token_aplicacao: token,
        token_expira_em: expiracao,
        cookies: cookiesExistentes,
        dados_localstorage: localStorageExistente,
        status: 'ativo',
        ultimo_erro: null,
      });
      
      this.tokenCache.set(userId, token);
      logger.debug(`Token atualizado no banco para user_id ${userId}`);
      
      VmLavConnectionLogger.logCredentialsUpdate(
        userId,
        ['token_aplicacao', 'token_expira_em', 'status', 'ultimo_erro'],
        true
      );
    } catch (error: any) {
      logger.error(`Erro ao salvar token para user_id ${userId}: ${error.message}`);
      VmLavConnectionLogger.logCredentialsUpdate(userId, [], false, error.message);
    }
  }
  
  /**
   * ✅ NOVO: Salva token com cookies e localStorage atualizados
   */
  private async salvarTokenComDados(
    userId: number, 
    token: string, 
    credentials: VmLavCredentials,
    cookies: any[],
    localStorage: any
  ): Promise<void> {
    try {
      const expiracao = this.getTokenExpiration(token);

      // Atualizar credenciais com token, expiração, cookies e localStorage
      await this.credentialsModel.update(credentials.id, {
        token_aplicacao: token,
        token_expira_em: expiracao,
        cookies: cookies,
        dados_localstorage: localStorage,
        status: 'ativo',
        ultimo_erro: null,
      });
      
      this.tokenCache.set(userId, token);
      logger.info(`Token, cookies e localStorage atualizados no banco para user_id ${userId}`);
      
      VmLavConnectionLogger.logCredentialsUpdate(
        userId,
        ['token_aplicacao', 'token_expira_em', 'cookies', 'dados_localstorage', 'status', 'ultimo_erro'],
        true
      );
    } catch (error: any) {
      logger.error(`Erro ao salvar token para user_id ${userId}: ${error.message}`);
      VmLavConnectionLogger.logCredentialsUpdate(userId, [], false, error.message);
    }
  }

  /**
   * Obtém data de expiração do token
   */
  private getTokenExpiration(token: string): Date | null {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      const exp = payload.exp;
      if (exp) {
        return new Date(exp * 1000);
      }
    } catch (e) {
      // Ignorar
    }
    return null;
  }

  /**
   * Obtém token válido (do cache ou banco)
   */
  async obterTokenValido(userId: number): Promise<string | null> {
    // Verificar cache primeiro
    const cachedToken = this.tokenCache.get(userId);
    if (cachedToken) {
      const tempoRestante = obterTempoRestanteToken(cachedToken);
      if (tempoRestante !== null && tempoRestante > 0) {
        return cachedToken;
      }
      // Token expirado no cache, remover
      this.tokenCache.delete(userId);
    }

    // Buscar do banco
    const credentials = await this.credentialsModel.findByUserId(userId);
    if (!credentials || !credentials.token_aplicacao) {
      return null;
    }

    const tempoRestante = obterTempoRestanteToken(credentials.token_aplicacao);
    if (tempoRestante === null || tempoRestante <= 0) {
      // Token expirado, tentar renovar
      return await this.renovarToken(userId);
    }

    // Atualizar cache
    this.tokenCache.set(userId, credentials.token_aplicacao);
    return credentials.token_aplicacao;
  }
}

// Instância singleton
let connectionManagerInstance: VmLavConnectionManager | null = null;

export function getVmLavConnectionManager(): VmLavConnectionManager {
  if (!connectionManagerInstance) {
    connectionManagerInstance = new VmLavConnectionManager();
  }
  return connectionManagerInstance;
}
