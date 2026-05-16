import axios from 'axios';
import logger from '../utils/logger';
import pool from '../config/database';
import { VmLavCredentialsModel, VmLavCredentials } from '../models/vmLavCredentials.model';
import { VmLavClienteModel, VmLavCliente } from '../models/vmLavCliente.model';
import { VmLavPedidoModel, VmLavPedido } from '../models/vmLavPedido.model';
import { VmLavSincronizacaoLogModel } from '../models/vmLavSincronizacaoLog.model';
import puppeteer, { Browser, Page } from 'puppeteer';


interface LoginResponse {
  token: string;
  success: boolean;
  error?: string;
  localStorage?: any;
  cookies?: any[];
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
  acoes: any;
}

interface BuscarClientesResponse {
  success: boolean;
  clientes?: ClienteRow[];
  total?: number;
  error?: string;
}

export class VmLavService {
  private credentialsModel: VmLavCredentialsModel;
  private clienteModel: VmLavClienteModel;
  private pedidoModel: VmLavPedidoModel;
  private logModel: VmLavSincronizacaoLogModel;
  private readonly loginUrl = 'https://conta.vmhub.vmtecnologia.io/conta/login';
  private readonly apiUrl = 'https://apps.vmhub.vmtecnologia.io/conta/api/v1/contas-usuarios/login';
  private readonly tokenAplicacaoUrl = 'https://apps.vmhub.vmtecnologia.io/conta/api/v1/contas-usuarios/login/aplicacao';
  private readonly clientesApiUrl = 'https://apps.vmhub.vmtecnologia.io/vmlav/api/v1/relatorios/clientes';
  private readonly pedidosApiUrl = 'https://apps.vmhub.vmtecnologia.io/vmlav/api/v1/relatorios/pedidos';
  private browser: Browser | null = null;
  private page: Page | null = null;

  constructor() {
    this.credentialsModel = new VmLavCredentialsModel();
    this.clienteModel = new VmLavClienteModel();
    this.pedidoModel = new VmLavPedidoModel();
    this.logModel = new VmLavSincronizacaoLogModel();
  }

  /**
   * Configura credenciais do VM Lav (faz login inicial com Puppeteer)
   */
  async configurarCredenciais(
    userId: number,
    email: string,
    senha: string,
    onCaptchaReady?: () => void
  ): Promise<{ success: boolean; message: string; credentialsId?: number }> {
    // Garantir que sempre retornamos um objeto válido
    const safeReturn = (success: boolean, message: string, credentialsId?: number): { success: boolean; message: string; credentialsId?: number } => {
      const result: { success: boolean; message: string; credentialsId?: number } = {
        success: Boolean(success),
        message: String(message || 'Erro desconhecido'),
      };
      
      if (credentialsId !== undefined && credentialsId !== null) {
        result.credentialsId = Number(credentialsId);
      }
      
      return result;
    };

    try {
      logger.info('Configurando credenciais VM Lav para usuário ' + String(userId));

      // PRIMEIRO: Salvar credenciais no banco (mesmo sem tokens ainda)
      // Isso permite que o usuário tente novamente se o login falhar
      let credentials = await this.credentialsModel.findByUserId(userId);
      
      // Se senha está vazia e há credenciais existentes, usar a senha atual do banco
      let senhaParaUsar = senha;
      if ((!senha || senha.trim() === '') && credentials) {
        // Usar senha atual do banco
        senhaParaUsar = credentials.senha;
        logger.info('Usando senha atual do banco (senha não foi fornecida)');
      }
      
      if (credentials) {
        // Atualizar credenciais existentes
        logger.info('Atualizando credenciais existentes (ID: ' + String(credentials.id) + ')');
        
        const updateData: any = {
          email,
          status: 'inativo', // Será atualizado para 'ativo' se login for bem-sucedido
          ultimo_erro: null,
        };
        
        // Atualizar senha se foi fornecida, senão manter a atual
        if (senha && senha.trim() !== '') {
          updateData.senha = senha;
        }
        
        credentials = await this.credentialsModel.update(credentials.id, updateData);
      } else {
        // Criar novas credenciais (senha é obrigatória)
        if (!senha || senha.trim() === '') {
          throw new Error('Senha é obrigatória para criar novas credenciais');
        }
        
        logger.info('Criando novas credenciais');
        credentials = await this.credentialsModel.create({
          user_id: userId,
          email,
          senha: senha,
          token_inicial: null,
          token_aplicacao: null,
          dados_localstorage: null,
          cookies: null,
          token_expira_em: null,
          ultima_sincronizacao: null,
          ultimo_erro: null,
          status: 'inativo',
          ativo: true,
          intervalo_sincronizacao_minutos: 10, // Padrão: 10 minutos
        });
      }

      if (!credentials) {
        throw new Error('Erro ao salvar credenciais no banco de dados');
      }

      logger.info('Credenciais salvas no banco (ID: ' + String(credentials.id) + ')');

      // SEGUNDO: Tentar fazer login com Puppeteer ou restaurar sessão
      let loginResult: LoginResponse | null = null;
      
      // Se senha está vazia e há credenciais com dados salvos, tentar restaurar sessão
      if ((!senha || senha.trim() === '') && credentials && credentials.dados_localstorage && credentials.cookies) {
        try {
          logger.info('Tentando restaurar sessão usando dados salvos (senha não fornecida)');
          const tokenRenovado = await this.restaurarSessao(credentials);
          if (tokenRenovado) {
            logger.info('Sessão restaurada com sucesso sem precisar de senha');
            return safeReturn(true, 'Credenciais atualizadas e sessão restaurada', credentials.id);
          } else {
            logger.warn('Não foi possível restaurar sessão, será necessário fazer login com senha');
            throw new Error('Não foi possível restaurar sessão. Por favor, forneça a senha para fazer login.');
          }
        } catch (error: any) {
          logger.warn('Erro ao restaurar sessão: ' + String(error?.message || error));
          // Continuar para tentar fazer login com senha se possível
        }
      }
      
      // Usar senha do banco se não foi fornecida
      const senhaParaLogin = senhaParaUsar || credentials.senha;
      
      if (!senhaParaLogin || senhaParaLogin.trim() === '') {
        throw new Error('Senha é necessária para fazer login. Por favor, forneça a senha.');
      }
      
      try {
        loginResult = await this.fazerLoginComPuppeteer(email, senhaParaLogin, onCaptchaReady);
      } catch (error: any) {
        const errorMsg = error?.message || 'Erro ao fazer login';
        logger.error('Exceção ao fazer login com Puppeteer: ' + errorMsg);
        // Atualizar status de erro, mas manter credenciais salvas
        await this.credentialsModel.update(credentials.id, {
          status: 'erro',
          ultimo_erro: errorMsg,
        });
        
        return safeReturn(false, 'Erro ao fazer login: ' + errorMsg + '. Credenciais foram salvas, mas é necessário fazer login novamente.', credentials.id);
      }

      if (!loginResult || !loginResult.success || !loginResult.token) {
        // Atualizar status de erro, mas manter credenciais salvas
        await this.credentialsModel.update(credentials.id, {
          status: 'erro',
          ultimo_erro: loginResult?.error || 'Erro ao fazer login',
        });
        
        return safeReturn(false, loginResult?.error || 'Erro ao fazer login. Credenciais foram salvas, mas é necessário fazer login novamente.', credentials.id);
      }

      // Verificar se o token já tem clientId: vmlav
      let tokenAplicacao: string | null = null;
      let tokenInicial: string = loginResult.token;
      
      try {
        const payload = JSON.parse(
          Buffer.from(loginResult.token.split('.')[1], 'base64').toString()
        );
        
        if (payload.clientId === 'vmlav') {
          logger.info('Token já tem clientId: vmlav, usando diretamente como token_aplicacao');
          tokenAplicacao = loginResult.token;
          // Não precisamos de token_inicial separado neste caso
          tokenInicial = loginResult.token;
        } else {
          logger.info('Token não tem clientId: vmlav, tentando obter token da aplicação...');
          // Obter token da aplicação apenas se não tiver clientId
          tokenAplicacao = await this.obterTokenAplicacao(loginResult.token);
        }
      } catch (e) {
        logger.warn('Erro ao decodificar token, tentando obter token da aplicação: ' + String((e as any)?.message || 'Erro desconhecido'));
        // Se não conseguir decodificar, tentar obter token da aplicação
        tokenAplicacao = await this.obterTokenAplicacao(loginResult.token);
      }

      if (!tokenAplicacao) {
        // Atualizar status de erro, mas manter credenciais salvas
        await this.credentialsModel.update(credentials.id, {
          status: 'erro',
          ultimo_erro: 'Erro ao obter token da aplicação',
        });
        
        return safeReturn(false, 'Erro ao obter token da aplicação. Credenciais foram salvas, mas é necessário fazer login novamente.', credentials.id);
      }

      // Decodificar token para obter expiração
      let tokenExpiraEm: Date | null = null;
      try {
        const payload = JSON.parse(
          Buffer.from(tokenAplicacao.split('.')[1], 'base64').toString()
        );
        if (payload.exp) {
          tokenExpiraEm = new Date(payload.exp * 1000);
        }
      } catch (e) {
        logger.warn('Não foi possível decodificar token para obter expiração');
      }

      // Atualizar credenciais com tokens, localStorage e cookies
      credentials = await this.credentialsModel.update(credentials.id, {
        token_inicial: tokenInicial,
        token_aplicacao: tokenAplicacao,
        token_expira_em: tokenExpiraEm,
        dados_localstorage: loginResult.localStorage || null,
        cookies: loginResult.cookies || null,
        status: 'ativo',
        ultimo_erro: null,
      });

      if (!credentials) {
        throw new Error('Erro ao atualizar credenciais com tokens');
      }

      logger.info('Credenciais VM Lav configuradas com sucesso (ID: ' + String(credentials.id) + ')');

      return safeReturn(true, 'Credenciais configuradas com sucesso', credentials.id);
    } catch (error: any) {
      let errorMessage = 'Erro ao configurar credenciais';
      try {
        if (error && typeof error === 'object') {
          if (error.message && typeof error.message === 'string') {
            errorMessage = error.message;
          } else if (typeof error.toString === 'function') {
            errorMessage = error.toString();
          }
        } else if (error) {
          errorMessage = String(error);
        }
      } catch (e) {
        errorMessage = 'Erro ao configurar credenciais';
      }
      
      const errorStack = error?.stack || 'N/A';
      logger.error('Erro ao configurar credenciais VM Lav: ' + String(errorMessage));
      logger.error('Stack: ' + String(errorStack));
      
      return safeReturn(false, errorMessage);
    }
  }

