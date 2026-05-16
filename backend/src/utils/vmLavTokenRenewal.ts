/**
 * Utilitários para renovação de token VM Lav
 * Implementa métodos validados: 4A (fixo) e 4B (dinâmico)
 */

import puppeteer, { Page } from 'puppeteer';
import logger from './logger';

const tokenRenovacaoUrlBase = 'https://apps.vmhub.vmtecnologia.io/autenticacao/api/v1/autenticacao/token/renovacao/aplicacao';
const tokenAplicacaoUrl = 'https://apps.vmhub.vmtecnologia.io/conta/api/v1/contas-usuarios/login/aplicacao';

/**
 * Extrai o campo 'auth' do token JWT para usar na URL de renovação
 */
export function extrairAuthDoToken(token: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return payload.auth || null;
  } catch (e) {
    return null;
  }
}

/**
 * Obtém tempo restante até expiração do token em minutos
 */
export function obterTempoRestanteToken(token: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    const exp = payload.exp;
    
    if (!exp) return null;
    
    const agora = Math.floor(Date.now() / 1000);
    const tempoRestante = exp - agora;
    
    return Math.floor(tempoRestante / 60); // Retorna em minutos
  } catch (e) {
    return null;
  }
}

/**
 * MÉTODO 4A: Renova token usando page.goto e interceptação de resposta (authId FIXO = 1737)
 */
export async function renovarTokenMetodo4A_PageGoto_Fixo(
  page: Page,
  tokenAplicacao: string
): Promise<{ success: boolean; token: string | null; status?: number; error?: string }> {
  try {
    const authId = 1737;
    const renovacaoUrl = `${tokenRenovacaoUrlBase}/${authId}`;
    
    let responseData: any = null;
    let responseStatus: number | null = null;
    let responseError: string | null = null;

    // Interceptar resposta
    const responseHandler = async (response: any) => {
      if (response.url().includes('/token/renovacao/aplicacao/')) {
        responseStatus = response.status();
        try {
          const contentType = response.headers()['content-type'] || '';
          if (contentType.includes('application/json')) {
            responseData = await response.json();
          } else {
            responseData = await response.text();
          }
        } catch (error: any) {
          responseError = error.message;
        }
      }
    };

    page.on('response', responseHandler);

    // Navegar para a URL com headers customizados
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'pt',
      'Referer': 'https://vmlav.vmhub.vmtecnologia.io/',
      'Origin': 'https://vmlav.vmhub.vmtecnologia.io',
      'Authorization': `Bearer ${tokenAplicacao}`,
      'X-Vm-App': 'vmlav',
      'X-Vm-Emp': 'lavateriajdnovomundo',
      'Time-Zone': 'America/Sao_Paulo',
      'Priority': 'u=4',
      'Pragma': 'no-cache',
      'Cache-Control': 'no-cache',
    });

    try {
      const response = await page.goto(renovacaoUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      if (response) {
        responseStatus = response.status();
      }

      // Aguardar um pouco para garantir que a resposta foi interceptada
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Remover listener
      page.off('response', responseHandler);

      if (responseError) {
        return {
          success: false,
          error: responseError,
          token: null,
        };
      }

      if (responseStatus && responseStatus >= 200 && responseStatus < 300 && responseData) {
        let tokenExtraido: string | null = null;
        if (typeof responseData === 'object') {
          if (responseData.token) tokenExtraido = responseData.token;
          else if (responseData.access_token) tokenExtraido = responseData.access_token;
          else if (responseData.data?.token) tokenExtraido = responseData.data.token;
          else if (responseData.data?.access_token) tokenExtraido = responseData.data.access_token;
        } else if (typeof responseData === 'string') {
          if (responseData.includes('<input')) {
            const tokenMatch = responseData.match(/id="access_token"[^>]*value="([^"]+)"/);
            if (tokenMatch && tokenMatch[1]) tokenExtraido = tokenMatch[1];
          } else if (responseData.includes('eyJ')) {
            const lines = responseData.split('\n').filter(line => line.trim().includes('eyJ'));
            tokenExtraido = lines.length > 0 ? lines[0].trim() : responseData.trim();
          }
        }

        return {
          success: true,
          token: tokenExtraido,
          status: responseStatus,
        };
      } else {
        return {
          success: false,
          status: responseStatus || undefined,
          error: `HTTP ${responseStatus || 'Unknown'}`,
          token: null,
        };
      }
    } catch (error: any) {
      page.off('response', responseHandler);
      return {
        success: false,
        error: error.message,
        token: null,
      };
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      token: null,
    };
  }
}

/**
 * MÉTODO 4B: Renova token usando page.goto e interceptação de resposta (authId DINÂMICO do token)
 */
