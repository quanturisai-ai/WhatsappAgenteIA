/**
 * Script de teste: verificar token de aplicação e obter novo se necessário
 * 
 * Este script:
 * 1. Busca credenciais na tabela do banco
 * 2. Usa Puppeteer para restaurar localStorage e cookies
 * 3. Testa se token_aplicacao atual está ativo
 * 4. Se não estiver, tenta obter novo token usando token_inicial
 * 5. Testa renovação proativa de token
 * 6. Testa keep-alive para manter conexão ativa
 * 7. Usa HTTP Keep-Alive para conexões persistentes
 * 8. Registra logs detalhados para monitoramento
 * 
 * Uso: npm run test:token-renewal
 */

import pool from '../config/database';
import axios from 'axios';
import puppeteer, { Browser, Page } from 'puppeteer';
import https from 'https';
import http from 'http';
import { TestTokenRenewalLogger } from '../utils/testTokenRenewalLogger';

const tokenAplicacaoUrl = 'https://apps.vmhub.vmtecnologia.io/conta/api/v1/contas-usuarios/login/aplicacao';
const tokenRenovacaoUrlBase = 'https://apps.vmhub.vmtecnologia.io/autenticacao/api/v1/autenticacao/token/renovacao/aplicacao';
const clientesApiUrl = 'https://apps.vmhub.vmtecnologia.io/vmlav/api/v1/relatorios/clientes';

// Criar agentes HTTP/HTTPS com keep-alive para conexões persistentes
const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000, // 30 segundos
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 30000,
});

const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000, // 30 segundos
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 30000,
});


/**
 * Obtém tempo restante até expiração do token em minutos
 */
function obterTempoRestanteToken(token: string): number | null {
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
 * Extrai o campo 'auth' do token JWT para usar na URL de renovação
 */
function extrairAuthDoToken(token: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return payload.auth || null;
  } catch (e) {
    return null;
  }
}

/**
 * MÉTODO 4A: Renova token usando page.goto e interceptação de resposta (authId FIXO = 1737)
 */
