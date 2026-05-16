/**
 * Script de teste para login no VMHub
 * 
 * Este script testa a conexão com o sistema VMHub, lidando com o reCAPTCHA
 * através de automação do navegador usando Puppeteer.
 * 
 * Estratégias:
 * 1. Modo Manual: Aguarda o usuário resolver o CAPTCHA manualmente
 * 2. Modo Automático: Tenta extrair o token do reCAPTCHA após resolução
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

interface EndpointLog {
  timestamp: string;
  method: string;
  url: string;
  headers: any;
  body?: any;
  queryParams?: any;
  response: {
    status: number;
    statusText: string;
    headers: any;
    data: any;
  };
  error?: string;
}

interface NetworkRequest {
  timestamp: string;
  method: string;
  url: string;
  headers: any;
  postData?: string;
  response?: {
    status: number;
    statusText: string;
    headers: any;
    body?: any;
  };
  error?: string;
}

interface LoginCredentials {
  email: string;
  senha: string;
}

interface LoginResponse {
  token: string;
  success: boolean;
  error?: string;
}

interface ClienteFiltro {
  nome?: string | null;
  cpf?: string | null;
  dataNascimento?: string | null;
  email?: string | null;
  telefone?: string | null;
  empresas?: string[] | null;
  periodoUltimaCompra?: {
    dataInicio?: string | null;
    dataTermino?: string | null;
  };
  periodoDataCadastro?: {
    dataInicio?: string | null;
    dataTermino?: string | null;
  };
  periodoParametrizadoUltimaCompra?: string | null;
  periodoParametrizadoDataCadastro?: string | null;
  agrupadores?: any[] | null;
  mesAniversario?: number | null;
}

interface ClienteHeader {
  sortable: boolean;
  visibilidade: string;
  visivelHTML: boolean;
  value: string;
  text: string;
}

interface ClienteDados {
  idCliente: number;
  cpf: string;
  nome: string;
  telefone: string;
  email: string;
}

interface ClienteRow {
  id: number;
  nome: string;
  dataNascimento: string;
  cpf: string;
  telefone: string;
  email: string;
  genero: string;
  dataCadastro: string;
  dataUltimaCompra: string;
  qtdCompras: number;
  valorTotalCompras: string;
  qtdCompras90: number;
  valorTotalCompras90: string;
  qtdCompras30: number;
  valorTotalCompras30: string;
  qtdCompras7: number;
  valorTotalCompras7: string;
  lavanderia: string;
  acoes: ClienteDados;
}

interface ClientesResponse {
  headers: ClienteHeader[];
  resultadoPaginado: {
    elementos: any[][];
    total: number;
  };
  agrupado: boolean;
}

interface BuscarClientesResponse {
  success: boolean;
  clientes?: ClienteRow[];
  total?: number;
  error?: string;
}

class VMHubLoginTester {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private readonly loginUrl = 'https://conta.vmhub.vmtecnologia.io/conta/login';
  private readonly loginUrlVmlav = 'https://vmlav.vmhub.vmtecnologia.io/login';
  private readonly apiUrl = 'https://apps.vmhub.vmtecnologia.io/conta/api/v1/contas-usuarios/login';
  private readonly clientesApiUrl = 'https://apps.vmhub.vmtecnologia.io/vmlav/api/v1/relatorios/clientes';

  /**
   * Inicializa o navegador Puppeteer
   */
  async initBrowser(headless: boolean = false): Promise<void> {
    console.log('🚀 Inicializando navegador...');
    
    this.browser = await puppeteer.launch({
      headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
      ],
      defaultViewport: {
        width: 1280,
        height: 720,
      },
    });

    this.page = await this.browser.newPage();
    
    // Configurar User-Agent para parecer um navegador real
    await this.page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0'
    );

    // Adicionar headers adicionais
    await this.page.setExtraHTTPHeaders({
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    });

    console.log('✅ Navegador inicializado');
  }

  /**
   * Extrai o token do reCAPTCHA da página
   */
  async extractRecaptchaToken(): Promise<string | null> {
    if (!this.page) {
      throw new Error('Página não inicializada');
    }

    try {
      // Aguarda o elemento do reCAPTCHA aparecer
      await this.page.waitForSelector('textarea[name="g-recaptcha-response"]', {
        timeout: 10000,
      });

      // Extrai o token do reCAPTCHA
      const token = await this.page.evaluate(() => {
        const textarea = document.querySelector<HTMLTextAreaElement>(
          'textarea[name="g-recaptcha-response"]'
        );
        return textarea?.value || null;
      });

      if (token && token.length > 0) {
        console.log('✅ Token do reCAPTCHA extraído com sucesso');
        return token;
      }

      // Tenta encontrar o token em outros lugares possíveis
      const tokenFromWindow = await this.page.evaluate(() => {
        // Verifica se há um token no window
        const recaptchaResponse = (window as any).grecaptcha?.getResponse?.();
        return recaptchaResponse || null;
      });

      return tokenFromWindow;
    } catch (error: any) {
      console.log('⚠️  Erro ao extrair token do reCAPTCHA:', error.message);
      return null;
    }
  }

  /**
   * Aguarda o usuário resolver o CAPTCHA manualmente
   */
  async waitForManualCaptchaResolution(timeout: number = 300000): Promise<string | null> {
    if (!this.page) {
      throw new Error('Página não inicializada');
    }

    console.log('⏳ Aguardando resolução manual do CAPTCHA...');
    console.log('   Por favor, resolva o CAPTCHA no navegador que foi aberto.');
    console.log(`   Timeout: ${timeout / 1000} segundos`);

    const startTime = Date.now();
    const checkInterval = 1000; // Verifica a cada 1 segundo

    while (Date.now() - startTime < timeout) {
      const token = await this.extractRecaptchaToken();
      
      if (token && token.length > 100) {
        // Token válido geralmente tem mais de 100 caracteres
        console.log('✅ CAPTCHA resolvido!');
        return token;
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    console.log('❌ Timeout: CAPTCHA não foi resolvido a tempo');
    return null;
  }

  /**
   * Monitora todas as requisições de rede após clicar no botão entrar
   */
  monitorarRequisicoesRede(page: Page): NetworkRequest[] {
    const requests: NetworkRequest[] = [];
    const requestsMap = new Map<string, NetworkRequest>();

    // Interceptar requisições
    page.on('request', (request) => {
      const url = request.url();
      // Evitar duplicatas
      if (!requestsMap.has(url)) {
        const networkReq: NetworkRequest = {
          timestamp: new Date().toISOString(),
          method: request.method(),
          url: url,
          headers: request.headers(),
          postData: request.postData() || undefined,
        };
        requestsMap.set(url, networkReq);
        requests.push(networkReq);
      }
    });

    // Interceptar respostas
    page.on('response', async (response) => {
      const url = response.url();
      const request = requestsMap.get(url);
      
      if (request && !request.response) {
        try {
          const status = response.status();
          const statusText = response.statusText();
          const headers = response.headers();
          
          // Tentar obter o body da resposta
          let body: any = null;
          try {
            const contentType = headers['content-type'] || '';
            if (contentType.includes('application/json')) {
              body = await response.json();
            } else if (contentType.includes('text/') || contentType.includes('text/plain')) {
              body = await response.text();
            }
          } catch (e) {
            // Ignorar erro ao ler body
          }

          request.response = {
            status,
            statusText,
            headers,
            body,
          };
        } catch (error: any) {
          request.error = error.message;
        }
      }
    });

    return requests;
  }

  /**
   * Preenche o formulário de login e clica no botão entrar
   */
  async fillLoginFormAndSubmit(credentials: LoginCredentials): Promise<NetworkRequest[]> {
    if (!this.page) {
      throw new Error('Página não inicializada');
    }

    console.log('📝 Preenchendo formulário de login...');

    // Aguarda a página carregar completamente
    await this.page.goto(this.loginUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // Aguarda os campos de input aparecerem
    await this.page.waitForSelector('input[type="email"], input[name="email"], input[id="email"]', {
      timeout: 10000,
    });

    // Tenta encontrar e preencher o campo de email
    const emailSelectors = [
      'input[type="email"]',
      'input[name="email"]',
      'input[id="email"]',
      'input[placeholder*="email" i]',
      'input[placeholder*="e-mail" i]',
    ];

    let emailFilled = false;
    for (const selector of emailSelectors) {
      try {
        const element = await this.page.$(selector);
        if (element) {
          await element.type(credentials.email, { delay: 50 });
          emailFilled = true;
          console.log(`✅ Email preenchido usando seletor: ${selector}`);
          break;
        }
      } catch (error) {
        // Continua tentando outros seletores
      }
    }

    if (!emailFilled) {
      throw new Error('Não foi possível encontrar o campo de email');
    }

    // Aguarda um pouco antes de preencher a senha
    await new Promise(resolve => setTimeout(resolve, 500));

    // Tenta encontrar e preencher o campo de senha
    const passwordSelectors = [
      'input[type="password"]',
      'input[name="senha"]',
      'input[id="senha"]',
      'input[name="password"]',
      'input[id="password"]',
    ];

    let passwordFilled = false;
    for (const selector of passwordSelectors) {
      try {
        const element = await this.page.$(selector);
        if (element) {
          await element.type(credentials.senha, { delay: 50 });
          passwordFilled = true;
          console.log(`✅ Senha preenchida usando seletor: ${selector}`);
          break;
        }
      } catch (error) {
        // Continua tentando outros seletores
      }
    }

    if (!passwordFilled) {
      throw new Error('Não foi possível encontrar o campo de senha');
    }

    console.log('✅ Formulário preenchido com sucesso');
    
    // Iniciar monitoramento de rede ANTES de clicar no botão
    console.log('📡 Iniciando monitoramento de requisições de rede...');
    const networkRequests = this.monitorarRequisicoesRede(this.page!);
    
    // Aguardar um pouco antes de clicar
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Procurar e clicar no botão "Entrar"
    console.log('🔍 Procurando botão de login...');
    const buttonSelectors = [
      'button[type="submit"]',
      'button:has-text("Entrar")',
      'button:has-text("Login")',
      'input[type="submit"]',
      'button.btn-primary',
      'button.btn-login',
      'a[href*="login"]',
      '[role="button"]:has-text("Entrar")',
    ];
    
    let buttonClicked = false;
    for (const selector of buttonSelectors) {
      try {
        // Tentar encontrar o botão pelo texto
        if (selector.includes('has-text')) {
          const buttons = await this.page!.$$('button, input[type="submit"], a');
          for (const btn of buttons) {
            const text = await this.page!.evaluate(el => el.textContent?.toLowerCase() || '', btn);
            if (text.includes('entrar') || text.includes('login') || text.includes('acessar')) {
              await btn.click();
              buttonClicked = true;
              console.log(`✅ Botão clicado (encontrado pelo texto: "${text}")`);
              break;
            }
          }
          if (buttonClicked) break;
        } else {
          const button = await this.page!.$(selector);
          if (button) {
            await button.click();
            buttonClicked = true;
            console.log(`✅ Botão clicado usando seletor: ${selector}`);
            break;
          }
        }
      } catch (error) {
        // Continua tentando
      }
    }
    
    if (!buttonClicked) {
      // Tentar encontrar por texto usando XPath ou avaliação
      try {
        await this.page!.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], a'));
          const entrarBtn = buttons.find((btn: any) => {
            const text = btn.textContent?.toLowerCase() || btn.value?.toLowerCase() || '';
            return text.includes('entrar') || text.includes('login') || text.includes('acessar');
          });
          if (entrarBtn) {
            (entrarBtn as HTMLElement).click();
          }
        });
        buttonClicked = true;
        console.log('✅ Botão clicado usando busca por texto');
      } catch (error) {
        console.log('⚠️  Não foi possível encontrar o botão automaticamente');
      }
    }
    
    if (buttonClicked) {
      console.log('⏳ Aguardando requisições de rede após clique...');
      // Aguardar um tempo para capturar todas as requisições
      await new Promise(resolve => setTimeout(resolve, 10000));
    } else {
      console.log('⚠️  Botão não foi clicado automaticamente. Por favor, clique manualmente.');
      console.log('⏳ Aguardando 30 segundos para você clicar no botão...');
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
    
    return networkRequests;
  }

  /**
   * Preenche o formulário de login (versão antiga - mantida para compatibilidade)
   */
  async fillLoginForm(credentials: LoginCredentials): Promise<void> {
    if (!this.page) {
      throw new Error('Página não inicializada');
    }

    console.log('📝 Preenchendo formulário de login...');

    // Aguarda a página carregar completamente
    await this.page.goto(this.loginUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // Aguarda os campos de input aparecerem
    await this.page.waitForSelector('input[type="email"], input[name="email"], input[id="email"]', {
      timeout: 10000,
    });

    // Tenta encontrar e preencher o campo de email
    const emailSelectors = [
      'input[type="email"]',
      'input[name="email"]',
      'input[id="email"]',
      'input[placeholder*="email" i]',
      'input[placeholder*="e-mail" i]',
    ];

    let emailFilled = false;
    for (const selector of emailSelectors) {
      try {
        const element = await this.page.$(selector);
        if (element) {
          await element.type(credentials.email, { delay: 50 });
          emailFilled = true;
          console.log(`✅ Email preenchido usando seletor: ${selector}`);
          break;
        }
      } catch (error) {
        // Continua tentando outros seletores
      }
    }

    if (!emailFilled) {
      throw new Error('Não foi possível encontrar o campo de email');
    }

    // Aguarda um pouco antes de preencher a senha
    await new Promise(resolve => setTimeout(resolve, 500));

    // Tenta encontrar e preencher o campo de senha
    const passwordSelectors = [
      'input[type="password"]',
      'input[name="senha"]',
      'input[id="senha"]',
      'input[name="password"]',
      'input[id="password"]',
    ];

    let passwordFilled = false;
    for (const selector of passwordSelectors) {
      try {
        const element = await this.page.$(selector);
        if (element) {
          await element.type(credentials.senha, { delay: 50 });
          passwordFilled = true;
          console.log(`✅ Senha preenchida usando seletor: ${selector}`);
          break;
        }
      } catch (error) {
        // Continua tentando outros seletores
      }
    }

    if (!passwordFilled) {
      throw new Error('Não foi possível encontrar o campo de senha');
    }

    console.log('✅ Formulário preenchido com sucesso');
  }

  /**
   * Clica no botão entrar
   */
  async clicarBotaoEntrar(): Promise<void> {
    if (!this.page) {
      throw new Error('Página não inicializada');
    }

    // Procurar e clicar no botão "Entrar"
    const buttonSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button.btn-primary',
      'button.btn-login',
    ];
    
    let buttonClicked = false;
    for (const selector of buttonSelectors) {
      try {
        const button = await this.page.$(selector);
        if (button) {
          await button.click();
          buttonClicked = true;
          console.log(`✅ Botão clicado usando seletor: ${selector}`);
          break;
        }
      } catch (error) {
        // Continua tentando
      }
    }
    
    if (!buttonClicked) {
      // Tentar encontrar por texto
      try {
        await this.page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], a'));
          const entrarBtn = buttons.find((btn: any) => {
            const text = btn.textContent?.toLowerCase() || btn.value?.toLowerCase() || '';
            return text.includes('entrar') || text.includes('login') || text.includes('acessar');
          });
          if (entrarBtn) {
            (entrarBtn as HTMLElement).click();
          }
        });
        buttonClicked = true;
        console.log('✅ Botão clicado usando busca por texto');
      } catch (error) {
        console.log('⚠️  Não foi possível encontrar o botão automaticamente');
        console.log('   Por favor, clique manualmente no botão entrar');
      }
    }
  }

  /**
   * Faz a requisição de login para a API
   */
  async makeLoginRequest(
    credentials: LoginCredentials,
    recaptchaToken: string
  ): Promise<LoginResponse> {
    console.log('📡 Fazendo requisição de login para a API...');

    try {
      const response = await axios.post(
        this.apiUrl,
        {
          email: credentials.email,
          senha: credentials.senha,
          tokenRecaptcha: recaptchaToken,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/plain, */*',
            'Origin': 'https://conta.vmhub.vmtecnologia.io',
            'Referer': 'https://conta.vmhub.vmtecnologia.io/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0',
            'Time-Zone': 'America/Sao_Paulo',
            'X-Origin': 'https://vmlav.vmhub.vmtecnologia.io',
          },
          timeout: 30000,
        }
      );

      if (response.data && typeof response.data === 'string') {
        // A resposta é um JWT token
        console.log('✅ Login realizado com sucesso!');
        
        // Verificar se o token tem o clientId necessário
        try {
          const payload = JSON.parse(
            Buffer.from(response.data.split('.')[1], 'base64').toString()
          );
          console.log(`   Token clientId: ${payload.clientId || 'NÃO TEM - pode causar erro 403'}`);
          
          // Se não tiver clientId, navegar para vmlav e obter token do localStorage
          if (!payload.clientId && this.page) {
            console.log('   ⚠️  Token não tem clientId. Navegando para vmlav para obter token correto...');
            
            try {
              // Navegar para a aplicação vmlav (o token será salvo no localStorage)
              await this.page.goto('https://vmlav.vmhub.vmtecnologia.io', {
                waitUntil: 'networkidle2',
                timeout: 15000,
              });
              
              // Aguardar o token ser salvo no localStorage
              await new Promise(resolve => setTimeout(resolve, 5000));
              
              // Tentar obter o token do localStorage (múltiplas tentativas)
              let tokenFromStorage: string | null = null;
              for (let i = 0; i < 10; i++) {
                tokenFromStorage = await this.page.evaluate(() => {
                  return localStorage.getItem('token');
                });
                
                if (tokenFromStorage) {
                  console.log(`   ✅ Token encontrado no localStorage (tentativa ${i + 1})!`);
                  
                  // Verificar se tem clientId
                  try {
                    const storagePayload = JSON.parse(
                      Buffer.from(tokenFromStorage.split('.')[1], 'base64').toString()
                    );
                    if (storagePayload.clientId === 'vmlav') {
                      console.log('   ✅ Token tem clientId: vmlav - PERFEITO!');
                      return {
                        token: tokenFromStorage,
                        success: true,
                      };
                    }
                  } catch (e) {
                    // Usar mesmo assim se não conseguir decodificar
                    return {
                      token: tokenFromStorage,
                      success: true,
                    };
                  }
                }
                
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
              
              if (!tokenFromStorage) {
                console.log('   ⚠️  Token não encontrado no localStorage após navegação');
              }
            } catch (e: any) {
              console.log(`   ⚠️  Erro ao obter token do localStorage: ${e.message}`);
            }
          }
        } catch (e) {
          // Ignorar erro de decodificação
        }
        
        return {
          token: response.data,
          success: true,
        };
      }

      throw new Error('Resposta da API não contém token válido');
    } catch (error: any) {
      console.error('❌ Erro na requisição de login:', error.message);
      
      if (error.response) {
        console.error('   Status:', error.response.status);
        console.error('   Dados:', JSON.stringify(error.response.data, null, 2));
      }

      return {
        token: '',
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Obtém o token específico da aplicação vmlav após o login
   * Faz GET para /conta/api/v1/contas-usuarios/login/aplicacao
   */
  async obterTokenAplicacao(tokenLogin: string): Promise<string | null> {
    console.log('');
    console.log('🔑 Obtendo token específico da aplicação vmlav...');
    
    try {
      // Fazer GET para o endpoint de aplicação
      const response = await axios.get(
        'https://apps.vmhub.vmtecnologia.io/conta/api/v1/contas-usuarios/login/aplicacao',
        {
          headers: {
            'Authorization': `Bearer ${tokenLogin}`,
            'Accept': 'application/json, text/html, */*',
            'Origin': 'https://conta.vmhub.vmtecnologia.io',
            'Referer': 'https://conta.vmhub.vmtecnologia.io/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0',
            'Time-Zone': 'America/Sao_Paulo',
            'X-Origin': 'https://vmlav.vmhub.vmtecnologia.io',
          },
          timeout: 30000,
          maxRedirects: 5,
        }
      );

      // Tentar extrair token da resposta
      let tokenAplicacao: string | null = null;

      // Se a resposta for HTML, extrair do input hidden
      if (typeof response.data === 'string' && response.data.includes('<input')) {
        console.log('   📄 Resposta é HTML, extraindo token do input hidden...');
        
        // Extrair token do HTML usando regex
        const tokenMatch = response.data.match(/id="access_token"[^>]*value="([^"]+)"/);
        if (tokenMatch && tokenMatch[1]) {
          tokenAplicacao = tokenMatch[1];
          console.log('   ✅ Token extraído do HTML!');
        }
      } 
      // Se a resposta for JSON
      else if (typeof response.data === 'object') {
        console.log('   📄 Resposta é JSON');
        if (response.data.token) {
          tokenAplicacao = response.data.token;
        } else if (response.data.access_token) {
          tokenAplicacao = response.data.access_token;
        }
      }
      // Se a resposta for texto (JWT direto)
      else if (typeof response.data === 'string' && response.data.includes('eyJ')) {
        tokenAplicacao = response.data.trim();
        console.log('   ✅ Token recebido como texto!');
      }

      if (tokenAplicacao) {
        // Verificar se tem clientId
        try {
          const payload = JSON.parse(
            Buffer.from(tokenAplicacao.split('.')[1], 'base64').toString()
          );
          
          if (payload.clientId === 'vmlav') {
            console.log('   ✅ Token tem clientId: vmlav - PERFEITO!');
            console.log(`   📋 Subject: ${payload.sub || 'N/A'}`);
            console.log(`   📋 Email: ${payload.email || 'N/A'}`);
            console.log(`   📋 Expira em: ${new Date(payload.exp * 1000).toLocaleString()}`);
            return tokenAplicacao;
          } else {
            console.log(`   ⚠️  Token não tem clientId: vmlav (tem: ${payload.clientId || 'nenhum'})`);
            // Retornar mesmo assim, pode funcionar
            return tokenAplicacao;
          }
        } catch (e) {
          console.log('   ⚠️  Não foi possível decodificar o token, mas retornando mesmo assim');
          return tokenAplicacao;
        }
      } else {
        console.log('   ⚠️  Token não encontrado na resposta');
        console.log(`   📄 Tipo de resposta: ${typeof response.data}`);
        console.log(`   📄 Tamanho: ${typeof response.data === 'string' ? response.data.length : 'N/A'}`);
        return null;
      }
    } catch (error: any) {
      console.error('   ❌ Erro ao obter token da aplicação:', error.message);
      
      if (error.response) {
        console.error(`   Status: ${error.response.status}`);
        console.error(`   Headers: ${JSON.stringify(error.response.headers, null, 2)}`);
        
        // Se for redirecionamento, tentar extrair token da URL ou do HTML
        if (error.response.status === 302 || error.response.status === 301) {
          const location = error.response.headers.location;
          if (location && location.includes('access_token=')) {
            const tokenMatch = location.match(/access_token=([^&]+)/);
            if (tokenMatch && tokenMatch[1]) {
              console.log('   ✅ Token encontrado na URL de redirecionamento!');
              return decodeURIComponent(tokenMatch[1]);
            }
          }
        }
      }
      
      return null;
    }
  }

  /**
   * Executa o teste de login completo
   */
  async testLogin(
    credentials: LoginCredentials,
    options: {
      headless?: boolean;
      manualCaptcha?: boolean;
      captchaTimeout?: number;
    } = {}
  ): Promise<LoginResponse> {
    const {
      headless = false,
      manualCaptcha = true,
      captchaTimeout = 300000, // 5 minutos
    } = options;

    try {
      // 1. Inicializar navegador
      await this.initBrowser(headless);

      // 2. Preencher formulário (sem clicar no botão ainda)
      console.log('📝 Preenchendo formulário...');
      await this.fillLoginForm(credentials);

      // 3. Iniciar monitoramento de rede ANTES de resolver CAPTCHA
      console.log('📡 Iniciando monitoramento de requisições de rede...');
      const networkRequests = this.monitorarRequisicoesRede(this.page!);

      // 4. Aguardar resolução do CAPTCHA
      let recaptchaToken: string | null = null;

      if (manualCaptcha) {
        console.log('⏳ Aguardando resolução manual do CAPTCHA...');
        console.log('   Por favor, resolva o CAPTCHA no navegador.');
        recaptchaToken = await this.waitForManualCaptchaResolution(captchaTimeout);
      } else {
        // Modo automático: tenta extrair o token periodicamente
        console.log('🔄 Modo automático: tentando extrair token do reCAPTCHA...');
        const startTime = Date.now();
        while (Date.now() - startTime < captchaTimeout) {
          recaptchaToken = await this.extractRecaptchaToken();
          if (recaptchaToken && recaptchaToken.length > 100) {
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      if (!recaptchaToken) {
        throw new Error('Não foi possível obter o token do reCAPTCHA');
      }

      console.log(`📋 Token do reCAPTCHA obtido (${recaptchaToken.length} caracteres)`);
      console.log('✅ CAPTCHA resolvido!');
      
      // 5. AGORA clicar no botão entrar
      console.log('');
      console.log('🖱️  Clicando no botão entrar...');
      await this.clicarBotaoEntrar();
      
      console.log('📡 Monitorando todas as requisições de rede após clique...');
      
      // Aguardar mais tempo para capturar todas as requisições após o login
      console.log('⏳ Aguardando 20 segundos para capturar todas as requisições...');
      await new Promise(resolve => setTimeout(resolve, 20000));
      
      // Salvar requisições de rede em arquivo
      const networkLogPath = path.join(__dirname, 'network_requests.log');
      const networkLogContent = {
        monitoramentoIniciadoEm: new Date().toISOString(),
        totalRequisicoes: networkRequests.length,
        requisicoes: networkRequests.map(req => ({
          ...req,
          // Converter postData para objeto se for JSON
          postDataParsed: req.postData ? (() => {
            try {
              return JSON.parse(req.postData);
            } catch {
              return req.postData;
            }
          })() : undefined,
        })),
      };
      
      fs.writeFileSync(
        networkLogPath,
        JSON.stringify(networkLogContent, null, 2),
        'utf-8'
      );
      
      console.log('');
      console.log('='.repeat(60));
      console.log('📝 REQUISIÇÕES DE REDE CAPTURADAS');
      console.log('='.repeat(60));
      console.log(`Total de requisições: ${networkRequests.length}`);
      console.log(`Arquivo salvo em: ${networkLogPath}`);
      console.log('');
      
      // Mostrar resumo das requisições
      networkRequests.forEach((req, index) => {
        console.log(`${index + 1}. ${req.method} ${req.url}`);
        if (req.response) {
          console.log(`   Status: ${req.response.status} ${req.response.statusText}`);
        }
      });
      
      // Tentar encontrar o token nas requisições
      const tokenRequest = networkRequests.find(req => 
        req.response?.body && 
        typeof req.response.body === 'string' &&
        req.response.body.startsWith('eyJ')
      );
      
      if (tokenRequest) {
        console.log('');
        console.log('✅ Token encontrado em uma das requisições!');
        console.log(`   URL: ${tokenRequest.url}`);
        console.log(`   Método: ${tokenRequest.method}`);
      }

      // 4. Fazer requisição de login (manter para compatibilidade, mas pode não ser necessário)
      console.log('');
      console.log('⚠️  Nota: O login pode já ter sido feito pelo clique no botão.');
      console.log('   Verificando token no localStorage...');
      
      // Tentar obter token do localStorage
      let tokenFromStorage: string | null = null;
      for (let i = 0; i < 10; i++) {
        tokenFromStorage = await this.page!.evaluate(() => {
          return localStorage.getItem('token');
        });
        
        if (tokenFromStorage) {
          console.log(`✅ Token encontrado no localStorage (tentativa ${i + 1})!`);
          break;
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      let loginResult: LoginResponse;
      
      if (tokenFromStorage) {
        // Verificar se tem clientId
        try {
          const payload = JSON.parse(
            Buffer.from(tokenFromStorage.split('.')[1], 'base64').toString()
          );
          if (payload.clientId === 'vmlav') {
            console.log('✅ Token tem clientId: vmlav - PERFEITO!');
            loginResult = {
              token: tokenFromStorage,
              success: true,
            };
          } else {
            // Usar token mesmo sem clientId
            loginResult = {
              token: tokenFromStorage,
              success: true,
            };
          }
        } catch (e) {
          loginResult = {
            token: tokenFromStorage,
            success: true,
          };
        }
      } else {
        // Fallback: fazer requisição manual
        console.log('⚠️  Token não encontrado no localStorage, fazendo requisição manual...');
        loginResult = await this.makeLoginRequest(credentials, recaptchaToken);
      }

      return loginResult;
    } catch (error: any) {
      console.error('❌ Erro durante o teste de login:', error.message);
      return {
        token: '',
        success: false,
        error: error.message,
      };
    } finally {
      // 5. Fechar navegador (opcional - pode manter aberto para debug)
      // await this.closeBrowser();
    }
  }

  /**
   * Fecha o navegador
   */
  async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      console.log('🔒 Navegador fechado');
    }
  }

  /**
   * Mantém o navegador aberto para inspeção
   */
  async keepBrowserOpen(): Promise<void> {
    console.log('🔓 Navegador será mantido aberto para inspeção.');
    console.log('   Pressione Ctrl+C para encerrar o script.');
  }

  /**
   * Tenta fazer login diretamente na aplicação vmlav
   */
  async fazerLoginVmlav(credentials: LoginCredentials): Promise<LoginResponse> {
    console.log('');
    console.log('='.repeat(60));
    console.log('🔐 TENTANDO LOGIN DIRETO NA APLICAÇÃO VMLAV');
    console.log('='.repeat(60));
    console.log('');

    if (!this.page) {
      throw new Error('Página não inicializada');
    }

    try {
      console.log('📝 Acessando página de login da aplicação vmlav...');
      await this.page.goto(this.loginUrlVmlav, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // Aguardar um pouco para a página carregar
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Tentar encontrar e preencher campos de login
      const emailSelectors = [
        'input[type="email"]',
        'input[name="email"]',
        'input[id="email"]',
        'input[placeholder*="email" i]',
      ];

      let emailFilled = false;
      for (const selector of emailSelectors) {
        try {
          const element = await this.page.$(selector);
          if (element) {
            await element.type(credentials.email, { delay: 50 });
            emailFilled = true;
            console.log(`✅ Email preenchido usando seletor: ${selector}`);
            break;
          }
        } catch (error) {
          // Continua tentando
        }
      }

      if (!emailFilled) {
        console.log('⚠️  Não foi possível encontrar o campo de email na página vmlav');
        return {
          token: '',
          success: false,
          error: 'Campo de email não encontrado',
        };
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      const passwordSelectors = [
        'input[type="password"]',
        'input[name="senha"]',
        'input[id="senha"]',
        'input[name="password"]',
      ];

      let passwordFilled = false;
      for (const selector of passwordSelectors) {
        try {
          const element = await this.page.$(selector);
          if (element) {
            await element.type(credentials.senha, { delay: 50 });
            passwordFilled = true;
            console.log(`✅ Senha preenchida usando seletor: ${selector}`);
            break;
          }
        } catch (error) {
          // Continua tentando
        }
      }

      if (!passwordFilled) {
        console.log('⚠️  Não foi possível encontrar o campo de senha na página vmlav');
        return {
          token: '',
          success: false,
          error: 'Campo de senha não encontrado',
        };
      }

      // Aguardar resolução do CAPTCHA
      console.log('⏳ Aguardando resolução manual do CAPTCHA na página vmlav...');
      const recaptchaToken = await this.waitForManualCaptchaResolution(300000);

      if (!recaptchaToken) {
        return {
          token: '',
          success: false,
          error: 'CAPTCHA não foi resolvido',
        };
      }

      // Tentar encontrar o token na resposta ou no localStorage após login
      console.log('🔍 Verificando se o login foi bem-sucedido...');
      
      // Aguardar um pouco mais para garantir que o token foi salvo
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Verificar se há token no localStorage (múltiplas tentativas)
      let tokenFromStorage: string | null = null;
      for (let i = 0; i < 10; i++) {
        tokenFromStorage = await this.page.evaluate(() => {
          return localStorage.getItem('token') || 
                 localStorage.getItem('authToken') ||
                 sessionStorage.getItem('token') ||
                 sessionStorage.getItem('authToken');
        });

        if (tokenFromStorage) {
          console.log(`✅ Token encontrado no storage (tentativa ${i + 1})!`);
          
          // Verificar se o token tem clientId
          try {
            const payload = JSON.parse(
              Buffer.from(tokenFromStorage.split('.')[1], 'base64').toString()
            );
            console.log(`   Token clientId: ${payload.clientId || 'NÃO TEM'}`);
            if (payload.clientId === 'vmlav') {
              console.log('   ✅ Token tem clientId correto (vmlav)!');
            }
          } catch (e) {
            // Ignorar erro de decodificação
          }
          
          return {
            token: tokenFromStorage,
            success: true,
          };
        }
        
        // Aguardar antes de tentar novamente
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Se ainda não encontrou, verificar se a URL mudou (indicando login bem-sucedido)
      const currentUrl = this.page.url();
      if (currentUrl.includes('vmlav') && !currentUrl.includes('login')) {
        console.log('✅ Login parece ter sido bem-sucedido (URL mudou)');
        console.log('🔍 Tentando extrair token do localStorage novamente...');
        
        // Tentar mais uma vez após a mudança de URL
        await new Promise(resolve => setTimeout(resolve, 2000));
        tokenFromStorage = await this.page.evaluate(() => {
          return localStorage.getItem('token');
        });
        
        if (tokenFromStorage) {
          console.log('✅ Token encontrado após mudança de URL!');
          return {
            token: tokenFromStorage,
            success: true,
          };
        }
        
        // Listar todas as chaves do localStorage para debug
        const allKeys = await this.page.evaluate(() => {
          const keys: string[] = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key) keys.push(key);
          }
          return keys;
        });
        
        console.log('📋 Chaves no localStorage:', allKeys.join(', '));
        console.log('⚠️  Token não encontrado automaticamente');
        console.log('   Verifique manualmente no navegador: localStorage.getItem("token")');
      }

      return {
        token: '',
        success: false,
        error: 'Token não encontrado após login',
      };

    } catch (error: any) {
      console.error('❌ Erro ao fazer login na aplicação vmlav:', error.message);
      return {
        token: '',
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Explora e testa diferentes endpoints da API
   */
  async explorarEndpoints(token: string, logFile: string = 'api_exploration.log'): Promise<void> {
    console.log('');
    console.log('='.repeat(60));
    console.log('🔍 EXPLORANDO ENDPOINTS DA API');
    console.log('='.repeat(60));
    console.log('');

    const logs: EndpointLog[] = [];
    const baseUrl = 'https://apps.vmhub.vmtecnologia.io';
    
    // Lista de endpoints possíveis para testar
    const endpoints = [
      // Endpoints de autenticação/token
      { method: 'GET', path: '/conta/api/v1/contas-usuarios/perfil', description: 'Perfil do usuário' },
      { method: 'GET', path: '/conta/api/v1/contas-usuarios/me', description: 'Informações do usuário logado' },
      { method: 'POST', path: '/autenticacao/api/v1/token', description: 'Obter token da aplicação' },
      { method: 'POST', path: '/autenticacao/api/v1/token/vmlav', description: 'Obter token vmlav' },
      { method: 'GET', path: '/autenticacao/api/v1/token', description: 'Obter token (GET)' },
      { method: 'POST', path: '/apps.vmhub.vmtecnologia.io/autenticacao/api/v1/token', description: 'Obter token (caminho completo)' },
      
      // Endpoints de clientes (diferentes variações)
      { method: 'POST', path: '/vmlav/api/v1/relatorios/clientes', description: 'Relatório de clientes (vmlav)' },
      { method: 'GET', path: '/vmlav/api/v1/clientes', description: 'Lista de clientes (GET)' },
      { method: 'GET', path: '/vmlav/api/v1/relatorios/clientes', description: 'Relatório de clientes (GET)' },
      { method: 'POST', path: '/api/v1/relatorios/clientes', description: 'Relatório de clientes (sem vmlav)' },
      
      // Outros endpoints possíveis
      { method: 'GET', path: '/vmlav/api/v1/empresas', description: 'Lista de empresas' },
      { method: 'GET', path: '/vmlav/api/v1/dashboard', description: 'Dashboard' },
      { method: 'GET', path: '/vmlav/api/v1/configuracoes', description: 'Configurações' },
    ];

    for (const endpoint of endpoints) {
      const fullUrl = `${baseUrl}${endpoint.path}`;
      console.log(`\n🔍 Testando: ${endpoint.method} ${endpoint.path}`);
      console.log(`   Descrição: ${endpoint.description}`);

      try {
        const headers: any = {
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'pt',
          'Authorization': `Bearer ${token}`,
          'Origin': 'https://vmlav.vmhub.vmtecnologia.io',
          'Referer': 'https://vmlav.vmhub.vmtecnologia.io/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0',
          'Time-Zone': 'America/Sao_Paulo',
          'X-Vm-App': 'vmlav',
          'X-Vm-Emp': 'lavateriajdnovomundo',
        };

        let response;
        const startTime = Date.now();

        if (endpoint.method === 'GET') {
          response = await axios.get(fullUrl, {
            headers,
            timeout: 10000,
            validateStatus: () => true, // Não lançar erro para qualquer status
          });
        } else if (endpoint.method === 'POST') {
          // Para POST, tentar com body vazio e com body de exemplo
          let body: any = {};
          
          if (endpoint.path.includes('clientes')) {
            body = {
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
          } else if (endpoint.path.includes('token')) {
            // Para endpoints de token, tentar enviar o token atual ou clientId
            body = {
              token: token,
              clientId: 'vmlav',
            };
            console.log(`   Body enviado: ${JSON.stringify(body).substring(0, 100)}...`);
          }

          headers['Content-Type'] = 'application/json';

          response = await axios.post(fullUrl, body, {
            headers,
            timeout: 10000,
            validateStatus: () => true,
            params: endpoint.path.includes('clientes') ? {
              execCount: 'true',
              pagina: '0',
              quantidade: '10',
              direcaoOrdenacao: 'ASC',
              campoOrdenacao: 'cliente.nome',
            } : undefined,
          });
        }

        const duration = Date.now() - startTime;

        const logEntry: EndpointLog = {
          timestamp: new Date().toISOString(),
          method: endpoint.method,
          url: fullUrl,
          headers: headers,
          body: endpoint.method === 'POST' ? (endpoint.path.includes('clientes') ? {
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
          } : endpoint.path.includes('token') ? {
            token: token,
            clientId: 'vmlav',
          } : {}) : undefined,
          queryParams: endpoint.method === 'POST' && endpoint.path.includes('clientes') ? {
            execCount: 'true',
            pagina: '0',
            quantidade: '10',
            direcaoOrdenacao: 'ASC',
            campoOrdenacao: 'cliente.nome',
          } : undefined,
          response: {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            data: response.data,
          },
        };

        logs.push(logEntry);

        // Exibir resultado
        if (response.status === 200) {
          console.log(`   ✅ Status: ${response.status} (${duration}ms)`);
          console.log(`   📦 Tipo de resposta: ${typeof response.data}`);
          if (typeof response.data === 'object') {
            console.log(`   📋 Chaves principais: ${Object.keys(response.data).slice(0, 5).join(', ')}`);
          }
        } else if (response.status === 403) {
          console.log(`   ❌ Status: ${response.status} (Forbidden) - Token pode não ter permissão`);
        } else if (response.status === 401) {
          console.log(`   ❌ Status: ${response.status} (Unauthorized) - Token inválido ou expirado`);
        } else if (response.status === 404) {
          console.log(`   ⚠️  Status: ${response.status} (Not Found) - Endpoint não existe`);
        } else {
          console.log(`   ⚠️  Status: ${response.status} (${response.statusText})`);
        }

      } catch (error: any) {
        const logEntry: EndpointLog = {
          timestamp: new Date().toISOString(),
          method: endpoint.method,
          url: fullUrl,
          headers: {},
          response: {
            status: error.response?.status || 0,
            statusText: error.response?.statusText || 'Error',
            headers: error.response?.headers || {},
            data: error.response?.data || null,
          },
          error: error.message,
        };

        logs.push(logEntry);
        console.log(`   ❌ Erro: ${error.message}`);
        if (error.response) {
          console.log(`   Status: ${error.response.status}`);
        }
      }
    }

    // Salvar logs em arquivo
    const logPath = path.join(__dirname, logFile);
    const logContent = {
      exploracaoIniciadaEm: new Date().toISOString(),
      tokenUsado: token.substring(0, 50) + '...',
      totalEndpointsTestados: endpoints.length,
      endpoints: logs,
    };

    fs.writeFileSync(
      logPath,
      JSON.stringify(logContent, null, 2),
      'utf-8'
    );

    console.log('');
    console.log('='.repeat(60));
    console.log('📝 LOGS SALVOS');
    console.log('='.repeat(60));
    console.log(`Arquivo: ${logPath}`);
    console.log(`Total de endpoints testados: ${endpoints.length}`);
    console.log(`Endpoints com sucesso (200): ${logs.filter(l => l.response.status === 200).length}`);
    console.log(`Endpoints com erro 403: ${logs.filter(l => l.response.status === 403).length}`);
    console.log(`Endpoints com erro 404: ${logs.filter(l => l.response.status === 404).length}`);
    console.log('');
  }

  /**
   * Busca clientes usando o token de autenticação
   */
  async buscarClientes(
    token: string,
    filtro: ClienteFiltro = {},
    options: {
      pagina?: number;
      quantidade?: number;
      campoOrdenacao?: string;
      direcaoOrdenacao?: 'ASC' | 'DESC';
      execCount?: boolean;
      empresa?: string;
    } = {}
  ): Promise<BuscarClientesResponse> {
    const {
      pagina = 0,
      quantidade = 10000,
      campoOrdenacao = 'cliente.nome',
      direcaoOrdenacao = 'ASC',
      execCount = true,
      empresa = 'lavateriajdnovomundo',
    } = options;

    console.log('📡 Buscando clientes...');
    console.log(`   URL: ${this.clientesApiUrl}`);
    console.log(`   Empresa: ${empresa}`);
    console.log(`   Token (primeiros 50 chars): ${token.substring(0, 50)}...`);

    // Decodificar token para verificar informações
    try {
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64').toString()
      );
      console.log(`   Token clientId: ${payload.clientId || 'N/A'}`);
      console.log(`   Token expira em: ${new Date(payload.exp * 1000).toLocaleString()}`);
    } catch (e) {
      console.log('   (Não foi possível decodificar token)');
    }

    try {
      // Montar query parameters
      const queryParams = new URLSearchParams({
        execCount: execCount.toString(),
        pagina: pagina.toString(),
        quantidade: quantidade.toString(),
        direcaoOrdenacao,
        campoOrdenacao,
      });

      const url = `${this.clientesApiUrl}?${queryParams.toString()}`;
      console.log(`   Query params: ${queryParams.toString()}`);

      // Preparar body da requisição
      const body: ClienteFiltro = {
        nome: filtro.nome ?? null,
        cpf: filtro.cpf ?? null,
        dataNascimento: filtro.dataNascimento ?? null,
        email: filtro.email ?? null,
        telefone: filtro.telefone ?? null,
        empresas: filtro.empresas ?? null,
        periodoUltimaCompra: filtro.periodoUltimaCompra ?? {
          dataInicio: null,
          dataTermino: null,
        },
        periodoDataCadastro: filtro.periodoDataCadastro ?? {
          dataInicio: null,
          dataTermino: null,
        },
        periodoParametrizadoUltimaCompra: filtro.periodoParametrizadoUltimaCompra ?? null,
        periodoParametrizadoDataCadastro: filtro.periodoParametrizadoDataCadastro ?? null,
        agrupadores: filtro.agrupadores ?? null,
        mesAniversario: filtro.mesAniversario ?? null,
      };

      // Preparar headers exatamente como na requisição original
      const headers: any = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'pt',
        'Authorization': `Bearer ${token}`,
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Content-Length': JSON.stringify(body).length.toString(),
        'Origin': 'https://vmlav.vmhub.vmtecnologia.io',
        'Pragma': 'no-cache',
        'Priority': 'u=4',
        'Referer': 'https://vmlav.vmhub.vmtecnologia.io/',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'no-cors',
        'Sec-Fetch-Site': 'same-site',
        'Time-Zone': 'America/Sao_Paulo',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0',
        'X-Vm-App': 'vmlav',
        'X-Vm-Emp': empresa,
      };

      console.log('   Headers da requisição:');
      console.log(`   Authorization: Bearer ${token.substring(0, 20)}...`);
      console.log(`   X-Vm-App: ${headers['X-Vm-App']}`);
      console.log(`   X-Vm-Emp: ${headers['X-Vm-Emp']}`);
      console.log(`   Origin: ${headers['Origin']}`);

      const response = await axios.post<ClientesResponse>(url, body, {
        headers,
        timeout: 60000, // 60 segundos
      });

      console.log(`   Status da resposta: ${response.status}`);
      console.log(`   Headers recebidos: ${Object.keys(response.headers).length}`);

      if (response.data && response.data.resultadoPaginado) {
        // Converter os arrays de dados em objetos estruturados
        const clientes: ClienteRow[] = response.data.resultadoPaginado.elementos.map((row) => {
          return {
            id: row[0],
            nome: row[1],
            dataNascimento: row[2],
            cpf: row[3],
            telefone: row[4],
            email: row[5],
            genero: row[6],
            dataCadastro: row[7],
            dataUltimaCompra: row[8],
            qtdCompras: row[9],
            valorTotalCompras: row[10],
            qtdCompras90: row[11],
            valorTotalCompras90: row[12],
            qtdCompras30: row[13],
            valorTotalCompras30: row[14],
            qtdCompras7: row[15],
            valorTotalCompras7: row[16],
            lavanderia: row[17],
            acoes: row[18],
          };
        });

        console.log(`✅ ${clientes.length} clientes encontrados (total: ${response.data.resultadoPaginado.total})`);

        return {
          success: true,
          clientes,
          total: response.data.resultadoPaginado.total,
        };
      }

      throw new Error('Resposta da API não contém dados válidos');
    } catch (error: any) {
      console.error('❌ Erro ao buscar clientes:', error.message);

      if (error.response) {
        console.error('   Status:', error.response.status);
        console.error('   Dados:', JSON.stringify(error.response.data, null, 2));
      }

      return {
        success: false,
        error: error.message,
      };
    }
  }
}

// ============================================================================
// EXECUÇÃO DO SCRIPT
// ============================================================================

async function main() {
  // Credenciais de teste (substitua pelas suas)
  const credentials: LoginCredentials = {
    email: 'barbaracandidarodrigues@gmail.com',
    senha: '#K180387plg',
  };

  const tester = new VMHubLoginTester();

  try {
    console.log('='.repeat(60));
    console.log('🧪 TESTE DE LOGIN VMHUB');
    console.log('='.repeat(60));
    console.log('');

    const result = await tester.testLogin(credentials, {
      headless: false, // Mostra o navegador
      manualCaptcha: true, // Aguarda resolução manual
      captchaTimeout: 300000, // 5 minutos
    });

    console.log('');
    console.log('='.repeat(60));
    console.log('📊 RESULTADO DO TESTE');
    console.log('='.repeat(60));

    if (result.success) {
      console.log('✅ SUCESSO!');
      console.log('');
      console.log('Token JWT obtido:');
      console.log(result.token);
      console.log('');
      console.log('Token decodificado (primeira parte):');
      try {
        const payload = JSON.parse(
          Buffer.from(result.token.split('.')[1], 'base64').toString()
        );
        console.log(JSON.stringify(payload, null, 2));
        console.log('');
        console.log('📋 Informações do Token:');
        console.log(`   Subject: ${payload.sub || 'N/A'}`);
        console.log(`   Email: ${payload.email || 'N/A'}`);
        console.log(`   ClientId: ${payload.clientId || 'N/A'}`);
        console.log(`   Auth: ${payload.auth || 'N/A'}`);
        console.log(`   Expira em: ${new Date(payload.exp * 1000).toLocaleString()}`);
      } catch (e) {
        console.log('(Não foi possível decodificar)');
      }

      // Obter token específico da aplicação vmlav
      console.log('');
      console.log('🔄 Obtendo token específico da aplicação vmlav...');
      const tokenAplicacao = await tester.obterTokenAplicacao(result.token);
      
      let tokenFinal = result.token;
      if (tokenAplicacao) {
        console.log('✅ Token da aplicação obtido com sucesso!');
        tokenFinal = tokenAplicacao;
      } else {
        console.log('⚠️  Não foi possível obter token da aplicação, tentando login direto...');
        const loginVmlavResult = await tester.fazerLoginVmlav(credentials);
        if (loginVmlavResult.success) {
          console.log('✅ Login na aplicação vmlav bem-sucedido!');
          tokenFinal = loginVmlavResult.token;
        } else {
          console.log('⚠️  Usando token de login original (pode não funcionar para buscar clientes)');
        }
      }

      // Explorar endpoints primeiro
      console.log('');
      console.log('🔍 Iniciando exploração de endpoints...');
      await tester.explorarEndpoints(tokenFinal, 'api_exploration.log');

      // Buscar clientes após login bem-sucedido
      console.log('');
      console.log('='.repeat(60));
      console.log('📋 BUSCANDO CLIENTES');
      console.log('='.repeat(60));
      console.log('');

      try {
        const clientesResult = await tester.buscarClientes(tokenFinal, {
        nome: null,
        cpf: null,
        dataNascimento: null,
        email: null,
        telefone: null,
        empresas: null,
        periodoUltimaCompra: {
          dataInicio: null,
          dataTermino: null,
        },
        periodoDataCadastro: {
          dataInicio: null,
          dataTermino: null,
        },
        periodoParametrizadoUltimaCompra: null,
        periodoParametrizadoDataCadastro: null,
        agrupadores: null,
        mesAniversario: null,
      }, {
        pagina: 0,
        quantidade: 10000,
        campoOrdenacao: 'cliente.nome',
        direcaoOrdenacao: 'ASC',
        execCount: true,
        empresa: 'lavateriajdnovomundo',
      });

      if (clientesResult.success && clientesResult.clientes) {
        console.log('');
        console.log('='.repeat(60));
        console.log('📊 RESULTADO DA BUSCA DE CLIENTES');
        console.log('='.repeat(60));
        console.log(`Total de clientes: ${clientesResult.total}`);
        console.log(`Clientes retornados: ${clientesResult.clientes.length}`);
        console.log('');
        console.log('Primeiros 5 clientes:');
        console.log('');

        clientesResult.clientes.slice(0, 5).forEach((cliente, index) => {
          console.log(`${index + 1}. ${cliente.nome}`);
          console.log(`   CPF: ${cliente.cpf}`);
          console.log(`   Telefone: ${cliente.telefone}`);
          console.log(`   Email: ${cliente.email || '(não informado)'}`);
          console.log(`   Última Compra: ${cliente.dataUltimaCompra}`);
          console.log(`   Total de Compras: ${cliente.qtdCompras} (${cliente.valorTotalCompras})`);
          console.log('');
        });

        // Salvar todos os clientes em um arquivo JSON (opcional)
        const outputPath = path.join(__dirname, 'clientes_export.json');
        fs.writeFileSync(
          outputPath,
          JSON.stringify({
            total: clientesResult.total,
            clientes: clientesResult.clientes,
            exportadoEm: new Date().toISOString(),
          }, null, 2),
          'utf-8'
        );
        console.log(`💾 Dados salvos em: ${outputPath}`);
      } else {
        console.log('❌ Erro ao buscar clientes:', clientesResult.error);
      }
      } catch (clientesError: any) {
        console.error('❌ Erro ao processar busca de clientes:', clientesError.message);
        console.error('   Stack:', clientesError.stack);
      }
    } else {
      console.log('❌ FALHA!');
      console.log('');
      console.log('Erro:', result.error);
    }

    // Manter navegador aberto para inspeção
    await tester.keepBrowserOpen();

    // Aguardar entrada do usuário antes de fechar
    process.on('SIGINT', async () => {
      console.log('\n\n🛑 Encerrando...');
      await tester.closeBrowser();
      process.exit(0);
    });

    // Manter o processo vivo
    await new Promise(() => {});
  } catch (error: any) {
    console.error('❌ Erro fatal:', error.message);
    await tester.closeBrowser();
    process.exit(1);
  }
}

// Executar apenas se for chamado diretamente
if (require.main === module) {
  main().catch(console.error);
}

export {
  VMHubLoginTester,
  LoginCredentials,
  LoginResponse,
  ClienteFiltro,
  ClienteRow,
  ClienteDados,
  ClientesResponse,
  BuscarClientesResponse,
};