export async function renovarTokenMetodo4B_PageGoto_Dinamico(
  page: Page,
  tokenAplicacao: string
): Promise<{ success: boolean; token: string | null; status?: number; error?: string }> {
  try {
    const authId = extrairAuthDoToken(tokenAplicacao);
    if (!authId) {
      return {
        success: false,
        error: 'Não foi possível extrair authId do token',
        token: null,
      };
    }

    const renovacaoUrl = `${tokenRenovacaoUrlBase}/${authId}`;
    
    let responseData: any = null;
    let responseStatus: number | null = null;
    let responseError: string | null = null;

    // Interceptar resposta
    const responseHandler = async (response: any) => {
      if (response.url().includes('/token/renovacao/aplicacao/')) {
        responseStatus = response.status();
        try {
          const contentType = response.headers()['content-type'] || '';
          if (contentType.includes('application/json')) {
            responseData = await response.json();
          } else {
            responseData = await response.text();
          }
        } catch (error: any) {
          responseError = error.message;
        }
      }
    };

    page.on('response', responseHandler);

    // Navegar para a URL com headers customizados
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'pt',
      'Referer': 'https://vmlav.vmhub.vmtecnologia.io/',
      'Origin': 'https://vmlav.vmhub.vmtecnologia.io',
      'Authorization': `Bearer ${tokenAplicacao}`,
      'X-Vm-App': 'vmlav',
      'X-Vm-Emp': 'lavateriajdnovomundo',
      'Time-Zone': 'America/Sao_Paulo',
      'Priority': 'u=4',
      'Pragma': 'no-cache',
      'Cache-Control': 'no-cache',
    });

    try {
      const response = await page.goto(renovacaoUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      if (response) {
        responseStatus = response.status();
      }

      // Aguardar um pouco para garantir que a resposta foi interceptada
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Remover listener
      page.off('response', responseHandler);

      if (responseError) {
        return {
          success: false,
          error: responseError,
          token: null,
        };
      }

      if (responseStatus && responseStatus >= 200 && responseStatus < 300 && responseData) {
        let tokenExtraido: string | null = null;
        if (typeof responseData === 'object') {
          if (responseData.token) tokenExtraido = responseData.token;
          else if (responseData.access_token) tokenExtraido = responseData.access_token;
          else if (responseData.data?.token) tokenExtraido = responseData.data.token;
          else if (responseData.data?.access_token) tokenExtraido = responseData.data.access_token;
        } else if (typeof responseData === 'string') {
          if (responseData.includes('<input')) {
            const tokenMatch = responseData.match(/id="access_token"[^>]*value="([^"]+)"/);
            if (tokenMatch && tokenMatch[1]) tokenExtraido = tokenMatch[1];
          } else if (responseData.includes('eyJ')) {
            const lines = responseData.split('\n').filter(line => line.trim().includes('eyJ'));
            tokenExtraido = lines.length > 0 ? lines[0].trim() : responseData.trim();
          }
        }

        return {
          success: true,
          token: tokenExtraido,
          status: responseStatus,
        };
      } else {
        return {
          success: false,
          status: responseStatus || undefined,
          error: `HTTP ${responseStatus || 'Unknown'}`,
          token: null,
        };
      }
    } catch (error: any) {
      page.off('response', responseHandler);
      return {
        success: false,
        error: error.message,
        token: null,
      };
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      token: null,
    };
  }
}

/**
 * Faz GET usando page.goto e interceptação de resposta (para keep-alive)
 */
export async function fazerGetMetodo4_PageGoto(
  page: Page,
  tokenAplicacao: string
): Promise<{ success: boolean; data: any; status?: number; error?: string }> {
  try {
    let responseData: any = null;
    let responseStatus: number | null = null;
    let responseError: string | null = null;

    // Interceptar resposta
    const responseHandler = async (response: any) => {
      const responseUrl = response.url();
      if (responseUrl === tokenAplicacaoUrl || responseUrl.includes('/conta/api/v1/contas-usuarios/login/aplicacao')) {
        responseStatus = response.status();
        try {
          const contentType = response.headers()['content-type'] || '';
          if (contentType.includes('application/json')) {
            responseData = await response.json();
          } else {
            responseData = await response.text();
          }
        } catch (error: any) {
          responseError = error.message;
        }
      }
    };

    page.on('response', responseHandler);

    // Navegar para a URL com headers customizados
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'pt',
      'Referer': 'https://vmlav.vmhub.vmtecnologia.io/',
      'Origin': 'https://vmlav.vmhub.vmtecnologia.io',
      'Authorization': `Bearer ${tokenAplicacao}`,
      'X-Vm-App': 'vmlav',
      'X-Vm-Emp': 'lavateriajdnovomundo',
      'Time-Zone': 'America/Sao_Paulo',
      'Priority': 'u=4',
      'Pragma': 'no-cache',
      'Cache-Control': 'no-cache',
    });

    try {
      const response = await page.goto(tokenAplicacaoUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      if (response) {
        responseStatus = response.status();
      }

      // Aguardar um pouco para garantir que a resposta foi interceptada
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Remover listener
      page.off('response', responseHandler);

      if (responseError) {
        return {
          success: false,
          error: responseError,
          data: null,
        };
      }

      if (responseStatus && responseStatus >= 200 && responseStatus < 300 && responseData) {
        return {
          success: true,
          data: responseData,
          status: responseStatus,
        };
      } else {
        return {
          success: false,
          status: responseStatus || undefined,
          error: `HTTP ${responseStatus || 'Unknown'}`,
          data: null,
        };
      }
    } catch (error: any) {
      page.off('response', responseHandler);
      return {
        success: false,
        error: error.message,
        data: null,
      };
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
}