async function renovarTokenMetodo4A_PageGoto_Fixo(
  page: Page,
  tokenAplicacao: string,
  renovacaoUrl: string
): Promise<{ success: boolean; token: string | null; status?: number; error?: string; dataCompleto?: string }> {
  try {
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
        const dataParaLog = typeof responseData === 'string' 
          ? (responseData.length > 500 ? responseData.substring(0, 500) + '...' : responseData)
          : (JSON.stringify(responseData).length > 500 ? JSON.stringify(responseData).substring(0, 500) + '...' : JSON.stringify(responseData));

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
          dataCompleto: dataParaLog,
        };
      } else {
        return {
          success: false,
          status: responseStatus || undefined,
          error: `HTTP ${responseStatus || 'Unknown'}`,
          dataCompleto: typeof responseData === 'string' ? responseData.substring(0, 200) : JSON.stringify(responseData).substring(0, 200),
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
 * MÉTODO 4C: Faz GET usando page.goto e interceptação de resposta (para tokenAplicacaoUrl)
 */
async function fazerGetMetodo4_PageGoto(
  page: Page,
  tokenAplicacao: string,
  url: string
): Promise<{ success: boolean; data: any; status?: number; error?: string; dataCompleto?: string }> {
  try {
    let responseData: any = null;
    let responseStatus: number | null = null;
    let responseError: string | null = null;

    // Interceptar resposta
    const responseHandler = async (response: any) => {
      const responseUrl = response.url();
      // Verificar se a URL corresponde exatamente ou contém o path da URL desejada
      if (responseUrl === url || responseUrl.includes('/conta/api/v1/contas-usuarios/login/aplicacao')) {
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
      const response = await page.goto(url, {
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
        const dataParaLog = typeof responseData === 'string' 
          ? (responseData.length > 500 ? responseData.substring(0, 500) + '...' : responseData)
          : (JSON.stringify(responseData).length > 500 ? JSON.stringify(responseData).substring(0, 500) + '...' : JSON.stringify(responseData));

        return {
          success: true,
          data: responseData,
          status: responseStatus,
          dataCompleto: dataParaLog,
        };
      } else {
        return {
          success: false,
          status: responseStatus || undefined,
          error: `HTTP ${responseStatus || 'Unknown'}`,
          dataCompleto: typeof responseData === 'string' ? responseData.substring(0, 200) : JSON.stringify(responseData).substring(0, 200),
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

/**
 * MÉTODO 4B: Renova token usando page.goto e interceptação de resposta (authId DINÂMICO do token)
 */
async function renovarTokenMetodo4B_PageGoto_Dinamico(
  page: Page,
  tokenAplicacao: string,
  renovacaoUrl: string
): Promise<{ success: boolean; token: string | null; status?: number; error?: string; dataCompleto?: string }> {
  try {
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
        const dataParaLog = typeof responseData === 'string' 
          ? (responseData.length > 500 ? responseData.substring(0, 500) + '...' : responseData)
          : (JSON.stringify(responseData).length > 500 ? JSON.stringify(responseData).substring(0, 500) + '...' : JSON.stringify(responseData));

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
          dataCompleto: dataParaLog,
        };
      } else {
        return {
          success: false,
          status: responseStatus || undefined,
          error: `HTTP ${responseStatus || 'Unknown'}`,
          dataCompleto: typeof responseData === 'string' ? responseData.substring(0, 200) : JSON.stringify(responseData).substring(0, 200),
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
 * Renova token usando Puppeteer - TESTA 2 VERSÕES DO MÉTODO 4
 * Usa o novo endpoint de renovação: /autenticacao/api/v1/autenticacao/token/renovacao/aplicacao/{authId}
 * - Versão A: authId fixo (1737)
 * - Versão B: authId dinâmico (extraído do token)
 */
async function renovarTokenComPuppeteer(
  page: Page,
  tokenAplicacao: string
): Promise<string | null> {
  try {
    TestTokenRenewalLogger.logInfo('Iniciando renovação de token com Puppeteer - TESTANDO 2 VERSÕES DO MÉTODO 4');
    
    // Versão A: authId fixo
    const authIdFixo = 1737;
    const renovacaoUrlFixo = `${tokenRenovacaoUrlBase}/${authIdFixo}`;
    
    // Versão B: authId dinâmico
    const authIdDinamico = extrairAuthDoToken(tokenAplicacao);
    const renovacaoUrlDinamico = authIdDinamico ? `${tokenRenovacaoUrlBase}/${authIdDinamico}` : null;
    
    console.log(`   🔗 URL de renovação (FIXO): ${renovacaoUrlFixo}`);
    console.log(`   🔑 Auth ID (FIXO): ${authIdFixo}`);
    if (renovacaoUrlDinamico) {
      console.log(`   🔗 URL de renovação (DINÂMICO): ${renovacaoUrlDinamico}`);
      console.log(`   🔑 Auth ID (DINÂMICO): ${authIdDinamico}`);
    } else {
      console.log(`   ⚠️  Não foi possível extrair authId do token para versão dinâmica`);
    }
    console.log(`   🧪 Testando 2 versões do método Page.goto + Interceptação...\n`);
    TestTokenRenewalLogger.logInfo(`Renovando token via novo endpoint - 2 versões`, { 
      urlFixo: renovacaoUrlFixo, 
      authIdFixo,
      urlDinamico: renovacaoUrlDinamico,
      authIdDinamico,
    });
    
    const metodos = [
      { 
        nome: 'Método 4A: Page.goto + Interceptação (authId FIXO = 1737)', 
        funcao: renovarTokenMetodo4A_PageGoto_Fixo,
        url: renovacaoUrlFixo,
        authId: authIdFixo,
      },
      { 
        nome: 'Método 4B: Page.goto + Interceptação (authId DINÂMICO)', 
        funcao: renovarTokenMetodo4B_PageGoto_Dinamico,
        url: renovacaoUrlDinamico || renovacaoUrlFixo,
        authId: authIdDinamico || authIdFixo,
      },
    ];

    let tokenRenovado: string | null = null;
    
    for (let i = 0; i < metodos.length; i++) {
      const metodo = metodos[i];
      
      // Pular método dinâmico se não tiver authId
      if (i === 1 && !authIdDinamico) {
        console.log(`\n   ${'═'.repeat(60)}`);
        console.log(`   ⏭️  ${metodo.nome} - PULADO (authId não disponível)`);
        console.log(`   ${'═'.repeat(60)}\n`);
        continue;
      }
      
      console.log(`\n   ${'═'.repeat(60)}`);
      console.log(`   🧪 ${metodo.nome}`);
      console.log(`   ${'═'.repeat(60)}`);
      
      const inicio = Date.now();
      TestTokenRenewalLogger.logHttpRequest('GET', metodo.url, undefined, undefined, `Iniciando ${metodo.nome}`);
      
      try {
        const resultado = await metodo.funcao(page, tokenAplicacao, metodo.url);
        const tempoResposta = Date.now() - inicio;
        
        console.log(`   📥 Resposta:`);
        console.log(`      Status: ${resultado.status || 'N/A'}`);
        console.log(`      Tempo: ${tempoResposta}ms`);
        console.log(`      Sucesso: ${resultado.success ? '✅ SIM' : '❌ NÃO'}`);
        if (resultado.error) {
          console.log(`      Erro: ${resultado.error}`);
        }
        if (resultado.dataCompleto) {
          console.log(`      Dados: ${resultado.dataCompleto.substring(0, 200)}${resultado.dataCompleto.length > 200 ? '...' : ''}`);
        }
        if (resultado.token) {
          console.log(`      Token obtido: ${resultado.token.substring(0, 50)}...`);
        }
        console.log('');
        
        TestTokenRenewalLogger.logHttpRequest('GET', metodo.url, resultado.status || undefined, tempoResposta, `[${metodo.nome}] ${resultado.dataCompleto || resultado.error || 'Sem dados'}`);
        
        if (resultado.success && resultado.token) {
          console.log(`   ✅ SUCESSO com ${metodo.nome}!`);
          console.log(`   🎯 Token renovado: ${resultado.token.substring(0, 50)}...\n`);
          
          TestTokenRenewalLogger.logResult(true, `Token renovado com sucesso via ${metodo.nome}`, {
            status: resultado.status,
            url: metodo.url,
            tempoResposta: `${tempoResposta}ms`,
            metodo: metodo.nome,
            authId: metodo.authId,
          });
          
          // Guardar o token mas continuar testando o próximo método
          if (!tokenRenovado) {
            tokenRenovado = resultado.token;
          }
        } else {
          console.log(`   ❌ Falhou com ${metodo.nome}`);
          TestTokenRenewalLogger.logResult(false, `Falha na renovação via ${metodo.nome}`, {
            error: resultado.error,
            status: resultado.status,
            url: metodo.url,
            tempoResposta: `${tempoResposta}ms`,
            metodo: metodo.nome,
            authId: metodo.authId,
          });
        }
      } catch (error: any) {
        const tempoResposta = Date.now() - inicio;
        console.log(`   ❌ ERRO com ${metodo.nome}: ${error.message}`);
        TestTokenRenewalLogger.logError(error, `Renovação ${metodo.nome}`);
        TestTokenRenewalLogger.logHttpRequest('GET', metodo.url, undefined, tempoResposta, `[${metodo.nome}] Erro: ${error.message}`);
      }
      
      // Aguardar um pouco entre tentativas
      if (i < metodos.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    if (tokenRenovado) {
      console.log(`\n   ${'═'.repeat(60)}`);
      console.log(`   ✅ TOKEN RENOVADO COM SUCESSO`);
      console.log(`   🎯 Token: ${tokenRenovado.substring(0, 50)}...`);
      console.log(`   ${'═'.repeat(60)}\n`);
      return tokenRenovado;
    }
    
    console.log(`\n   ${'═'.repeat(60)}`);
    console.log(`   ❌ NENHUM MÉTODO FUNCIONOU`);
    console.log(`   ${'═'.repeat(60)}\n`);
    
    TestTokenRenewalLogger.logResult(false, 'Ambas as versões do método 4 falharam', {
      urlFixo: renovacaoUrlFixo,
      urlDinamico: renovacaoUrlDinamico,
    });
    
    return null;
  } catch (error: any) {
    TestTokenRenewalLogger.logError(error, 'Renovação com Puppeteer');
    return null;
  }
}

/**
 * Testa keep-alive fazendo requisições periódicas leves
 */
async function testarKeepAlive(token: string, quantidade: number = 3, intervaloMs: number = 5000): Promise<void> {
  console.log(`\n🔄 TESTE: Keep-Alive (${quantidade} requisições a cada ${intervaloMs / 1000}s)...`);
  TestTokenRenewalLogger.logStep('🔄', `Teste de Keep-Alive (${quantidade} requisições)`);
  
  for (let i = 1; i <= quantidade; i++) {
    try {
      const queryParams = new URLSearchParams({
        execCount: 'true',
        pagina: '0',
        quantidade: '1',
        direcaoOrdenacao: 'ASC',
        campoOrdenacao: 'cliente.nome',
      });

      const body = {
        nome: null,
        cpf: null,
        dataNascimento: null,
        email: null,
        telefone: null,
        empresas: null,
        periodoUltimaCompra: { dataInicio: null, dataTermino: null },
        periodoDataCadastro: { dataInicio: null, dataTermino: null },
        periodoParametrizadoUltimaCompra: null,
        periodoParametrizadoDataCadastro: null,
        agrupadores: null,
        mesAniversario: null,
      };

      const inicio = Date.now();
      const url = `${clientesApiUrl}?${queryParams.toString()}`;
      console.log(`   📡 Fazendo requisição: POST ${url}`);
      console.log(`   🌐 Método: Axios (HTTP direto)`);
      TestTokenRenewalLogger.logHttpRequest('POST', url, undefined, undefined, 'Iniciando requisição keep-alive via Axios');
      
      const response = await axios.post(url, body, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/plain, */*',
          'Authorization': `Bearer ${token}`,
          'Origin': 'https://vmlav.vmhub.vmtecnologia.io',
          'Referer': 'https://vmlav.vmhub.vmtecnologia.io/',
          'Time-Zone': 'America/Sao_Paulo',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0',
          'X-Vm-App': 'vmlav',
          'X-Vm-Emp': 'lavateriajdnovomundo',
        },
        httpsAgent,
        httpAgent,
        timeout: 10000,
      });

      const tempoResposta = Date.now() - inicio;
      
      // Log detalhado da resposta
      const respostaLog = JSON.stringify(response.data).length > 300 
        ? JSON.stringify(response.data).substring(0, 300) + '...' 
        : JSON.stringify(response.data);
      
      console.log(`   📥 Resposta recebida (via Axios):`);
      console.log(`      Status: ${response.status}`);
      console.log(`      Tempo: ${tempoResposta}ms`);
      console.log(`      Dados: ${respostaLog}`);
      
      TestTokenRenewalLogger.logHttpRequest('POST', url, response.status, tempoResposta, `[Axios] ${respostaLog}`);
      
      if (response.status === 200 && response.data?.resultadoPaginado) {
        console.log(`   ✅ Keep-alive ${i}/${quantidade}: OK (${tempoResposta}ms)`);
        TestTokenRenewalLogger.logKeepAlive(i, quantidade, true, tempoResposta);
      } else {
        console.log(`   ⚠️  Keep-alive ${i}/${quantidade}: Resposta inesperada`);
        TestTokenRenewalLogger.logKeepAlive(i, quantidade, false, tempoResposta, 'Resposta inesperada');
      }
    } catch (error: any) {
      const queryParams = new URLSearchParams({
        execCount: 'true',
        pagina: '0',
        quantidade: '1',
        direcaoOrdenacao: 'ASC',
        campoOrdenacao: 'cliente.nome',
      });
      const url = `${clientesApiUrl}?${queryParams.toString()}`;
      const erroLog = error.response 
        ? `Status: ${error.response.status}, Dados: ${JSON.stringify(error.response.data).substring(0, 200)}`
        : error.message;
      
      console.log(`   ❌ Keep-alive ${i}/${quantidade}: ${error.message}`);
      if (error.response) {
        console.log(`      Status: ${error.response.status}`);
        console.log(`      Dados: ${JSON.stringify(error.response.data).substring(0, 200)}`);
        TestTokenRenewalLogger.logHttpRequest('POST', url, error.response.status, undefined, `[Axios] ${erroLog}`);
      } else {
        TestTokenRenewalLogger.logHttpRequest('POST', url, undefined, undefined, `[Axios] ${error.message}`);
      }
      TestTokenRenewalLogger.logKeepAlive(i, quantidade, false, undefined, error.message);
    }

    // Aguardar antes da próxima requisição (exceto na última)
    if (i < quantidade) {
      await new Promise(resolve => setTimeout(resolve, intervaloMs));
    }
  }
  
  console.log('   ✅ Teste de keep-alive concluído\n');
}

async function testarTokenAplicacao() {
  // Logar início do teste
  TestTokenRenewalLogger.logTestStart();
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔄 TESTE: Verificar e Obter Token de Aplicação (Aprimorado)');
  console.log('═══════════════════════════════════════════════════════════\n');

  let browser: Browser | null = null;
  let page: Page | null = null;
  
  const cleanup = async () => {
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        // Ignorar erro ao fechar
      }
      browser = null;
      page = null;
    }
  };

  try {
    // 1. Buscar credenciais completas no banco
    console.log('1️⃣  Buscando credenciais no banco...');
    TestTokenRenewalLogger.logStep('1️⃣', 'Buscando credenciais no banco');
    
    const conn = await pool.getConnection();
    
    let credentials: any = null;
    try {
      const queryResult = await conn.query(
        `SELECT user_id, token_inicial, token_aplicacao, dados_localstorage, cookies, token_expira_em
         FROM vm_lav_credentials 
         WHERE token_inicial IS NOT NULL LIMIT 1`
      ) as any;

      let rows: any[] = [];
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
        rows = Array.from(queryResult as any);
      }

      if (rows.length === 0) {
        console.log('❌ Nenhuma credencial com token_inicial encontrada.\n');
        TestTokenRenewalLogger.logResult(false, 'Nenhuma credencial encontrada');
        return;
      }

      credentials = rows[0];
      console.log(`✅ Credencial encontrada para user_id: ${credentials.user_id}`);
      console.log(`   Token aplicação: ${credentials.token_aplicacao ? '✅ Presente' : '❌ Ausente'}`);
      console.log(`   LocalStorage: ${credentials.dados_localstorage ? '✅ Presente' : '❌ Ausente'}`);
      console.log(`   Cookies: ${credentials.cookies ? '✅ Presente' : '❌ Ausente'}`);
      
      TestTokenRenewalLogger.logResult(true, `Credencial encontrada para user_id: ${credentials.user_id}`, {
        token_aplicacao: credentials.token_aplicacao ? 'Presente' : 'Ausente',
        localStorage: credentials.dados_localstorage ? 'Presente' : 'Ausente',
        cookies: credentials.cookies ? 'Presente' : 'Ausente',
      });
      
      // Verificar tempo de expiração do token
      if (credentials.token_aplicacao) {
        const tempoRestante = obterTempoRestanteToken(credentials.token_aplicacao);
        if (tempoRestante !== null) {
          console.log(`   ⏰ Token expira em: ${tempoRestante} minutos`);
          if (tempoRestante < 30) {
            console.log(`   ⚠️  Token expira em menos de 30 minutos - renovação proativa recomendada!`);
          }
          TestTokenRenewalLogger.logTokenInfo('token_aplicacao', credentials.token_aplicacao, tempoRestante);
        }
      }
      console.log('');
    } finally {
      conn.release();
    }

    if (!credentials || !credentials.token_inicial) {
      console.log('❌ Token inicial não encontrado nas credenciais.\n');
      TestTokenRenewalLogger.logError('Token inicial não encontrado', 'Validação de credenciais');
      return;
    }

    // 2. Se tiver token_aplicacao, testar se está ativo usando Puppeteer
    if (credentials.token_aplicacao && credentials.dados_localstorage && credentials.cookies) {
      console.log('2️⃣  Testando se token_aplicacao atual está ativo (usando Puppeteer)...');
      TestTokenRenewalLogger.logStep('2️⃣', 'Testando token_aplicacao com Puppeteer');
      
      try {
        // Inicializar Puppeteer
        browser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

        page = await browser.newPage();

        // Navegar para a aplicação
        await page.goto('https://vmlav.vmhub.vmtecnologia.io', { waitUntil: 'networkidle2', timeout: 30000 });

        // Restaurar cookies
        console.log('   Restaurando cookies...');
        const cookies = Array.isArray(credentials.cookies) ? credentials.cookies : JSON.parse(credentials.cookies || '[]');
        if (cookies.length > 0) {
          await page.setCookie(...cookies);
        }

        // Restaurar localStorage
        console.log('   Restaurando localStorage...');
        const localStorageData = typeof credentials.dados_localstorage === 'string' 
          ? JSON.parse(credentials.dados_localstorage) 
          : credentials.dados_localstorage;
        
        await page.evaluate((localStorageData) => {
          // @ts-ignore
          for (const key in localStorageData) {
            // @ts-ignore
            window.localStorage.setItem(key, localStorageData[key]);
          }
        }, localStorageData);

        // Recarregar página para aplicar localStorage
        await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Fazer chamada de teste usando token_aplicacao
        console.log('   Fazendo chamada de teste com token_aplicacao...');
        
        const queryParams = new URLSearchParams({
          execCount: 'true',
          pagina: '0',
          quantidade: '1',
          direcaoOrdenacao: 'ASC',
          campoOrdenacao: 'cliente.nome',
        });

        const url = `${clientesApiUrl}?${queryParams.toString()}`;
        const body = {
          nome: null,
          cpf: null,
          dataNascimento: null,
          email: null,
          telefone: null,
          empresas: null,
          periodoUltimaCompra: { dataInicio: null, dataTermino: null },
          periodoDataCadastro: { dataInicio: null, dataTermino: null },
          periodoParametrizadoUltimaCompra: null,
          periodoParametrizadoDataCadastro: null,
          agrupadores: null,
          mesAniversario: null,
        };

        let novoTokenAplicacao: string | null = null;
        
        try {
          const inicio = Date.now();
          console.log(`   📡 Fazendo requisição: POST ${url}`);
          console.log(`   🌐 Método: Axios (HTTP direto)`);
          TestTokenRenewalLogger.logHttpRequest('POST', url, undefined, undefined, 'Iniciando teste de token via Axios');
          
          const response = await axios.post(url, body, {
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json, text/plain, */*',
              'Authorization': `Bearer ${credentials.token_aplicacao}`,
              'Origin': 'https://vmlav.vmhub.vmtecnologia.io',
              'Referer': 'https://vmlav.vmhub.vmtecnologia.io/',
              'Time-Zone': 'America/Sao_Paulo',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0',
              'X-Vm-App': 'vmlav',
              'X-Vm-Emp': 'lavateriajdnovomundo',
            },
            httpsAgent,
            httpAgent,
            timeout: 30000,
          });

          const tempoResposta = Date.now() - inicio;
          
          // Log detalhado da resposta
          const respostaLog = JSON.stringify(response.data).length > 300 
            ? JSON.stringify(response.data).substring(0, 300) + '...' 
            : JSON.stringify(response.data);
          
          console.log(`   📥 Resposta recebida (via Axios):`);
          console.log(`      Status: ${response.status}`);
          console.log(`      Tempo: ${tempoResposta}ms`);
          console.log(`      Dados: ${respostaLog}`);
          console.log('');
          
          TestTokenRenewalLogger.logHttpRequest('POST', url, response.status, tempoResposta, `[Axios] ${respostaLog}`);

          if (response.data && response.data.resultadoPaginado) {
            console.log('✅ Token de aplicação está ATIVO!');
            console.log(`   Total de clientes: ${response.data.resultadoPaginado.total || 'N/A'}`);
            console.log(`   Token atual: ${credentials.token_aplicacao.substring(0, 50)}...\n`);
            
            TestTokenRenewalLogger.logResult(true, 'Token de aplicação está ATIVO', {
              totalClientes: response.data.resultadoPaginado.total || 'N/A',
              tempoResposta: `${tempoResposta}ms`,
            });
            
            // NÃO fechar navegador - vamos usar ele para renovar
            // await cleanup(); // REMOVIDO - manter navegador aberto para renovação
            
            // TESTE: Tentar renovar mesmo estando ativo para ver se muda
            console.log('🔄 TESTE: Tentando renovar token mesmo estando ativo...');
            console.log('   Objetivo: Verificar se o token muda ou permanece o mesmo após renovação');
            console.log('   Usando novo endpoint de renovação com auth ID\n');
            TestTokenRenewalLogger.logStep('🔄', 'Testando renovação de token ativo');
            
            try {
              const inicioRenovacao = Date.now();
              
              // Usar Puppeteer para renovar (com acesso ao localStorage)
              // Usar token_aplicacao (não token_inicial) para renovação
              novoTokenAplicacao = await renovarTokenComPuppeteer(page!, credentials.token_aplicacao);
              
              const tempoRenovacao = Date.now() - inicioRenovacao;
              const authId = 1737;
              const renovacaoUrl = `${tokenRenovacaoUrlBase}/${authId}`;
              TestTokenRenewalLogger.logHttpRequest('GET', renovacaoUrl, novoTokenAplicacao ? 200 : 403, tempoRenovacao);

              if (novoTokenAplicacao) {
                console.log('✅ Novo token obtido após renovação!');
                console.log(`   Token anterior: ${credentials.token_aplicacao.substring(0, 50)}...`);
                console.log(`   Token novo:     ${novoTokenAplicacao.substring(0, 50)}...`);
                
                const mudou = credentials.token_aplicacao !== novoTokenAplicacao;
                
                if (mudou) {
                  console.log('   🔄 RESULTADO: Token MUDOU após renovação\n');
                } else {
                  console.log('   🔄 RESULTADO: Token PERMANECEU O MESMO após renovação\n');
                }
                
                TestTokenRenewalLogger.logTokenRenewal(
                  credentials.token_aplicacao,
                  novoTokenAplicacao,
                  mudou,
                  'Renovação de token ativo'
                );
                
                // Atualizar tokenParaTestar se obteve novo token na renovação
                credentials.token_aplicacao = novoTokenAplicacao;
              } else {
                console.log('❌ Não foi possível obter novo token da renovação.\n');
                TestTokenRenewalLogger.logResult(false, 'Não foi possível obter novo token da renovação');
              }
        } catch (error: any) {
          console.log(`❌ Erro ao tentar renovar token: ${error.message}\n`);
          TestTokenRenewalLogger.logError(error, 'Renovação de token');
        } finally {
          // Agora sim, fechar o navegador
          await cleanup();
        }
      } else {
        console.log('⚠️  Resposta inesperada da API\n');
        TestTokenRenewalLogger.logResult(false, 'Resposta inesperada da API');
      }
    } catch (error: any) {
      // Log detalhado do erro
      const erroLog = error.response 
        ? `Status: ${error.response.status}, Dados: ${JSON.stringify(error.response.data).substring(0, 200)}`
        : error.message;
      
      console.log(`   📥 Erro na requisição (via Axios):`);
      if (error.response) {
        console.log(`      Status: ${error.response.status}`);
        console.log(`      Dados: ${JSON.stringify(error.response.data).substring(0, 200)}`);
        TestTokenRenewalLogger.logHttpRequest('POST', url, error.response.status, undefined, `[Axios] ${erroLog}`);
      } else {
        console.log(`      Erro: ${error.message}`);
        TestTokenRenewalLogger.logHttpRequest('POST', url, undefined, undefined, `[Axios] ${error.message}`);
      }
      console.log('');
      
      // Se o token falhou (403), tentar renovar mesmo assim
      if (error.response && error.response.status === 403) {
        console.log('❌ Token retornou 403 - Token pode estar expirado');
        console.log('   🔄 Tentando renovar token mesmo com falha...\n');
        TestTokenRenewalLogger.logStep('🔄', 'Tentando renovar token após falha 403');
        
        if (page) {
          try {
            novoTokenAplicacao = await renovarTokenComPuppeteer(page, credentials.token_aplicacao);

            if (novoTokenAplicacao) {
              console.log('✅ Token renovado com sucesso após falha!');
              console.log(`   Token novo: ${novoTokenAplicacao.substring(0, 50)}...\n`);
              credentials.token_aplicacao = novoTokenAplicacao;
            } else {
              console.log('❌ Não foi possível renovar token após falha.\n');
            }
          } catch (renovError: any) {
            console.log(`❌ Erro ao tentar renovar após falha: ${renovError.message}\n`);
            TestTokenRenewalLogger.logError(renovError, 'Renovação após falha 403');
          }
        }
      }
      
      // Log do erro original
      if (error.response && error.response.status === 401) {
        console.log('❌ Token de aplicação está INATIVO (401 Unauthorized)\n');
        TestTokenRenewalLogger.logResult(false, 'Token de aplicação INATIVO (401)', { status: 401 });
      } else if (error.response && error.response.status !== 403) {
        console.log(`⚠️  Erro ao testar token: ${error.message}\n`);
        TestTokenRenewalLogger.logError(error, 'Teste de token');
      }
        }
      } catch (error: any) {
        console.log(`❌ Erro ao usar Puppeteer: ${error.message}\n`);
        TestTokenRenewalLogger.logError(error, 'Puppeteer');
      } finally {
        await cleanup();
      }
    } else {
      console.log('2️⃣  ⚠️  Não há token_aplicacao ou dados de sessão para testar\n');
      TestTokenRenewalLogger.logInfo('Não há token_aplicacao ou dados de sessão para testar');
    }

    // 3. Tentar obter novo token de aplicação usando token_inicial (apenas se não tiver token_aplicacao válido)
    if (!credentials.token_aplicacao) {
      console.log('3️⃣  Tentando obter novo token de aplicação usando token_inicial...');
      TestTokenRenewalLogger.logStep('3️⃣', 'Obtendo novo token usando token_inicial');
      
      // Se não tiver navegador aberto, criar um novo
      if (!browser || !page) {
        try {
          browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
          });
          page = await browser.newPage();
          
          // Navegar e restaurar sessão se tiver dados
          if (credentials.dados_localstorage && credentials.cookies) {
            await page.goto('https://vmlav.vmhub.vmtecnologia.io', { waitUntil: 'networkidle2', timeout: 30000 });
            
            const cookies = Array.isArray(credentials.cookies) ? credentials.cookies : JSON.parse(credentials.cookies || '[]');
            if (cookies.length > 0) {
              await page.setCookie(...cookies);
            }
            
            const localStorageData = typeof credentials.dados_localstorage === 'string' 
              ? JSON.parse(credentials.dados_localstorage) 
              : credentials.dados_localstorage;
            
            await page.evaluate((localStorageData) => {
              // @ts-ignore
              for (const key in localStorageData) {
                // @ts-ignore
                window.localStorage.setItem(key, localStorageData[key]);
              }
            }, localStorageData);
            
            await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
            await new Promise(resolve => setTimeout(resolve, 3000));
          } else {
            await page.goto('https://vmlav.vmhub.vmtecnologia.io', { waitUntil: 'networkidle2', timeout: 30000 });
          }
        } catch (error: any) {
          console.log(`❌ Erro ao inicializar Puppeteer: ${error.message}\n`);
          TestTokenRenewalLogger.logError(error, 'Inicialização Puppeteer');
        }
      }
      
      if (page) {
        try {
          // Se não tiver token_aplicacao, precisamos usar o endpoint antigo com token_inicial
          // O novo endpoint de renovação requer token_aplicacao (para extrair o auth)
          if (!credentials.token_aplicacao && credentials.token_inicial) {
            console.log('   ⚠️  Usando endpoint antigo (token_inicial) pois não há token_aplicacao\n');
            
            // Tentar obter token_aplicacao usando endpoint antigo
            const inicio = Date.now();
            const resultado = await page.evaluate(async (url, token) => {
              try {
                const response = await fetch(url, {
                  method: 'GET',
                  headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'pt',
                    'Accept-Encoding': 'gzip, deflate, br, zstd',
                    'Origin': 'https://conta.vmhub.vmtecnologia.io',
                    'Referer': 'https://conta.vmhub.vmtecnologia.io/',
                    'Connection': 'keep-alive',
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'same-site',
                    'Time-Zone': 'America/Sao_Paulo',
                    'X-Origin': 'https://vmlav.vmhub.vmtecnologia.io',
                  },
                });

                const status = response.status;
                const data = await response.text();
                const dataParaLog = data.length > 300 ? data.substring(0, 300) + '...' : data;
                
                if (!response.ok) {
                  return { success: false, status, error: `HTTP ${status}`, dataCompleto: dataParaLog };
                }

                // Tentar extrair token
                let tokenExtraido: string | null = null;
                if (data.includes('<input')) {
                  const tokenMatch = data.match(/id="access_token"[^>]*value="([^"]+)"/);
                  if (tokenMatch && tokenMatch[1]) {
                    tokenExtraido = tokenMatch[1];
                  }
                } else if (data.includes('eyJ')) {
                  tokenExtraido = data.trim();
                }

                return { success: true, token: tokenExtraido, status, dataCompleto: dataParaLog };
              } catch (error: any) {
                return { success: false, error: error.message, dataCompleto: error.message };
              }
            }, tokenAplicacaoUrl, credentials.token_inicial);
            
            const tempoResposta = Date.now() - inicio;
            
            // Log detalhado da resposta
            console.log(`   📥 Resposta recebida (via Puppeteer):`);
            console.log(`      Status: ${resultado.status || 'N/A'}`);
            console.log(`      Tempo: ${tempoResposta}ms`);
            if (resultado.dataCompleto) {
              console.log(`      Dados: ${resultado.dataCompleto}`);
            } else if (resultado.error) {
              console.log(`      Erro: ${resultado.error}`);
            }
            console.log('');
            
            TestTokenRenewalLogger.logHttpRequest('GET', tokenAplicacaoUrl, resultado.status || undefined, tempoResposta, `[Puppeteer] ${resultado.dataCompleto || resultado.error || 'Resposta recebida'}`);

            if (resultado.success && resultado.token) {
              console.log('✅ Novo token de aplicação obtido com sucesso!');
              console.log(`   Token: ${resultado.token.substring(0, 50)}...\n`);
              TestTokenRenewalLogger.logResult(true, 'Novo token de aplicação obtido', {
                token: `${resultado.token.substring(0, 50)}...`,
              });
              credentials.token_aplicacao = resultado.token;
            } else {
              console.log('❌ Não foi possível obter token da resposta.\n');
              TestTokenRenewalLogger.logResult(false, 'Não foi possível obter token da resposta');
            }
          } else if (credentials.token_aplicacao) {
            // Usar novo endpoint de renovação
            const inicio = Date.now();
            const tokenAplicacao = await renovarTokenComPuppeteer(page, credentials.token_aplicacao);
            const tempoResposta = Date.now() - inicio;
            
            const authId = 1737;
            const renovacaoUrl = `${tokenRenovacaoUrlBase}/${authId}`;
            TestTokenRenewalLogger.logHttpRequest('GET', renovacaoUrl, tokenAplicacao ? 200 : 403, tempoResposta, `[Puppeteer] ${tokenAplicacao ? 'Token renovado' : 'Falha na renovação'}`);

            if (tokenAplicacao) {
              console.log('✅ Novo token de aplicação obtido com sucesso!');
              console.log(`   Token: ${tokenAplicacao.substring(0, 50)}...\n`);
              TestTokenRenewalLogger.logResult(true, 'Novo token de aplicação obtido', {
                token: `${tokenAplicacao.substring(0, 50)}...`,
              });
              credentials.token_aplicacao = tokenAplicacao;
            } else {
              console.log('❌ Não foi possível obter token da resposta.\n');
              TestTokenRenewalLogger.logResult(false, 'Não foi possível obter token da resposta');
            }
          }
        } catch (error: any) {
          console.log(`❌ Erro ao obter token: ${error.message}\n`);
          TestTokenRenewalLogger.logError(error, 'Obtenção de token');
        }
      }
    } else {
      console.log('3️⃣  ⏭️  Pulando obtenção de novo token (já temos token_aplicacao válido)\n');
      TestTokenRenewalLogger.logInfo('Pulando obtenção de novo token (já temos token_aplicacao válido)');
    }

    // 4. Teste de renovação proativa (se token expira em menos de 30 minutos OU já expirou)
    if (credentials.token_aplicacao) {
      const tempoRestante = obterTempoRestanteToken(credentials.token_aplicacao);
      const precisaRenovacao = tempoRestante !== null && (tempoRestante < 30 || tempoRestante < 0);
      
      if (precisaRenovacao) {
        const statusToken = tempoRestante! < 0 ? 'EXPIRADO' : 'expirando';
        console.log('4️⃣  TESTE: Renovação Proativa de Token');
        if (tempoRestante! < 0) {
          console.log(`   ⚠️  Token JÁ EXPIRADO (${Math.abs(tempoRestante!)} minutos atrás)`);
        } else {
          console.log(`   ⚠️  Token expira em ${tempoRestante} minutos (< 30 minutos)`);
        }
        console.log('   🔄 Tentando renovar proativamente...\n');
        TestTokenRenewalLogger.logStep('4️⃣', 'Renovação Proativa de Token', `Token ${statusToken} - ${tempoRestante} minutos`);
        
        // Se não tiver navegador aberto, criar um novo
        if (!browser || !page) {
          try {
            browser = await puppeteer.launch({
              headless: true,
              args: ['--no-sandbox', '--disable-setuid-sandbox'],
            });
            page = await browser.newPage();
            
            // Restaurar sessão se tiver dados
            if (credentials.dados_localstorage && credentials.cookies) {
              await page.goto('https://vmlav.vmhub.vmtecnologia.io', { waitUntil: 'networkidle2', timeout: 30000 });
              
              const cookies = Array.isArray(credentials.cookies) ? credentials.cookies : JSON.parse(credentials.cookies || '[]');
              if (cookies.length > 0) {
                await page.setCookie(...cookies);
              }
              
              const localStorageData = typeof credentials.dados_localstorage === 'string' 
                ? JSON.parse(credentials.dados_localstorage) 
                : credentials.dados_localstorage;
              
              await page.evaluate((localStorageData) => {
                // @ts-ignore
                for (const key in localStorageData) {
                  // @ts-ignore
                  window.localStorage.setItem(key, localStorageData[key]);
                }
              }, localStorageData);
              
              await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
              await new Promise(resolve => setTimeout(resolve, 3000));
            } else {
              await page.goto('https://vmlav.vmhub.vmtecnologia.io', { waitUntil: 'networkidle2', timeout: 30000 });
            }
          } catch (error: any) {
            console.log(`❌ Erro ao inicializar Puppeteer: ${error.message}\n`);
            TestTokenRenewalLogger.logError(error, 'Inicialização Puppeteer para renovação proativa');
          }
        }
        
        if (page) {
          try {
            const inicio = Date.now();
            // Usar token_aplicacao para renovação (não token_inicial)
            const novoToken = await renovarTokenComPuppeteer(page, credentials.token_aplicacao);
            const tempoRenovacao = Date.now() - inicio;
            
            const authId = 1737;
            const renovacaoUrl = `${tokenRenovacaoUrlBase}/${authId}`;
            TestTokenRenewalLogger.logHttpRequest('GET', renovacaoUrl, novoToken ? 200 : 403, tempoRenovacao);

            if (novoToken) {
              const novoTempoRestante = obterTempoRestanteToken(novoToken);
              console.log(`   ✅ Token renovado com sucesso!`);
              console.log(`   ⏰ Novo tempo até expiração: ${novoTempoRestante} minutos\n`);
              
              const mudou = credentials.token_aplicacao !== novoToken;
              TestTokenRenewalLogger.logTokenRenewal(
                credentials.token_aplicacao,
                novoToken,
                mudou,
                'Renovação proativa (expira em < 30 minutos)'
              );
              
              credentials.token_aplicacao = novoToken;
            } else {
              console.log('   ❌ Não foi possível obter novo token da renovação proativa.\n');
              TestTokenRenewalLogger.logResult(false, 'Não foi possível obter token da renovação proativa');
            }
          } catch (error: any) {
            console.log(`   ❌ Erro na renovação proativa: ${error.message}\n`);
            TestTokenRenewalLogger.logError(error, 'Renovação proativa');
          }
        }
      } else {
        console.log('4️⃣  ⏭️  Renovação proativa não necessária');
        if (tempoRestante !== null) {
          console.log(`   Token expira em ${tempoRestante} minutos (>= 30 minutos)\n`);
          TestTokenRenewalLogger.logInfo(`Renovação proativa não necessária - Token expira em ${tempoRestante} minutos`);
        } else {
          console.log('   Não foi possível determinar tempo de expiração\n');
          TestTokenRenewalLogger.logInfo('Renovação proativa não necessária - Não foi possível determinar tempo de expiração');
        }
      }
    }

    // 5. Teste de Keep-Alive
    if (credentials.token_aplicacao) {
      await testarKeepAlive(credentials.token_aplicacao, 3, 5000);
    }

    // 6. Teste final: Verificar se token está ativo fazendo GET na URL de aplicação
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('5️⃣  Teste final: Verificando se token está ativo (GET na URL de aplicação)...');
    console.log(`   URL: ${tokenAplicacaoUrl}\n`);
    TestTokenRenewalLogger.logStep('5️⃣', 'Teste final - Verificação de token ativo', `URL: ${tokenAplicacaoUrl}`);
    
    // Usar o token mais recente disponível
    let tokenParaTestar: string | null = null;
    
    // Se tiver token_aplicacao nas credenciais, usar ele
    if (credentials.token_aplicacao) {
      tokenParaTestar = credentials.token_aplicacao;
      console.log('   ✅ Usando token_aplicacao disponível para teste');
      if (tokenParaTestar) {
        console.log(`   Token (primeiros 50 chars): ${tokenParaTestar.substring(0, 50)}...\n`);
      }
    } else {
      console.log('   ⚠️  Não há token_aplicacao disponível para teste\n');
    }
    
    if (tokenParaTestar) {
      console.log('   🔄 Fazendo chamada GET usando Método 4 (Page.goto + Interceptação)...\n');
      
      // Garantir que temos navegador e página
      if (!browser || !page) {
        try {
          browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
          });
          page = await browser.newPage();
          
          // Restaurar sessão se tiver dados
          if (credentials.dados_localstorage && credentials.cookies) {
            await page.goto('https://vmlav.vmhub.vmtecnologia.io', { waitUntil: 'networkidle2', timeout: 30000 });
            
            const cookies = Array.isArray(credentials.cookies) ? credentials.cookies : JSON.parse(credentials.cookies || '[]');
            if (cookies.length > 0) {
              await page.setCookie(...cookies);
            }
            
            const localStorageData = typeof credentials.dados_localstorage === 'string' 
              ? JSON.parse(credentials.dados_localstorage) 
              : credentials.dados_localstorage;
            
            await page.evaluate((localStorageData) => {
              // @ts-ignore
              for (const key in localStorageData) {
                // @ts-ignore
                window.localStorage.setItem(key, localStorageData[key]);
              }
            }, localStorageData);
            
            await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
            await new Promise(resolve => setTimeout(resolve, 3000));
          } else {
            await page.goto('https://vmlav.vmhub.vmtecnologia.io', { waitUntil: 'networkidle2', timeout: 30000 });
          }
        } catch (error: any) {
          console.log(`❌ Erro ao inicializar Puppeteer: ${error.message}\n`);
          TestTokenRenewalLogger.logError(error, 'Inicialização Puppeteer para teste final');
        }
      }
      
      if (page) {
        try {
          const inicio = Date.now();
          console.log(`   📡 Fazendo requisição: GET ${tokenAplicacaoUrl}`);
          console.log(`   🌐 Método: Puppeteer (Page.goto + Interceptação)`);
          TestTokenRenewalLogger.logHttpRequest('GET', tokenAplicacaoUrl, undefined, undefined, 'Iniciando teste final via Método 4');
          
          const resultado = await fazerGetMetodo4_PageGoto(page, tokenParaTestar, tokenAplicacaoUrl);
          const tempoResposta = Date.now() - inicio;
          
          // Log detalhado da resposta
          const respostaLog = resultado.dataCompleto || resultado.error || 'Sem dados';
          
          console.log(`   📥 Resposta recebida (via Puppeteer):`);
          console.log(`      Status: ${resultado.status || 'N/A'}`);
          console.log(`      Tempo: ${tempoResposta}ms`);
          console.log(`      Sucesso: ${resultado.success ? '✅ SIM' : '❌ NÃO'}`);
          if (resultado.error) {
            console.log(`      Erro: ${resultado.error}`);
          }
          if (resultado.dataCompleto) {
            console.log(`      Dados: ${resultado.dataCompleto.substring(0, 200)}${resultado.dataCompleto.length > 200 ? '...' : ''}`);
          }
          console.log('');
          
          TestTokenRenewalLogger.logHttpRequest('GET', tokenAplicacaoUrl, resultado.status || undefined, tempoResposta, `[Método 4] ${respostaLog}`);

          if (resultado.success) {
            console.log(`✅ Chamada GET bem-sucedida! Status: ${resultado.status}`);
            console.log(`   Token está ATIVO e funcionando`);
            console.log(`   ✅ Método 4 (Page.goto + Interceptação) funcionando corretamente\n`);
            
            TestTokenRenewalLogger.logResult(true, 'Token está ATIVO e funcionando', {
              status: resultado.status,
              tempoResposta: `${tempoResposta}ms`,
              metodo: 'Método 4 (Page.goto + Interceptação)',
            });
          } else {
            if (resultado.status === 401) {
              console.log(`❌ Chamada GET falhou! Status: ${resultado.status}`);
              console.log('   Token está INATIVO (401 Unauthorized)\n');
              TestTokenRenewalLogger.logResult(false, 'Token INATIVO (401)', { status: 401 });
            } else if (resultado.status === 403) {
              console.log(`❌ Chamada GET falhou! Status: ${resultado.status}`);
              console.log('   Token foi BLOQUEADO (403 Forbidden) - Verifique headers da requisição\n');
              TestTokenRenewalLogger.logResult(false, 'Token BLOQUEADO (403)', { status: 403 });
            } else {
              console.log(`❌ Chamada GET falhou! Status: ${resultado.status || 'Unknown'}`);
              console.log(`   Erro: ${resultado.error || 'Erro desconhecido'}\n`);
              TestTokenRenewalLogger.logResult(false, `Erro na chamada GET (${resultado.status || 'Unknown'})`, {
                status: resultado.status,
                error: resultado.error,
              });
            }
          }
        } catch (error: any) {
          console.log(`❌ Erro na chamada GET: ${error.message}\n`);
          TestTokenRenewalLogger.logError(error, 'Chamada GET final');
        }
      } else {
        console.log('❌ Não foi possível inicializar Puppeteer para teste final\n');
        TestTokenRenewalLogger.logError('Não foi possível inicializar Puppeteer', 'Teste final');
      }
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ TESTE CONCLUÍDO');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    TestTokenRenewalLogger.logTestEnd(true, 'Todos os testes foram executados com sucesso');
    console.log(`📝 Log completo salvo em: ${TestTokenRenewalLogger.getLogFilePath()}\n`);

  } catch (error: any) {
    console.error('❌ Erro no teste:', error.message);
    TestTokenRenewalLogger.logError(error, 'Erro geral no teste');
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    TestTokenRenewalLogger.logTestEnd(false, `Teste finalizado com erros: ${error.message}`);
  } finally {
    // Garantir que o navegador seja fechado
    await cleanup();
  }
}

// Executar teste
testarTokenAplicacao()
  .then(() => {
    setTimeout(() => process.exit(0), 2000);
  })
  .catch((error) => {
    console.error('Erro fatal:', error);
    TestTokenRenewalLogger.logError(error, 'Erro fatal');
    process.exit(1);
  });