  /**
   * Faz login usando Puppeteer (requer resolução manual de CAPTCHA)
   * Segue a mesma lógica do arquivo test-vmhub-login.ts
   */
  private async fazerLoginComPuppeteer(
    email: string,
    senha: string,
    onCaptchaReady?: () => void
  ): Promise<LoginResponse> {
    try {
      // 1. Inicializar navegador
      logger.info('Inicializando navegador...');
      this.browser = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      this.page = await this.browser.newPage();
      await this.page.goto(this.loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });

      // 2. Preencher formulário (sem clicar no botão ainda)
      logger.info('Preenchendo formulário...');
      await this.preencherFormularioLogin(email, senha);

      // 3. Iniciar monitoramento de rede ANTES de resolver CAPTCHA
      logger.info('Iniciando monitoramento de requisições de rede...');
      this.iniciarMonitoramentoRede(this.page);

      // 4. Notificar que CAPTCHA está pronto
      if (onCaptchaReady) {
        onCaptchaReady();
      }

      // 5. Aguardar resolução do CAPTCHA (máximo 5 minutos)
      logger.info('Aguardando resolução do CAPTCHA...');
      const captchaToken = await this.aguardarCaptcha(300000);

      if (!captchaToken) {
        throw new Error('CAPTCHA não foi resolvido a tempo');
      }

      logger.info('Token do reCAPTCHA obtido (' + String(captchaToken.length) + ' caracteres)');

      // 6. Clicar no botão entrar
      logger.info('Clicando no botão entrar...');
      await this.clicarBotaoEntrar();

      // 7. Aguardar requisições de rede após clique
      logger.info('Aguardando requisições de rede após clique...');
      await new Promise(resolve => setTimeout(resolve, 20000));

      // 8. Aguardar um pouco mais para garantir que tudo foi salvo
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 9. Obter TODOS os dados do localStorage
      logger.info('Capturando todos os dados do localStorage...');
      const todosDadosLocalStorage = await this.page.evaluate(() => {
        // @ts-ignore - window existe no contexto do navegador
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

      // 10. Obter TODOS os cookies
      logger.info('Capturando todos os cookies...');
      const todosCookies = await this.page.cookies();

      // 11. Tentar obter token do localStorage
      logger.info('Verificando token no localStorage...');
      let tokenFromStorage: string | null = todosDadosLocalStorage.token || null;

      // 12. Se encontrou token no localStorage, verificar se tem clientId
      if (tokenFromStorage) {
        try {
          const payload = JSON.parse(
            Buffer.from(tokenFromStorage.split('.')[1], 'base64').toString()
          );
          if (payload.clientId === 'vmlav') {
            logger.info('Token tem clientId: vmlav - PERFEITO!');
            return {
              token: tokenFromStorage,
              success: true,
              localStorage: todosDadosLocalStorage,
              cookies: todosCookies,
            };
          } else {
            logger.info('Token não tem clientId: vmlav (tem: ' + String(payload.clientId || 'nenhum') + ')');
            // Usar mesmo assim, vamos obter token da aplicação depois
            return {
              token: tokenFromStorage,
              success: true,
              localStorage: todosDadosLocalStorage,
              cookies: todosCookies,
            };
          }
        } catch (e) {
          // Usar mesmo assim se não conseguir decodificar
          return {
            token: tokenFromStorage,
            success: true,
            localStorage: todosDadosLocalStorage,
            cookies: todosCookies,
          };
        }
      }

      // 13. Fallback: fazer requisição manual
      logger.info('Token não encontrado no localStorage, fazendo requisição manual...');
      const loginResult = await this.makeLoginRequest(email, senha, captchaToken);
      
      // Se o login manual foi bem-sucedido, tentar obter localStorage e cookies novamente
      if (loginResult.success && this.page) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        const localStorageManual = await this.page.evaluate(() => {
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
        const cookiesManual = await this.page.cookies();
        
        return {
          ...loginResult,
          localStorage: localStorageManual,
          cookies: cookiesManual,
        };
      }
      
      return loginResult;
    } catch (error: any) {
      const errorMsg = error?.message || 'Erro desconhecido';
      const errorStack = error?.stack || 'N/A';
      logger.error('Erro ao fazer login com Puppeteer: ' + errorMsg);
      logger.error('Stack: ' + errorStack);
      return {
        token: '',
        success: false,
        error: errorMsg,
      };
    } finally {
      // Não fechar o navegador aqui - deixar o usuário fechar manualmente
    }
  }

  /**
   * Preenche o formulário de login
   */
  private async preencherFormularioLogin(email: string, senha: string): Promise<void> {
    if (!this.page) {
      throw new Error('Página não inicializada');
    }

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
          await element.type(email, { delay: 50 });
          emailFilled = true;
          logger.debug(`Email preenchido usando seletor: ${selector}`);
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
          await element.type(senha, { delay: 50 });
          passwordFilled = true;
          logger.debug(`Senha preenchida usando seletor: ${selector}`);
          break;
        }
      } catch (error) {
        // Continua tentando outros seletores
      }
    }

    if (!passwordFilled) {
      throw new Error('Não foi possível encontrar o campo de senha');
    }

