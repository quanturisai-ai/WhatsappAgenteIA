import puppeteer, { Browser, LaunchOptions } from 'puppeteer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import logger from './logger';

/**
 * Utilitário centralizado para configuração e inicialização do Puppeteer
 */

let chromeExecPath: string | undefined = undefined;

/**
 * Detecta o Google Chrome instalado no sistema
 */
export function detectChrome(): string | undefined {
    if (chromeExecPath) return chromeExecPath;

    if (process.platform === 'win32') {
        const CHROME_CANDIDATES = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            process.env.PROGRAMFILES ? path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
            process.env['PROGRAMFILES(X86)'] ? path.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
        ].filter(p => p);

        for (const p of CHROME_CANDIDATES) {
            if (fs.existsSync(p)) {
                chromeExecPath = p;
                logger.info(`✅ Google Chrome encontrado em: ${chromeExecPath}`);
                return chromeExecPath;
            }
        }

        // Tentar encontrar Chrome no cache do Puppeteer
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
            } catch (error) { }
            return null;
        };

        const puppeteerCachePaths = [
            path.join(os.homedir(), '.cache', 'puppeteer'),
            path.join(process.env.LOCALAPPDATA || os.homedir(), '.puppeteer_cache'),
            path.join(os.homedir(), '.puppeteer_cache'),
        ];

        for (const cachePath of puppeteerCachePaths) {
            const found = findChromeInDir(cachePath);
            if (found) {
                chromeExecPath = found;
                logger.info(`✅ Chrome (via Puppeteer cache) encontrado em: ${chromeExecPath}`);
                return chromeExecPath;
            }
        }
    }

    return undefined;
}

/**
 * Configura o cache do Puppeteer para um diretório seguro
 */
export function setupPuppeteerCache(): string {
    if (process.env.PUPPETEER_CACHE_DIR) return process.env.PUPPETEER_CACHE_DIR;

    let userCacheDir: string;
    if (process.platform === 'win32') {
        // Usar LOCALAPPDATA para evitar problemas com diretório de sistema
        const localAppData = process.env.LOCALAPPDATA || process.env.APPDATA || os.homedir();
        userCacheDir = path.join(localAppData, '.puppeteer_cache');
    } else {
        userCacheDir = path.join(os.homedir(), '.cache', 'puppeteer');
    }

    if (!fs.existsSync(userCacheDir)) {
        try {
            fs.mkdirSync(userCacheDir, { recursive: true });
            logger.info(`✅ Cache do Puppeteer configurado em: ${userCacheDir}`);
        } catch (error: any) {
            logger.warn(`Não foi possível criar cache do Puppeteer: ${error.message}`);
            // Fallback para o diretório de execução se tudo falhar
            userCacheDir = path.join(process.cwd(), '.puppeteer_cache');
            if (!fs.existsSync(userCacheDir)) {
                try { fs.mkdirSync(userCacheDir, { recursive: true }); } catch (e) { }
            }
        }
    }

    process.env.PUPPETEER_CACHE_DIR = userCacheDir;
    return userCacheDir;
}

/**
 * Retorna as opções recomendadas para o Puppeteer.launch()
 */
export function getPuppeteerConfig(options: Partial<LaunchOptions> = {}): LaunchOptions {
    setupPuppeteerCache();
    const chrome = detectChrome();

    const defaultConfig: any = {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--no-zygote',
            '--disable-extensions',
        ],
    };

    if (chrome) {
        defaultConfig.executablePath = chrome;
    }

    return { ...defaultConfig, ...options };
}

/**
 * Wrapper para puppeteer.launch com configurações recomendadas
 */
export async function launchBrowser(options: Partial<LaunchOptions> = {}): Promise<Browser> {
    const config = getPuppeteerConfig(options);
    try {
        return await puppeteer.launch(config);
    } catch (error: any) {
        logger.error(`❌ Erro ao iniciar Puppeteer: ${error.message}`);

        // Fallback: Se falhar com o Chrome configurado, tenta a versão padrão (Chromium)
        if (config.executablePath) {
            logger.warn('Tentando fallback para Chromium padrão...');
            const fallbackConfig = { ...config };
            delete fallbackConfig.executablePath;
            try {
                return await puppeteer.launch(fallbackConfig);
            } catch (fallbackError: any) {
                logger.error(`❌ Erro no fallback do Puppeteer: ${fallbackError.message}`);
                throw new Error(`Não foi possível iniciar Puppeteer: ${error.message}. Fallback também falhou: ${fallbackError.message}`);
            }
        }
        throw error;
    }
}