    logger.info('Formulário preenchido com sucesso');
  }

  /**
   * Inicia monitoramento de requisições de rede
   */
  private iniciarMonitoramentoRede(page: Page): void {
    // Interceptar requisições e respostas para debug
    page.on('request', (request) => {
      logger.debug(`[Network] ${request.method()} ${request.url()}`);
    });

    page.on('response', async (response) => {
      logger.debug(`[Network] ${response.status()} ${response.url()}`);
    });
  }

  /**
   * Clica no botão entrar
   */
  private async clicarBotaoEntrar(): Promise<void> {
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
          logger.info(`Botão clicado usando seletor: ${selector}`);
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
          // @ts-ignore - document existe no contexto do navegador
          const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], a'));
          const entrarBtn = buttons.find((btn: any) => {
            const text = btn.textContent?.toLowerCase() || btn.value?.toLowerCase() || '';
            return text.includes('entrar') || text.includes('login') || text.includes('acessar');
          });
          if (entrarBtn) {
            // @ts-ignore
            entrarBtn.click();
          }
        });
        buttonClicked = true;
        logger.info('Botão clicado usando busca por texto');
      } catch (error) {
        logger.warn('Não foi possível encontrar o botão automaticamente');
        logger.warn('Por favor, clique manualmente no botão entrar');
      }
    }
  }

  /**
   * Faz requisição de login para a API
   */
  private async makeLoginRequest(
    email: string,
    senha: string,
    recaptchaToken: string
  ): Promise<LoginResponse> {
    try {
      const response = await axios.post(
        this.apiUrl,
        {
          email,
          senha,
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
        return {
          token: response.data,
          success: true,
        };
      }

      throw new Error('Resposta da API não contém token válido');
    } catch (error: any) {
      const errorMsg = error?.message || 'Erro desconhecido';
      logger.error('Erro na requisição de login: ' + errorMsg);
      if (error?.response) {
        logger.error('Status: ' + String(error.response.status || 'N/A'));
        try {
          logger.error('Dados: ' + JSON.stringify(error.response.data || {}));
        } catch (e) {
          logger.error('Dados: (não foi possível serializar)');
        }
      }
      return {
        token: '',
        success: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Aguarda resolução do CAPTCHA
   */
  private async aguardarCaptcha(timeout: number = 300000): Promise<string | null> {
    if (!this.page) return null;

    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      try {
        const token = await this.page.evaluate(() => {
          // @ts-ignore - document existe no contexto do navegador
          const textarea = document.querySelector('textarea[name="g-recaptcha-response"]');
          return textarea?.value || null;
        });

        if (token && token.length > 100) {
          return token;
        }
      } catch (e) {
        // Continuar tentando
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    return null;
  }

  /**
   * Obtém token específico da aplicação vmlav
   */
  async obterTokenAplicacao(tokenLogin: string): Promise<string | null> {
    try {
      const response = await axios.get(this.tokenAplicacaoUrl, {
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
      });

      // Tentar extrair token da resposta
      let tokenAplicacao: string | null = null;

      if (typeof response.data === 'string' && response.data.includes('<input')) {
        const tokenMatch = response.data.match(/id="access_token"[^>]*value="([^"]+)"/);
        if (tokenMatch && tokenMatch[1]) {
          tokenAplicacao = tokenMatch[1];
        }
      } else if (typeof response.data === 'object') {
        if (response.data.token) {
          tokenAplicacao = response.data.token;
        } else if (response.data.access_token) {
          tokenAplicacao = response.data.access_token;
        }
      } else if (typeof response.data === 'string' && response.data.includes('eyJ')) {
        tokenAplicacao = response.data.trim();
      }

      return tokenAplicacao;
    } catch (error: any) {
      const errorMsg = error?.message || 'Erro desconhecido';
      logger.error('Erro ao obter token da aplicação: ' + String(errorMsg));
      return null;
    }
  }

  /**
   * Verifica se o token está válido (não expirado)
   */
  private isTokenValido(token: string): boolean {
    try {
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64').toString()
      );
      
      if (payload.exp) {
        const expiraEm = new Date(payload.exp * 1000);
        const agora = new Date();
        // Considerar válido se expira em mais de 5 minutos
        return expiraEm.getTime() > agora.getTime() + 5 * 60 * 1000;
      }
      
      return true; // Se não tem exp, assumir válido
    } catch (e) {
      return false;
    }
  }

  /**
   * Obtém ou renova token válido
   * Agora usa o VmLavConnectionManager para renovação automática
   */
  async obterTokenValido(userId: number): Promise<string | null> {
    try {
      // Tentar obter token do ConnectionManager primeiro (com cache e renovação automática)
      try {
        const { getVmLavConnectionManager } = await import('./vmLavConnectionManager.service');
        const connectionManager = getVmLavConnectionManager();
        const token = await connectionManager.obterTokenValido(userId);
        if (token) {
          return token;
        }
      } catch (error: any) {
        logger.debug(`ConnectionManager não disponível, usando método tradicional: ${error.message}`);
      }

      // Fallback para método tradicional
      const credentials = await this.credentialsModel.findByUserId(userId);

      if (!credentials) {
        logger.warn(`Nenhuma credencial VM Lav encontrada para usuário ${userId}`);
        return null;
      }

      // Verificar se token da aplicação está válido
      if (credentials.token_aplicacao && this.isTokenValido(credentials.token_aplicacao)) {
        return credentials.token_aplicacao;
      }

      // Token expirado, tentar renovar usando token inicial
      if (credentials.token_inicial && this.isTokenValido(credentials.token_inicial)) {
        logger.info(`Renovando token da aplicação para usuário ${userId}`);
        const novoTokenAplicacao = await this.obterTokenAplicacao(credentials.token_inicial);

        if (novoTokenAplicacao) {
          // Atualizar token no banco
          await this.credentialsModel.update(credentials.id, {
            token_aplicacao: novoTokenAplicacao,
            token_expira_em: this.getTokenExpiration(novoTokenAplicacao),
          });

          return novoTokenAplicacao;
        }
      }

      // Se chegou aqui, tentar restaurar sessão usando localStorage e cookies salvos
      logger.info(`Token expirado para usuário ${userId}. Tentando restaurar sessão...`);
      const tokenRestaurado = await this.restaurarSessao(credentials);
      
      if (tokenRestaurado) {
        logger.info(`Sessão restaurada com sucesso para usuário ${userId}`);
        return tokenRestaurado;
      }

      // Se restaurar sessão falhou, tentar reconexão automática usando senha salva
      logger.info(`Restauração de sessão falhou. Tentando reconexão automática para usuário ${userId}...`);
      const tokenReconectado = await this.reconectarAutomaticamente(credentials);
      
      if (tokenReconectado) {
        logger.info(`Reconexão automática bem-sucedida para usuário ${userId}`);
        return tokenReconectado;
      }

      // Se chegou aqui, precisa fazer login manual
      logger.warn(`Não foi possível restaurar sessão ou reconectar automaticamente para usuário ${userId}. É necessário reconfigurar credenciais.`);
      await this.credentialsModel.update(credentials.id, {
        status: 'erro',
        ultimo_erro: 'Token expirado e falha na restauração/reconexão automática. É necessário reconfigurar credenciais.',
      });

      return null;
    } catch (error: any) {
      logger.error(`Erro ao obter token válido: ${error.message}`);
      return null;
    }
  }

  /**
   * Restaura sessão usando localStorage e cookies salvos
   */
  private async restaurarSessao(credentials: VmLavCredentials): Promise<string | null> {
    try {
      if (!credentials.dados_localstorage || !credentials.cookies || !Array.isArray(credentials.cookies)) {
        logger.info('Não há dados de sessão salvos para restaurar');
        return null;
      }

      logger.info('Tentando restaurar sessão usando dados salvos...');

      // Inicializar navegador
      this.browser = await puppeteer.launch({
        headless: true, // Headless para reconexão automática
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      this.page = await this.browser.newPage();

      // Navegar para a aplicação
      await this.page.goto('https://vmlav.vmhub.vmtecnologia.io', { waitUntil: 'networkidle2', timeout: 30000 });

      // Restaurar cookies
      logger.info('Restaurando cookies...');
      await this.page.setCookie(...credentials.cookies);

      // Restaurar localStorage
      logger.info('Restaurando localStorage...');
      await this.page.evaluate((localStorageData) => {
        // @ts-ignore
        for (const key in localStorageData) {
          // @ts-ignore
          window.localStorage.setItem(key, localStorageData[key]);
        }
      }, credentials.dados_localstorage);

      // Recarregar página para aplicar localStorage
      await this.page.reload({ waitUntil: 'networkidle2', timeout: 30000 });

      // Aguardar um pouco para o token ser processado
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Tentar obter token do localStorage
      const tokenRestaurado = await this.page.evaluate(() => {
        // @ts-ignore
        return window.localStorage.getItem('token');
      });

      if (tokenRestaurado && this.isTokenValido(tokenRestaurado)) {
        // Verificar se tem clientId
        try {
          const payload = JSON.parse(
            Buffer.from(tokenRestaurado.split('.')[1], 'base64').toString()
          );
          
          let tokenAplicacao = tokenRestaurado;
          if (payload.clientId !== 'vmlav') {
            // Tentar obter token da aplicação
            tokenAplicacao = await this.obterTokenAplicacao(tokenRestaurado) || tokenRestaurado;
          }

          // Capturar localStorage e cookies atualizados
          const localStorageAtualizado = await this.page.evaluate(() => {
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
          const cookiesAtualizados = await this.page.cookies();

          // Atualizar credenciais com novos dados
          await this.credentialsModel.update(credentials.id, {
            token_aplicacao: tokenAplicacao,
            token_expira_em: this.getTokenExpiration(tokenAplicacao),
            dados_localstorage: localStorageAtualizado,
            cookies: cookiesAtualizados,
            status: 'ativo',
            ultimo_erro: null,
          });

          // Fechar navegador
          if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
          }

          return tokenAplicacao;
        } catch (e) {
          logger.warn('Erro ao processar token restaurado: ' + String((e as any)?.message || 'Erro desconhecido'));
        }
      }

      // Fechar navegador se não conseguiu restaurar
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
        this.page = null;
      }

      return null;
    } catch (error: any) {
      logger.error(`Erro ao restaurar sessão: ${error.message}`);
      
      // Fechar navegador em caso de erro
      if (this.browser) {
        try {
          await this.browser.close();
        } catch (e) {
          // Ignorar erro ao fechar
        }
        this.browser = null;
        this.page = null;
      }
      
      return null;
    }
  }

  /**
   * Reconecta automaticamente usando senha salva (sem CAPTCHA - apenas para reconexão automática)
   */
  private async reconectarAutomaticamente(_credentials: VmLavCredentials): Promise<string | null> {
    try {
      // Não podemos fazer login automático com CAPTCHA, então retornamos null
      // O usuário precisará reconfigurar as credenciais manualmente
      logger.warn('Reconexão automática não é possível devido ao CAPTCHA. É necessário reconfigurar credenciais manualmente.');
      return null;
    } catch (error: any) {
      logger.error(`Erro ao reconectar automaticamente: ${error.message}`);
      return null;
    }
  }

  /**
   * Obtém data de expiração do token
   */
  private getTokenExpiration(token: string): Date | null {
    try {
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64').toString()
      );
      if (payload.exp) {
        return new Date(payload.exp * 1000);
      }
    } catch (e) {
      // Ignorar
    }
    return null;
  }

  /**
   * Busca clientes da API
   */
  /**
   * Busca uma página de clientes da API
   */
  private async buscarClientesPagina(
    token: string,
    empresa: string,
    pagina: number,
    quantidade: number
  ): Promise<{ success: boolean; clientes?: ClienteRow[]; total?: number; error?: string }> {
    try {
      const queryParams = new URLSearchParams({
        execCount: 'true',
        pagina: String(pagina),
        quantidade: String(quantidade),
        direcaoOrdenacao: 'ASC',
        campoOrdenacao: 'cliente.nome',
      });

      const url = `${this.clientesApiUrl}?${queryParams.toString()}`;

      const body: ClienteFiltro = {
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
      };

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
          'X-Vm-Emp': empresa,
        },
        timeout: 60000,
      });

      if (response.data && response.data.resultadoPaginado) {
        const clientes: ClienteRow[] = response.data.resultadoPaginado.elementos.map((row: any[]) => ({
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
        }));

        return {
          success: true,
          clientes,
          total: response.data.resultadoPaginado.total,
        };
      }

      throw new Error('Resposta da API não contém dados válidos');
    } catch (error: any) {
      logger.error(`Erro ao buscar clientes (página ${pagina}): ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Busca TODOS os clientes da API (com paginação automática)
   */
  async buscarClientes(
    token: string,
    empresa: string = 'lavateriajdnovomundo'
  ): Promise<BuscarClientesResponse> {
    try {
      let todosClientes: ClienteRow[] = [];
      let pagina = 0;
      const quantidadePorPagina = 1000;
      let totalClientes = 0;

      logger.info('Buscando clientes com paginação automática...');

      do {
        const resultado = await this.buscarClientesPagina(token, empresa, pagina, quantidadePorPagina);

        if (!resultado.success || !resultado.clientes) {
          if (pagina === 0) {
            return {
              success: false,
              error: resultado.error || 'Erro ao buscar clientes',
            };
          }
          break; // Se falhar em páginas subsequentes, usar o que já foi obtido
        }

        todosClientes = todosClientes.concat(resultado.clientes);
        totalClientes = resultado.total || 0;

        logger.info(`Página ${pagina + 1}: ${resultado.clientes.length} clientes obtidos (Total acumulado: ${todosClientes.length}/${totalClientes})`);

        // Se retornou menos que a quantidade solicitada, não há mais páginas
        if (resultado.clientes.length < quantidadePorPagina) {
          break;
        }

        pagina++;
      } while (todosClientes.length < totalClientes && pagina < 1000); // Limitar a 1000 páginas para evitar loops infinitos

      logger.info(`Busca de clientes concluída: ${todosClientes.length} clientes obtidos de ${totalClientes} totais`);

      return {
        success: true,
        clientes: todosClientes,
        total: totalClientes,
      };
    } catch (error: any) {
      logger.error(`Erro ao buscar clientes: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Sincroniza clientes (busca da API e salva no banco)
   */
  async sincronizarClientes(userId: number): Promise<{ success: boolean; message: string; total?: number }> {
    const inicio = Date.now();
    let registrosNovos = 0;
    let registrosAlterados = 0;
    let registrosTotal = 0;
    
    try {
      logger.info(`Iniciando sincronização de clientes para usuário ${userId}`);

      // Contar registros existentes antes
      const clientesExistentes = await this.clienteModel.findByUserId(userId, 1, 100000);
      const totalAntes = clientesExistentes.clientes.length;

      // Obter token válido
      const token = await this.obterTokenValido(userId);

      if (!token) {
        const duracao = Math.round((Date.now() - inicio) / 1000);
        await this.logModel.create({
          user_id: userId,
          tipo: 'clientes',
          data_execucao: new Date(),
          registros_novos: 0,
          registros_alterados: 0,
          registros_total: 0,
          sucesso: false,
          erro: 'Token inválido ou expirado. É necessário reconfigurar credenciais.',
          duracao_segundos: duracao,
        });
        
        return {
          success: false,
          message: 'Token inválido ou expirado. É necessário reconfigurar credenciais.',
        };
      }

      // Buscar clientes
      const resultado = await this.buscarClientes(token);

      if (!resultado.success || !resultado.clientes) {
        const duracao = Math.round((Date.now() - inicio) / 1000);
        await this.logModel.create({
          user_id: userId,
          tipo: 'clientes',
          data_execucao: new Date(),
          registros_novos: 0,
          registros_alterados: 0,
          registros_total: 0,
          sucesso: false,
          erro: resultado.error || 'Erro ao buscar clientes',
          duracao_segundos: duracao,
        });
        
        return {
          success: false,
          message: resultado.error || 'Erro ao buscar clientes',
        };
      }

      // Função helper para converter valor monetário
      const parseValor = (valorStr: string | null | undefined): number => {
        if (!valorStr) return 0;
        const str = String(valorStr).trim();
        // Remover "R$", espaços e substituir vírgula por ponto
        // Primeiro remover pontos (separadores de milhar) e depois substituir vírgula por ponto
        const cleaned = str
          .replace(/R\$\s*/g, '') // Remove "R$" e espaços após
          .replace(/\./g, '') // Remove pontos (separadores de milhar)
          .replace(',', '.') // Substitui vírgula por ponto (separador decimal)
          .trim();
        const valor = parseFloat(cleaned);
        return isNaN(valor) ? 0 : valor;
      };

      // Função helper para converter string de data para Date ou null
      const parseDate = (dateString: string | null | undefined): Date | null => {
        if (!dateString) {
          return null;
        }
        
        // Converter para string se não for
        const dateStr = String(dateString).trim();
        
        if (dateStr === '' || dateStr === 'null' || dateStr === 'undefined' || dateStr === 'NaN') {
          return null;
        }
        
        try {
          // Formato esperado: "DD/MM/YYYY HH:mm:ss" ou "DD/MM/YYYY" ou formato ISO
          let date: Date;
          if (dateStr.includes('/')) {
            // Formato brasileiro
            const parts = dateStr.split(' ');
            const datePart = parts[0].split('/');
            if (datePart.length === 3) {
              const day = parseInt(datePart[0], 10);
              const month = parseInt(datePart[1], 10) - 1; // Mês é 0-indexed
              const year = parseInt(datePart[2], 10);
              
              if (parts.length > 1 && parts[1]) {
                // Tem hora
                const timePart = parts[1].split(':');
                const hour = parseInt(timePart[0] || '0', 10);
                const minute = parseInt(timePart[1] || '0', 10);
                const second = parseInt(timePart[2] || '0', 10);
                date = new Date(year, month, day, hour, minute, second);
              } else {
                // Só data
                date = new Date(year, month, day);
              }
            } else {
              // Tentar parsear como formato padrão
              date = new Date(dateStr);
            }
          } else {
            // Formato ISO ou outro formato padrão
            date = new Date(dateStr);
          }
          
          // Verificar se a data é válida
          if (isNaN(date.getTime())) {
            logger.warn('Data inválida recebida: ' + dateStr);
            return null;
          }
          return date;
        } catch (e) {
          logger.warn('Erro ao parsear data: ' + dateStr + ' - ' + String((e as any)?.message || 'Erro desconhecido'));
          return null;
        }
      };

      // Converter para formato do banco
      const clientesParaSalvar: Omit<VmLavCliente, 'id' | 'created_at' | 'updated_at'>[] = resultado.clientes.map(cliente => ({
        user_id: userId,
        id_cliente_vm: cliente.id,
        nome: cliente.nome || null,
        data_nascimento: parseDate(cliente.dataNascimento),
        cpf: cliente.cpf || null,
        telefone: cliente.telefone || null,
        email: cliente.email || null,
        genero: cliente.genero || null,
        data_cadastro: parseDate(cliente.dataCadastro),
        data_ultima_compra: parseDate(cliente.dataUltimaCompra),
        qtd_compras: cliente.qtdCompras || 0,
        valor_total_compras: parseValor(cliente.valorTotalCompras),
        qtd_compras_90: cliente.qtdCompras90 || 0,
        valor_total_compras_90: parseValor(cliente.valorTotalCompras90),
        qtd_compras_30: cliente.qtdCompras30 || 0,
        valor_total_compras_30: parseValor(cliente.valorTotalCompras30),
        qtd_compras_7: cliente.qtdCompras7 || 0,
        valor_total_compras_7: parseValor(cliente.valorTotalCompras7),
        lavanderia: cliente.lavanderia || null,
        acoes: cliente.acoes || null,
      }));

      // Salvar no banco (upsert)
      await this.clienteModel.bulkUpsert(clientesParaSalvar);

      // Contar registros após sincronização
      const clientesDepois = await this.clienteModel.findByUserId(userId, 1, 100000);
      const totalDepois = clientesDepois.clientes.length;
      
      // Calcular novos e alterados (aproximação: novos = totalDepois - totalAntes, alterados = total - novos)
      registrosTotal = clientesParaSalvar.length;
      registrosNovos = Math.max(0, totalDepois - totalAntes);
      registrosAlterados = Math.max(0, registrosTotal - registrosNovos);

      // Atualizar última sincronização APENAS em caso de sucesso
      // Não alterar status ou ultimo_erro - isso é responsabilidade do VmLavConnectionManager
      const credentials = await this.credentialsModel.findByUserId(userId);
      if (credentials) {
        await this.credentialsModel.update(credentials.id, {
          ultima_sincronizacao: new Date(),
          // NÃO atualizar status ou ultimo_erro aqui
          // Esses campos são gerenciados apenas pelo VmLavConnectionManager
        });
      }

      const duracao = Math.round((Date.now() - inicio) / 1000);
      
      // Registrar log de sincronização
      await this.logModel.create({
        user_id: userId,
        tipo: 'clientes',
        data_execucao: new Date(),
        registros_novos: registrosNovos,
        registros_alterados: registrosAlterados,
        registros_total: registrosTotal,
        sucesso: true,
        erro: null,
        duracao_segundos: duracao,
      });

      logger.info(`Sincronização de clientes concluída: ${clientesParaSalvar.length} clientes (${registrosNovos} novos, ${registrosAlterados} alterados) em ${duracao}s`);
      
      // Log dedicado de atualização de tabela
      const { VmLavConnectionLogger } = await import('../utils/vmLavConnectionLogger');
      VmLavConnectionLogger.logTableUpdate(
        userId,
        'clientes',
        true,
        registrosNovos,
        registrosAlterados,
        registrosTotal,
        duracao
      );

      // Sincronizar pedidos também
      logger.info(`Iniciando sincronização de pedidos para usuário ${userId}`);
      // Sincronização manual de pedidos: buscar todos (apenasUltimaSemana = false)
      const pedidosResult = await this.sincronizarPedidos(userId, false);
      
      const mensagemFinal = pedidosResult.success
        ? `${clientesParaSalvar.length} clientes e ${pedidosResult.total || 0} pedidos sincronizados com sucesso`
        : `${clientesParaSalvar.length} clientes sincronizados. Erro ao sincronizar pedidos: ${pedidosResult.message}`;

      return {
        success: true,
        message: mensagemFinal,
        total: clientesParaSalvar.length,
      };
    } catch (error: any) {
      logger.error(`Erro ao sincronizar clientes: ${error.message}`);

      const duracao = Math.round((Date.now() - inicio) / 1000);
      
      // Registrar log de erro
      await this.logModel.create({
        user_id: userId,
        tipo: 'clientes',
        data_execucao: new Date(),
        registros_novos: registrosNovos,
        registros_alterados: registrosAlterados,
        registros_total: registrosTotal,
        sucesso: false,
        erro: error.message || 'Erro desconhecido',
        duracao_segundos: duracao,
      });

      // NÃO atualizar credenciais em caso de erro na sincronização
      // Erros de sincronização de dados não devem afetar o status das credenciais
      // As credenciais (token, cookies, localStorage) são gerenciadas apenas pelo VmLavConnectionManager
      logger.warn(`Erro na sincronização de clientes para user_id ${userId} - credenciais não foram alteradas`);
      
      // Log dedicado de atualização de tabela (erro)
      const { VmLavConnectionLogger } = await import('../utils/vmLavConnectionLogger');
      VmLavConnectionLogger.logTableUpdate(
        userId,
        'clientes',
        false,
        registrosNovos,
        registrosAlterados,
        registrosTotal,
        duracao,
        error.message || 'Erro desconhecido'
      );

      return {
        success: false,
        message: error.message || 'Erro ao sincronizar clientes',
      };
    }
  }

  /**
   * Busca pedidos da API
   */
  async buscarPedidos(
    token: string,
    empresa: string = 'lavateriajdnovomundo',
    pagina: number = 0,
    quantidade: number = 1000,
    dataInicio?: Date | null,
    dataTermino?: Date | null
  ): Promise<{ success: boolean; pedidos?: any[]; total?: number; error?: string }> {
    try {
      const queryParams = new URLSearchParams({
        execCount: 'true',
        pagina: String(pagina),
        quantidade: String(quantidade),
        direcaoOrdenacao: 'DESC',
        campoOrdenacao: 'vendas.data',
      });

      const url = `${this.pedidosApiUrl}?${queryParams.toString()}`;

      // Formatar datas para ISO string se fornecidas
      let dataInicioStr: string | null = null;
      let dataTerminoStr: string | null = null;
      
      if (dataInicio) {
        dataInicioStr = dataInicio.toISOString();
      }
      
      if (dataTermino) {
        // Adicionar 23:59:59.999 ao final do dia
        const dataTerminoCompleta = new Date(dataTermino);
        dataTerminoCompleta.setHours(23, 59, 59, 999);
        dataTerminoStr = dataTerminoCompleta.toISOString();
      }

      const body = {
        empresas: [],
        lavanderias: null,
        pdvs: null,
        maquinas: null,
        situacaoVenda: ['SUCESSO'],
        numeroSerieEquipamento: null,
        periodoVenda: {
          dataInicio: dataInicioStr,
          dataTermino: dataTerminoStr,
        },
        periodoParametrizado: dataInicioStr || dataTerminoStr ? null : 6, // Se tiver filtro de data, não usar periodoParametrizado
        agrupadores: [],
        tags: null,
        tipoPagamento: null,
        tipoServico: null,
        cpf: null,
        somenteVendasComClienteIdentificado: null,
        reprocessamento: null,
        ativa: null,
        listaIdVenda: [],
        repasseApp: false,
      };

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
          'X-Vm-Emp': empresa,
        },
        timeout: 120000,
      });

      if (response.data && response.data.resultadoPaginado && response.data.resultadoPaginado.elementos) {
        const pedidos = response.data.resultadoPaginado.elementos.map((row: any[]) => {
          // Mapear os dados baseado na ordem dos headers
          const lavanderia = row[0] || {};
          const equipamento = row[5] || {};
          const maquina = row[11] || {};

          return {
            lavanderia: lavanderia,
            id_empresa: row[1] || null,
            empresa_nome: row[2] || null,
            empresa_documento: row[3] || null,
            data_venda: row[4] || null,
            equipamento: equipamento,
            pdv: row[6] || null,
            situacao_venda: row[7] || null,
            tipo_pagamento: row[8] || null,
            valor: row[9] || null,
            valor_sem_desconto: row[10] || null,
            maquina: maquina,
            tipo_servico: row[12] || null,
            servico: row[13] || null,
            numero_cartao: row[14] || null,
            bandeira_cartao: row[15] || null,
            tipo_cartao: row[16] || null,
            cliente_cpf: row[17] || null,
            cliente_nome: row[18] || null,
            cliente_data_nascimento: row[19] || null,
            cliente_telefone: row[20] || null,
            cliente_email: row[21] || null,
          };
        });

        return {
          success: true,
          pedidos,
          total: response.data.resultadoPaginado.total,
        };
      }

      throw new Error('Resposta da API não contém dados válidos');
    } catch (error: any) {
      logger.error(`Erro ao buscar pedidos: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Sincroniza pedidos (busca da API e salva no banco)
   * @param userId ID do usuário
   * @param apenasUltimaSemana Se true, busca apenas pedidos da última semana (para sincronização automática)
   */
  async sincronizarPedidos(userId: number, apenasUltimaSemana: boolean = false): Promise<{ success: boolean; message: string; total?: number }> {
    const inicio = Date.now();
    let registrosNovos = 0;
    let registrosAlterados = 0;
    let registrosTotal = 0;
    
    try {
      const modo = apenasUltimaSemana ? 'automática (última semana)' : 'manual (completa)';
      logger.info(`Iniciando sincronização de pedidos para usuário ${userId} - Modo: ${modo}`);

      // Contar registros existentes antes (apenas se não for última semana, para não sobrecarregar)
      let totalAntes = 0;
      if (!apenasUltimaSemana) {
        const pedidosExistentes = await this.pedidoModel.findByUserId(userId, 1, 100000);
        totalAntes = pedidosExistentes.pedidos.length;
      }

      // Obter token válido
      const token = await this.obterTokenValido(userId);

      if (!token) {
        const duracao = Math.round((Date.now() - inicio) / 1000);
        await this.logModel.create({
          user_id: userId,
          tipo: 'pedidos',
          data_execucao: new Date(),
          registros_novos: 0,
          registros_alterados: 0,
          registros_total: 0,
          sucesso: false,
          erro: 'Token inválido ou expirado. É necessário reconfigurar credenciais.',
          duracao_segundos: duracao,
        });
        
        return {
          success: false,
          message: 'Token inválido ou expirado. É necessário reconfigurar credenciais.',
        };
      }

      // Calcular datas se for apenas última semana
      let dataInicio: Date | null = null;
      let dataTermino: Date | null = null;
      
      if (apenasUltimaSemana) {
        const hoje = new Date();
        // Data término: hoje às 23:59:59.999 (fim do dia de hoje)
        dataTermino = new Date(hoje);
        dataTermino.setHours(23, 59, 59, 999);
        
        // Data início: 7 dias atrás às 00:00:00.000 (início do dia)
        dataInicio = new Date(hoje);
        dataInicio.setDate(dataInicio.getDate() - 7);
        dataInicio.setHours(0, 0, 0, 0);
        
        logger.info(`Filtrando pedidos da última semana: ${dataInicio.toISOString()} até ${dataTermino.toISOString()}`);
      }

      // Buscar pedidos (pode precisar de múltiplas páginas)
      let todosPedidos: any[] = [];
      let pagina = 0;
      const quantidadePorPagina = 1000;
      let totalPedidos = 0;

      do {
        const resultado = await this.buscarPedidos(
          token, 
          'lavateriajdnovomundo', 
          pagina, 
          quantidadePorPagina,
          dataInicio,
          dataTermino
        );

        if (!resultado.success || !resultado.pedidos) {
          if (pagina === 0) {
            const duracao = Math.round((Date.now() - inicio) / 1000);
            await this.logModel.create({
              user_id: userId,
              tipo: 'pedidos',
              data_execucao: new Date(),
              registros_novos: 0,
              registros_alterados: 0,
              registros_total: 0,
              sucesso: false,
              erro: resultado.error || 'Erro ao buscar pedidos',
              duracao_segundos: duracao,
            });
            
            return {
              success: false,
              message: resultado.error || 'Erro ao buscar pedidos',
            };
          }
          break; // Se falhar em páginas subsequentes, usar o que já foi obtido
        }

        todosPedidos = todosPedidos.concat(resultado.pedidos);
        totalPedidos = resultado.total || 0;

        // Se retornou menos que a quantidade solicitada, não há mais páginas
        if (resultado.pedidos.length < quantidadePorPagina) {
          break;
        }

        pagina++;
      } while (todosPedidos.length < totalPedidos && pagina < 1000); // Limitar a 1000 páginas para evitar loops infinitos

      logger.info(`Total de pedidos obtidos: ${todosPedidos.length} de ${totalPedidos} totais`);

      // Função helper para converter string de data para Date ou null
      const parseDate = (dateString: string | null | undefined): Date | null => {
        if (!dateString) {
          return null;
        }
        
        const dateStr = String(dateString).trim();
        
        if (dateStr === '' || dateStr === 'null' || dateStr === 'undefined' || dateStr === 'NaN') {
          return null;
        }
        
        try {
          // Formato esperado: "DD/MM/YYYY HH:mm:ss" ou "DD/MM/YYYY"
          let date: Date;
          if (dateStr.includes('/')) {
            // Formato brasileiro
            const parts = dateStr.split(' ');
            const datePart = parts[0].split('/');
            if (datePart.length === 3) {
              const day = parseInt(datePart[0], 10);
              const month = parseInt(datePart[1], 10) - 1; // Mês é 0-indexed
              const year = parseInt(datePart[2], 10);
              
              if (parts.length > 1 && parts[1]) {
                // Tem hora
                const timePart = parts[1].split(':');
                const hour = parseInt(timePart[0] || '0', 10);
                const minute = parseInt(timePart[1] || '0', 10);
                const second = parseInt(timePart[2] || '0', 10);
                date = new Date(year, month, day, hour, minute, second);
              } else {
                date = new Date(year, month, day);
              }
            } else {
              date = new Date(dateStr);
            }
          } else {
            date = new Date(dateStr);
          }
          
          if (isNaN(date.getTime())) {
            logger.warn('Data inválida recebida: ' + dateStr);
            return null;
          }
          return date;
        } catch (e) {
          logger.warn('Erro ao parsear data: ' + dateStr + ' - ' + String((e as any)?.message || 'Erro desconhecido'));
          return null;
        }
      };

      // Função helper para converter valor monetário
      const parseValor = (valorStr: string | null | undefined): number => {
        if (!valorStr) return 0;
        const str = String(valorStr).trim();
        // Remover "R$", espaços e substituir vírgula por ponto
        const cleaned = str.replace(/R\$\s*/g, '').replace(/\./g, '').replace(',', '.').trim();
        const valor = parseFloat(cleaned);
        return isNaN(valor) ? 0 : valor;
      };

      // Buscar clientes para vincular pedidos
      const clientes = await this.clienteModel.findByUserId(userId, 1, 10000);

      // Converter para formato do banco - FILTRAR APENAS PEDIDOS COM CPF
      const pedidosParaSalvar: Omit<VmLavPedido, 'id' | 'created_at' | 'updated_at'>[] = todosPedidos
        .filter(pedido => pedido.cliente_cpf && pedido.cliente_cpf.trim() !== '') // Filtrar apenas pedidos com CPF
        .map(pedido => {
          // Tentar vincular cliente por CPF ou telefone
          let clienteId: number | null = null;
          if (pedido.cliente_cpf) {
            const cliente = clientes.clientes.find(c => c.cpf === pedido.cliente_cpf);
            if (cliente) {
              clienteId = cliente.id;
            }
          }

          const lavanderia = pedido.lavanderia || {};
          const equipamento = pedido.equipamento || {};
          const maquina = pedido.maquina || {};

          return {
            user_id: userId,
            id_pedido_vm: null, // Não disponível na resposta
            id_lavanderia: lavanderia.id || null,
            lavanderia_descricao: lavanderia.descricao || null,
            lavanderia_localizador: lavanderia.localizador || null,
            id_empresa: pedido.id_empresa || null,
            empresa_nome: pedido.empresa_nome || null,
            empresa_documento: pedido.empresa_documento || null,
            data_venda: parseDate(pedido.data_venda),
            situacao_venda: pedido.situacao_venda || null,
            tipo_pagamento: pedido.tipo_pagamento || null,
            valor: parseValor(pedido.valor),
            valor_sem_desconto: parseValor(pedido.valor_sem_desconto),
            id_equipamento: equipamento.idEquipamento || null,
            equipamento_descricao: equipamento.descricao || null,
            equipamento_numero_serie: equipamento.numeroSerie || null,
            equipamento_numero_etiqueta: equipamento.numeroEtiqueta || null,
            pdv: pedido.pdv || null,
            id_maquina: maquina.id || null,
            maquina_descricao: maquina.descricao || null,
            maquina_localizador: maquina.localizador || null,
            tipo_servico: pedido.tipo_servico || null,
            servico: pedido.servico || null,
            numero_cartao: pedido.numero_cartao || null,
            bandeira_cartao: pedido.bandeira_cartao || null,
            tipo_cartao: pedido.tipo_cartao || null,
            cliente_cpf: pedido.cliente_cpf || null,
            cliente_nome: pedido.cliente_nome || null,
            cliente_data_nascimento: parseDate(pedido.cliente_data_nascimento),
            cliente_telefone: pedido.cliente_telefone || null,
            cliente_email: pedido.cliente_email || null,
            cliente_id: clienteId,
          };
        });

      logger.info(`Filtrados ${pedidosParaSalvar.length} pedidos com CPF de ${todosPedidos.length} pedidos totais`);

      // Salvar no banco (bulk upsert)
      await this.pedidoModel.bulkUpsert(pedidosParaSalvar);

      // Contar registros após sincronização (apenas se não for última semana)
      if (!apenasUltimaSemana) {
        const pedidosDepois = await this.pedidoModel.findByUserId(userId, 1, 100000);
        const totalDepois = pedidosDepois.pedidos.length;
        
        // Calcular novos e alterados
        registrosTotal = pedidosParaSalvar.length;
        registrosNovos = Math.max(0, totalDepois - totalAntes);
        registrosAlterados = Math.max(0, registrosTotal - registrosNovos);
      } else {
        // Para última semana, assumir que todos são novos ou alterados
        registrosTotal = pedidosParaSalvar.length;
        registrosNovos = registrosTotal; // Aproximação
        registrosAlterados = 0;
      }

      const duracao = Math.round((Date.now() - inicio) / 1000);
      
      // Atualizar última sincronização APENAS em caso de sucesso
      // Não alterar status ou ultimo_erro - isso é responsabilidade do VmLavConnectionManager
      const credentials = await this.credentialsModel.findByUserId(userId);
      if (credentials) {
        await this.credentialsModel.update(credentials.id, {
          ultima_sincronizacao: new Date(),
          // NÃO atualizar status ou ultimo_erro aqui
          // Esses campos são gerenciados apenas pelo VmLavConnectionManager
        });
      }
      
      // Registrar log de sincronização
      await this.logModel.create({
        user_id: userId,
        tipo: 'pedidos',
        data_execucao: new Date(),
        registros_novos: registrosNovos,
        registros_alterados: registrosAlterados,
        registros_total: registrosTotal,
        sucesso: true,
        erro: null,
        duracao_segundos: duracao,
      });

      logger.info(`Sincronização de pedidos concluída: ${pedidosParaSalvar.length} pedidos (${registrosNovos} novos, ${registrosAlterados} alterados) em ${duracao}s`);
      
      // Log dedicado de atualização de tabela
      const { VmLavConnectionLogger } = await import('../utils/vmLavConnectionLogger');
      VmLavConnectionLogger.logTableUpdate(
        userId,
        'pedidos',
        true,
        registrosNovos,
        registrosAlterados,
        registrosTotal,
        duracao
      );

      // Processar notificações automatizadas por pedido
      logger.info('Iniciando processamento de notificações automatizadas por pedido...');
      try {
        // 1. Buscar IDs dos pedidos recém-inseridos/atualizados usando chaves únicas
        const pedidosComIds: number[] = [];
        for (const pedido of pedidosParaSalvar) {
          if (!pedido.cliente_cpf || !pedido.data_venda) continue;
          
          const pedidoEncontrado = await this.pedidoModel.findByChavesUnicas(
            userId,
            pedido.data_venda,
            pedido.cliente_cpf,
            pedido.valor
          );
          
          if (pedidoEncontrado) {
            pedidosComIds.push(pedidoEncontrado.id);
          }
        }

        logger.info(`Encontrados ${pedidosComIds.length} pedidos com IDs para processar notificações`);

        if (pedidosComIds.length === 0) {
          logger.info('Nenhum pedido encontrado para processar notificações');
        } else {
          const { FidelizacaoService } = await import('./fidelizacao.service');
          const fidelizacaoService = new FidelizacaoService();
          const { FidelizacaoNotificacaoService } = await import('./fidelizacaoNotificacao.service');
          const notificacaoService = new FidelizacaoNotificacaoService();

          // 2. Buscar pedidos que ainda não foram notificados de PROGRESSO
          const { FidelizacaoNotificacaoModel } = await import('../models/fidelizacaoNotificacao.model');
          const notificacaoModel = new FidelizacaoNotificacaoModel();
          
          const pedidosNaoNotificadosProgresso = await notificacaoModel
            .findPedidosNaoNotificados(userId, 'PROGRESSO', pedidosComIds);

          logger.info(`${pedidosNaoNotificadosProgresso.length} pedidos precisam de notificação de progresso`);

          // 3. Buscar pedidos que ainda não foram notificados de CONQUISTA
          const pedidosNaoNotificadosConquista = await notificacaoModel
            .findPedidosNaoNotificados(userId, 'CONQUISTA', pedidosComIds);

          logger.info(`${pedidosNaoNotificadosConquista.length} pedidos precisam de notificação de conquista`);

          // 4. Processar notificações de progresso
          let notificacoesProgressoEnviadas = 0;
          for (const pedidoId of pedidosNaoNotificadosProgresso) {
            try {
              const pedido = await this.pedidoModel.findById(pedidoId);
              if (!pedido || !pedido.cliente_cpf) {
                logger.warn(`Pedido ${pedidoId} não encontrado ou sem CPF`);
                continue;
              }

              // Enviar notificação de progresso para este pedido
              await notificacaoService.enviarNotificacaoProgressoPorPedido(
                userId,
                pedido.cliente_cpf,
                pedidoId
              );
              notificacoesProgressoEnviadas++;
            } catch (error: any) {
              logger.warn(`Erro ao processar notificação de progresso para pedido ${pedidoId}: ${error.message}`);
            }
          }

          if (notificacoesProgressoEnviadas > 0) {
            logger.info(`${notificacoesProgressoEnviadas} notificações de progresso processadas`);
          }

          // 5. Processar notificações de conquista
          // Primeiro, obter CPFs únicos dos pedidos não notificados
          const cpfsUnicosResolvidos: string[] = [];
          for (const pedidoId of pedidosNaoNotificadosConquista) {
            try {
              const pedido = await this.pedidoModel.findById(pedidoId);
              if (pedido?.cliente_cpf && !cpfsUnicosResolvidos.includes(pedido.cliente_cpf)) {
                cpfsUnicosResolvidos.push(pedido.cliente_cpf);
              }
            } catch (error) {
              // Ignorar erros
            }
          }

          let totalPremiosConcedidos = 0;
          let notificacoesConquistaEnviadas = 0;

          for (const cpf of cpfsUnicosResolvidos) {
            try {
              // Apurar prêmios para este cliente
              const resultadoPremios = await fidelizacaoService.apurarEConcederPremios(userId, cpf);
              totalPremiosConcedidos += resultadoPremios.premiosConcedidos;

              // Buscar pedidos deste cliente que ainda não foram notificados de conquista
              const pedidosClienteResolvidos: number[] = [];
              for (const pedidoId of pedidosNaoNotificadosConquista) {
                try {
                  const pedido = await this.pedidoModel.findById(pedidoId);
                  if (pedido?.cliente_cpf === cpf) {
                    pedidosClienteResolvidos.push(pedidoId);
                  }
                } catch (error) {
                  // Ignorar erros
                }
              }

              // Enviar notificação de conquista para cada pedido deste cliente
              if (resultadoPremios.premios.length > 0 && pedidosClienteResolvidos.length > 0) {
                // Enviar para o primeiro pedido não notificado deste cliente
                // (assumindo que todos os pedidos do mesmo cliente geram os mesmos prêmios)
                const primeiroPedidoId = pedidosClienteResolvidos[0];
                await notificacaoService.enviarNotificacaoConquistaPorPedido(
                  userId,
                  cpf,
                  primeiroPedidoId,
                  resultadoPremios.premios
                );
                notificacoesConquistaEnviadas++;
              }
            } catch (error: any) {
              logger.warn(`Erro ao processar notificações de conquista para cliente ${cpf}: ${error.message}`);
            }
          }

          if (totalPremiosConcedidos > 0) {
            logger.info(`${totalPremiosConcedidos} prêmios concedidos automaticamente`);
          }
          if (notificacoesConquistaEnviadas > 0) {
            logger.info(`${notificacoesConquistaEnviadas} notificações de conquista processadas`);
          }
        }
      } catch (error: any) {
        logger.error(`Erro no processamento de notificações automatizadas: ${error.message}`);
        // Não falhar a sincronização por causa disso
      }

      return {
        success: true,
        message: `${pedidosParaSalvar.length} pedidos sincronizados com sucesso`,
        total: pedidosParaSalvar.length,
      };
    } catch (error: any) {
      logger.error(`Erro ao sincronizar pedidos: ${error.message}`);
      
      const duracao = Math.round((Date.now() - inicio) / 1000);
      
      // Registrar log de erro
      await this.logModel.create({
        user_id: userId,
        tipo: 'pedidos',
        data_execucao: new Date(),
        registros_novos: registrosNovos,
        registros_alterados: registrosAlterados,
        registros_total: registrosTotal,
        sucesso: false,
        erro: error.message || 'Erro desconhecido',
        duracao_segundos: duracao,
      });
      
      // Log dedicado de atualização de tabela (erro)
      const { VmLavConnectionLogger } = await import('../utils/vmLavConnectionLogger');
      VmLavConnectionLogger.logTableUpdate(
        userId,
        'pedidos',
        false,
        registrosNovos,
        registrosAlterados,
        registrosTotal,
        duracao,
        error.message || 'Erro desconhecido'
      );
      
      return {
        success: false,
        message: error.message || 'Erro ao sincronizar pedidos',
      };
    }
  }

  /**
   * Lista clientes do banco
   */
  async listarClientes(
    userId: number,
    options: {
      page?: number;
      limit?: number;
      search?: string;
      orderBy?: string;
      orderDir?: 'ASC' | 'DESC';
    } = {}
  ): Promise<{ clientes: (VmLavCliente & { total_lavagens: number; total_secagens: number })[]; total: number }> {
    if (options.search) {
      return await this.clienteModel.searchByUserId(
        userId,
        options.search,
        options.page || 1,
        options.limit || 50,
        options.orderBy,
        options.orderDir
      );
    } else {
      // Para busca sem termo, também precisamos incluir as estatísticas
      // Vamos usar uma query similar mas sem filtro de busca
      const conn = await pool.getConnection();
      try {
        const offset = ((options.page || 1) - 1) * (options.limit || 50);
        
        const orderByMap: Record<string, string> = {
          'nome': 'c.nome',
          'cpf': 'c.cpf',
          'telefone': 'c.telefone',
          'email': 'c.email',
          'data_cadastro': 'c.data_cadastro',
          'data_ultima_compra': 'c.data_ultima_compra',
          'qtd_compras': 'c.qtd_compras',
          'total_lavagens': 'total_lavagens',
          'total_secagens': 'total_secagens',
        };
        
        const orderByField = options.orderBy && orderByMap[options.orderBy] ? orderByMap[options.orderBy] : 'c.nome';
        const orderDirection = options.orderDir === 'DESC' ? 'DESC' : 'ASC';

        const query = `
          SELECT 
            c.id, c.user_id, c.id_cliente_vm, c.nome, c.data_nascimento, c.cpf, c.telefone, c.email, 
            c.genero, c.data_cadastro, c.data_ultima_compra, c.qtd_compras, c.valor_total_compras, 
            c.qtd_compras_90, c.valor_total_compras_90, c.qtd_compras_30, c.valor_total_compras_30, 
            c.qtd_compras_7, c.valor_total_compras_7, c.lavanderia, c.acoes, c.created_at, c.updated_at,
            COALESCE(SUM(CASE WHEN p.tipo_servico = 'LAVAGEM' THEN 1 ELSE 0 END), 0) as total_lavagens,
            COALESCE(SUM(CASE WHEN p.tipo_servico = 'SECAGEM' THEN 1 ELSE 0 END), 0) as total_secagens
          FROM vm_lav_clientes c
          LEFT JOIN vm_lav_pedidos p ON p.cliente_id = c.id AND p.user_id = c.user_id
          WHERE c.user_id = ?
          GROUP BY c.id
          ORDER BY ${orderByField} ${orderDirection}
          LIMIT ? OFFSET ?
        `;
        
        const queryResult = await conn.query(query, [userId, options.limit || 50, offset]) as any;
        
        let rows: any[] = [];
        if (Array.isArray(queryResult)) {
          rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
        } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
          rows = Array.from(queryResult as any);
        }
        
        const totalQuery = `SELECT COUNT(*) as total FROM vm_lav_clientes WHERE user_id = ?`;
        const totalQueryResult = await conn.query(totalQuery, [userId]) as any;
        
        let totalRows: any[] = [];
        if (Array.isArray(totalQueryResult)) {
          totalRows = Array.isArray(totalQueryResult[0]) ? totalQueryResult[0] : totalQueryResult;
        } else if (totalQueryResult && typeof totalQueryResult === 'object' && 'length' in totalQueryResult) {
          totalRows = Array.from(totalQueryResult as any);
        }
        
        const total = totalRows && totalRows[0] ? totalRows[0].total : 0;
        
        // Mapear rows para clientes manualmente (mapRowToCliente é privado)
        const clientesMapeados = Array.isArray(rows) ? rows.map((row: any) => {
          let acoes: any = null;
          if (row.acoes) {
            try {
              acoes = typeof row.acoes === 'string' ? JSON.parse(row.acoes) : row.acoes;
            } catch (error) {
              // Ignorar erro de parse
            }
          }

          const cliente: VmLavCliente = {
            id: row.id,
            user_id: row.user_id,
            id_cliente_vm: row.id_cliente_vm,
            nome: row.nome,
            data_nascimento: row.data_nascimento ? new Date(row.data_nascimento) : null,
            cpf: row.cpf,
            telefone: row.telefone,
            email: row.email,
            genero: row.genero,
            data_cadastro: row.data_cadastro ? new Date(row.data_cadastro) : null,
            data_ultima_compra: row.data_ultima_compra ? new Date(row.data_ultima_compra) : null,
            qtd_compras: row.qtd_compras || 0,
            valor_total_compras: parseFloat(row.valor_total_compras) || 0,
            qtd_compras_90: row.qtd_compras_90 || 0,
            valor_total_compras_90: parseFloat(row.valor_total_compras_90) || 0,
            qtd_compras_30: row.qtd_compras_30 || 0,
            valor_total_compras_30: parseFloat(row.valor_total_compras_30) || 0,
            qtd_compras_7: row.qtd_compras_7 || 0,
            valor_total_compras_7: parseFloat(row.valor_total_compras_7) || 0,
            lavanderia: row.lavanderia,
            acoes: acoes,
            created_at: row.created_at ? new Date(row.created_at) : new Date(),
            updated_at: row.updated_at ? new Date(row.updated_at) : new Date(),
          };
          return {
            ...cliente,
            total_lavagens: Number(row.total_lavagens) || 0,
            total_secagens: Number(row.total_secagens) || 0,
          };
        }) : [];
        
        return {
          clientes: clientesMapeados,
          total: Number(total) || 0,
        };
      } finally {
        conn.release();
      }
    }
  }

  /**
   * Obtém credenciais do usuário
   */
  async obterCredenciais(userId: number): Promise<VmLavCredentials | null> {
    return await this.credentialsModel.findByUserId(userId);
  }

  /**
   * Fecha navegador Puppeteer
   */
  async fecharNavegador(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}

