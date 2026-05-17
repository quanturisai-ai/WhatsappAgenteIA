import axios from 'axios';
import logger from '../utils/logger';
import pool from '../config/database';
import { VmLavCredentialsModel, VmLavCredentials } from '../models/vmLavCredentials.model';
import { VmLavClienteModel, VmLavCliente } from '../models/vmLavCliente.model';
import { VmLavPedidoModel, VmLavPedido } from '../models/vmLavPedido.model';
import { VmLavVoucherModel } from '../models/vmLavVoucher.model';
import { VmLavSincronizacaoLogModel } from '../models/vmLavSincronizacaoLog.model';
import { PremioClienteModel } from '../models/premioCliente.model';
import puppeteer, { Browser, Page } from 'puppeteer';
import { normalizeCpfToDigits, normalizeCpfColumnSql } from '../utils/cpfUtils';


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
  private voucherModel: VmLavVoucherModel;
  private logModel: VmLavSincronizacaoLogModel;
  private premioClienteModel: PremioClienteModel;
  private readonly loginUrl = 'https://conta.vmhub.vmtecnologia.io/conta/login';
  private readonly apiUrl = 'https://apps.vmhub.vmtecnologia.io/conta/api/v1/contas-usuarios/login';
  private readonly tokenAplicacaoUrl = 'https://apps.vmhub.vmtecnologia.io/conta/api/v1/contas-usuarios/login/aplicacao';
  private readonly clientesApiUrl = 'https://apps.vmhub.vmtecnologia.io/vmlav/api/v1/relatorios/clientes';
  private readonly pedidosApiUrl = 'https://apps.vmhub.vmtecnologia.io/vmlav/api/v1/relatorios/pedidos';
  private readonly vouchersApiUrl = 'https://apps.vmhub.vmtecnologia.io/wallet/api/v1/vouchers/listaVoucher';
  private readonly itensRestricaoUrl = 'https://apps.vmhub.vmtecnologia.io/wallet/api/v1/vouchers/itens-restricao';
  private readonly criarVoucherUrl = 'https://apps.vmhub.vmtecnologia.io/wallet/api/v1/vouchers';
  private readonly idEmpresa = 1737;
  private readonly empresaLocalizador = 'lavateriajdnovomundo';
  private readonly SERVICO_IDS: Record<string, { id: number; desc: string }> = {
    LAVAGEM: { id: 3837, desc: 'Lavagem' },
    SECAGEM: { id: 3838, desc: 'Secagem' },
  };
  private browser: Browser | null = null;
  private page: Page | null = null;
  private static activeSyncs: Map<number, boolean> = new Map();

  constructor() {
    this.credentialsModel = new VmLavCredentialsModel();
    this.clienteModel = new VmLavClienteModel();
    this.pedidoModel = new VmLavPedidoModel();
    this.voucherModel = new VmLavVoucherModel();
    this.logModel = new VmLavSincronizacaoLogModel();
    this.premioClienteModel = new PremioClienteModel();
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
      const { launchBrowser } = await import('../utils/puppeteer.util');
      this.browser = await launchBrowser({
        headless: false,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled',
          '--start-maximized',
        ],
        defaultViewport: null, // Permite que a janela use o tamanho real
      });

      this.page = await this.browser.newPage();

      // 2. Aplicar medidas anti-detecção antes de navegar
      await this.aplicarStealthMeasures(this.page);

      await this.page.goto(this.loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });

      // 3. Preencher formulário (sem clicar no botão ainda)
      logger.info('Preenchendo formulário...');
      await this.preencherFormularioLogin(email, senha);

      // 4. Iniciar monitoramento de rede ANTES de resolver CAPTCHA
      logger.info('Iniciando monitoramento de requisições de rede...');
      this.iniciarMonitoramentoRede(this.page);

      // 5. Tentar clicar automaticamente no reCAPTCHA
      logger.info('Tentando resolver reCAPTCHA automaticamente...');
      const clicouAutomatico = await this.tentarClicarCaptchaAutomaticamente();

      // 6. Notificar que CAPTCHA está pronto (para fallback manual se necessário)
      if (!clicouAutomatico && onCaptchaReady) {
        onCaptchaReady();
      }

      // 7. Aguardar resolução do CAPTCHA (automática ou manual, máximo 5 minutos)
      if (clicouAutomatico) {
        logger.info('Clique automático realizado. Aguardando token do reCAPTCHA (máx 30s)...');
      } else {
        logger.info('Aguardando resolução manual do CAPTCHA...');
      }
      const captchaTimeout = clicouAutomatico ? 30000 : 300000;
      const captchaToken = await this.aguardarCaptcha(captchaTimeout);

      // Se o clique automático não gerou token, tentar fallback manual
      if (!captchaToken && clicouAutomatico) {
        logger.warn('Clique automático não gerou token (possível desafio de imagens). Aguardando resolução manual...');
        if (onCaptchaReady) {
          onCaptchaReady();
        }
        const captchaTokenManual = await this.aguardarCaptcha(300000);
        if (!captchaTokenManual) {
          throw new Error('CAPTCHA não foi resolvido a tempo');
        }
        logger.info('Token do reCAPTCHA obtido via fallback manual (' + String(captchaTokenManual.length) + ' caracteres)');
        // Continuar o fluxo com o token manual (reatribuir para prosseguir)
        return await this.continuarLoginAposCaptcha(email, senha, captchaTokenManual);
      }

      if (!captchaToken) {
        throw new Error('CAPTCHA não foi resolvido a tempo');
      }

      logger.info('Token do reCAPTCHA obtido (' + String(captchaToken.length) + ' caracteres)');

      return await this.continuarLoginAposCaptcha(email, senha, captchaToken);
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
   * Continua o fluxo de login após obtenção do token reCAPTCHA.
   * Extraído para ser reutilizado tanto pelo caminho automático quanto pelo fallback manual.
   */
  private async continuarLoginAposCaptcha(
    email: string,
    senha: string,
    captchaToken: string
  ): Promise<LoginResponse> {
    if (!this.page) {
      throw new Error('Página não inicializada');
    }

    logger.info('Clicando no botão entrar...');
    await this.clicarBotaoEntrar();

    logger.info('Aguardando requisições de rede após clique...');
    await new Promise(resolve => setTimeout(resolve, 20000));
    await new Promise(resolve => setTimeout(resolve, 3000));

    logger.info('Capturando todos os dados do localStorage...');
    const todosDadosLocalStorage = await this.page.evaluate(() => {
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

    logger.info('Capturando todos os cookies...');
    const todosCookies = await this.page.cookies();

    logger.info('Verificando token no localStorage...');
    const tokenFromStorage: string | null = todosDadosLocalStorage.token || null;

    if (tokenFromStorage) {
      try {
        const payload = JSON.parse(
          Buffer.from(tokenFromStorage.split('.')[1], 'base64').toString()
        );
        if (payload.clientId === 'vmlav') {
          logger.info('Token tem clientId: vmlav - PERFEITO!');
        } else {
          logger.info('Token não tem clientId: vmlav (tem: ' + String(payload.clientId || 'nenhum') + ')');
        }
      } catch (_e) {
        // Token não decodificável — usar mesmo assim
      }
      return {
        token: tokenFromStorage,
        success: true,
        localStorage: todosDadosLocalStorage,
        cookies: todosCookies,
      };
    }

    logger.info('Token não encontrado no localStorage, fazendo requisição manual...');
    const loginResult = await this.makeLoginRequest(email, senha, captchaToken);

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
   * Aplica medidas anti-detecção de bot no Puppeteer.
   * Remove sinais que o reCAPTCHA usa para identificar automação.
   */
  private async aplicarStealthMeasures(page: Page): Promise<void> {
    await page.evaluateOnNewDocument(`
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      window.navigator.chrome = { runtime: {} };
      Object.defineProperty(navigator, 'languages', { get: () => ['pt-BR', 'pt', 'en-US', 'en'] });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      const originalQuery = window.navigator.permissions.query.bind(window.navigator.permissions);
      window.navigator.permissions.query = (parameters) =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(parameters);
    `);
  }

  /**
   * Tenta clicar automaticamente no checkbox "Não sou um robô" do reCAPTCHA.
   * Retorna true se o clique foi realizado, false caso contrário.
   */
  private async tentarClicarCaptchaAutomaticamente(): Promise<boolean> {
    if (!this.page) return false;

    try {
      await this.page.waitForSelector('iframe[src*="recaptcha"], iframe[title*="reCAPTCHA"]', { timeout: 10000 });
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));

      const recaptchaFrame = this.page.frames().find(
        f => f.url().includes('api2/anchor') || f.url().includes('recaptcha/api2/anchor')
      );

      if (!recaptchaFrame) {
        logger.warn('Frame do reCAPTCHA não encontrado — aguardando resolução manual');
        return false;
      }

      const checkbox = await recaptchaFrame.$('.recaptcha-checkbox-border, #recaptcha-anchor');
      if (!checkbox) {
        logger.warn('Checkbox do reCAPTCHA não encontrado dentro do frame — aguardando resolução manual');
        return false;
      }

      await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 800));
      await checkbox.click();
      logger.info('✅ Clique automático no reCAPTCHA realizado');
      return true;
    } catch (error: any) {
      logger.warn(`Clique automático no reCAPTCHA falhou: ${error.message} — aguardando resolução manual`);
      return false;
    }
  }

  /**
   * Aguarda resolução do CAPTCHA (automática ou manual).
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
   * Renovação de token na ordem histórica: ConnectionManager → DB → token_inicial → restaurar sessão.
   * Não abre login com e-mail/senha (último recurso fica em obterTokenParaSincronizacao).
   */
  private async obterTokenViaRenovacaoSomente(userId: number): Promise<string | null> {
    try {
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

      const credentials = await this.credentialsModel.findByUserId(userId);

      if (!credentials) {
        logger.warn(`Nenhuma credencial VM Lav encontrada para usuário ${userId}`);
        return null;
      }

      if (credentials.token_aplicacao && this.isTokenValido(credentials.token_aplicacao)) {
        return credentials.token_aplicacao;
      }

      if (credentials.token_inicial && this.isTokenValido(credentials.token_inicial)) {
        logger.info(`Renovando token da aplicação para usuário ${userId}`);
        const novoTokenAplicacao = await this.obterTokenAplicacao(credentials.token_inicial);

        if (novoTokenAplicacao) {
          await this.credentialsModel.update(credentials.id, {
            token_aplicacao: novoTokenAplicacao,
            token_expira_em: this.getTokenExpiration(novoTokenAplicacao),
          });

          return novoTokenAplicacao;
        }
      }

      logger.info(`Token expirado para usuário ${userId}. Tentando restaurar sessão...`);
      const tokenRestaurado = await this.restaurarSessao(credentials);

      if (tokenRestaurado) {
        logger.info(`Sessão restaurada com sucesso para usuário ${userId}`);
        return tokenRestaurado;
      }

      return null;
    } catch (error: any) {
      logger.error(`Erro em obterTokenViaRenovacaoSomente: ${error.message}`);
      return null;
    }
  }

  /**
   * Obtém ou renova token válido (sem login com e-mail/senha).
   * Para scripts/diagnóstico e chamadas que não devem abrir o fluxo de login automático.
   */
  async obterTokenValido(userId: number): Promise<string | null> {
    try {
      const token = await this.obterTokenViaRenovacaoSomente(userId);
      if (token) {
        return token;
      }

      const credentials = await this.credentialsModel.findByUserId(userId);
      if (credentials) {
        logger.warn(
          `Não foi possível obter token VM Lav para usuário ${userId} após revalidação/restauração de sessão.`
        );
        await this.credentialsModel.update(credentials.id, {
          status: 'erro',
          ultimo_erro:
            'Token expirado ou inválido após revalidação e restauração de sessão. Use sincronização agendada ou reconfigure credenciais.',
        });
      }

      return null;
    } catch (error: any) {
      logger.error(`Erro ao obter token válido: ${error.message}`);
      return null;
    }
  }

  /**
   * Token para sincronizações agendadas: mesma ordem de revalidação que obterTokenValido;
   * só após falha tenta login automático (último recurso), como no fluxo combinado com o usuário.
   */
  async obterTokenParaSincronizacao(userId: number): Promise<string | null> {
    try {
      let token = await this.obterTokenViaRenovacaoSomente(userId);
      if (token) {
        return token;
      }

      const credentials = await this.credentialsModel.findByUserId(userId);
      if (!credentials) {
        logger.warn(`Nenhuma credencial VM Lav encontrada para usuário ${userId}`);
        return null;
      }

      logger.info(
        `Usuário ${userId}: sem token após revalidação (VM Lav). Tentando login automático como último recurso...`
      );
      const viaLogin = await this.reconectarAutomaticamente(credentials);
      if (viaLogin) {
        logger.info(`Login automático (último recurso) bem-sucedido para usuário ${userId}`);
        return viaLogin;
      }

      token = await this.obterTokenViaRenovacaoSomente(userId);
      if (token) {
        return token;
      }

      logger.warn(
        `Não foi possível obter token VM Lav para usuário ${userId} após revalidação e login automático.`
      );
      await this.credentialsModel.update(credentials.id, {
        status: 'erro',
        ultimo_erro:
          'Falha após revalidação de token, restauração de sessão e login automático. Reconfigure credenciais ou faça login manual na VM Lav.',
      });
      return null;
    } catch (error: any) {
      logger.error(`Erro em obterTokenParaSincronizacao: ${error.message}`);
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
      const { launchBrowser } = await import('../utils/puppeteer.util');
      this.browser = await launchBrowser({
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
   * Reconecta automaticamente usando credenciais salvas + clique automático no reCAPTCHA.
   * Usa headless: false para que o reCAPTCHA tenha ambiente gráfico.
   * Se o clique automático não gerar token (desafio de imagens), retorna null.
   */
  private async reconectarAutomaticamente(credentials: VmLavCredentials): Promise<string | null> {
    try {
      if (!credentials.email || !credentials.senha) {
        logger.warn('Reconexão automática impossível: email ou senha não salvos');
        return null;
      }

      logger.info(`Tentando reconexão automática para ${credentials.email} com clique automático no reCAPTCHA...`);

      const { launchBrowser } = await import('../utils/puppeteer.util');
      this.browser = await launchBrowser({
        headless: false,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled',
          '--window-size=1280,800',
        ],
        defaultViewport: { width: 1280, height: 800 },
      });

      this.page = await this.browser.newPage();
      await this.aplicarStealthMeasures(this.page);
      await this.page.goto(this.loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });

      await this.preencherFormularioLogin(credentials.email, credentials.senha);
      this.iniciarMonitoramentoRede(this.page);

      const clicouAutomatico = await this.tentarClicarCaptchaAutomaticamente();
      if (!clicouAutomatico) {
        logger.warn('Reconexão automática: não foi possível clicar no reCAPTCHA');
        await this.fecharNavegador();
        return null;
      }

      const captchaToken = await this.aguardarCaptcha(30000);
      if (!captchaToken) {
        logger.warn('Reconexão automática: reCAPTCHA exigiu desafio de imagens — requer intervenção manual');
        await this.fecharNavegador();
        return null;
      }

      logger.info('Reconexão automática: token reCAPTCHA obtido, finalizando login...');

      await this.clicarBotaoEntrar();
      await new Promise(resolve => setTimeout(resolve, 20000));
      await new Promise(resolve => setTimeout(resolve, 3000));

      const todosDadosLocalStorage = await this.page.evaluate(() => {
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
      const todosCookies = await this.page.cookies();

      const tokenFromStorage: string | null = todosDadosLocalStorage.token || null;
      if (!tokenFromStorage) {
        logger.warn('Reconexão automática: login aparentemente concluído mas token não encontrado no localStorage');
        await this.fecharNavegador();
        return null;
      }

      logger.info('✅ Reconexão automática bem-sucedida!');

      await this.credentialsModel.update(credentials.id, {
        token_inicial: tokenFromStorage,
        dados_localstorage: todosDadosLocalStorage,
        cookies: todosCookies,
        token_expira_em: this.getTokenExpiration(tokenFromStorage),
        status: 'ativo',
        ultimo_erro: null,
      });

      const tokenAplicacao = await this.obterTokenAplicacao(tokenFromStorage);
      if (tokenAplicacao) {
        await this.credentialsModel.update(credentials.id, {
          token_aplicacao: tokenAplicacao,
          token_expira_em: this.getTokenExpiration(tokenAplicacao),
        });
        await this.fecharNavegador();
        return tokenAplicacao;
      }

      await this.fecharNavegador();
      return tokenFromStorage;
    } catch (error: any) {
      logger.error(`Erro na reconexão automática: ${error.message}`);
      await this.fecharNavegador();
      return null;
    }
  }

  /**
   * Fecha o navegador Puppeteer de forma segura.
   */
  async fecharNavegador(): Promise<void> {
    try {
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
        this.page = null;
      }
    } catch (error: any) {
      logger.warn(`Erro ao fechar navegador: ${error.message}`);
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

    // Bloqueio de concorrência
    if (VmLavService.activeSyncs.get(userId)) {
      logger.warn(`⚠️ Sincronização de clientes já em andamento para usuário ${userId}. Ignorando nova tentativa.`);
      return {
        success: false,
        message: 'Sincronização já em andamento para este usuário.'
      };
    }

    try {
      // Ativar trava
      VmLavService.activeSyncs.set(userId, true);
      logger.info(`Iniciando sincronização de clientes para usuário ${userId}`);

      // Contar registros existentes antes
      const clientesExistentes = await this.clienteModel.findByUserId(userId, 1, 100000);
      const totalAntes = clientesExistentes.clientes.length;

      // Obter token: revalidação primeiro; login automático só como último recurso (sync agendada/manual)
      const token = await this.obterTokenParaSincronizacao(userId);

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
      const credentials = await this.credentialsModel.findByUserId(userId);
      if (credentials) {
        await this.credentialsModel.update(credentials.id, {
          ultima_sincronizacao: new Date(),
          status: 'ativo',
          ultimo_erro: null,
        });
      }

      const duracao = Math.round((Date.now() - inicio) / 1000);

      // Registrar log de sucesso na tabela de sincronização
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
      // Passamos ignorarLock: true porque já temos o lock de clientes ativo
      const pedidosResult = await this.sincronizarPedidos(userId, false, true);

      // Sincronizar vouchers também (era missing no fluxo manual)
      logger.info(`Iniciando sincronização de vouchers para usuário ${userId}`);
      const vouchersResult = await this.sincronizarVouchers(userId, true);
      if (!vouchersResult.success) {
        logger.warn(`Aviso: erro ao sincronizar vouchers no fluxo manual: ${vouchersResult.message}`);
      }

      // Disparar notificações em background (sem bloquear a resposta)
      setImmediate(async () => {
        try {
          const { sincronizarUsuario } = await import('../utils/vmLavScheduler');
          await sincronizarUsuario(userId);
        } catch (notifErr: any) {
          logger.error(`Erro ao processar notificações após sync manual para user ${userId}: ${notifErr.message}`);
        }
      });

      const mensagemFinal = pedidosResult.success
        ? `${clientesParaSalvar.length} clientes, ${pedidosResult.total || 0} pedidos e ${vouchersResult.total || 0} vouchers sincronizados com sucesso`
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
    } finally {
      // Liberar trava
      VmLavService.activeSyncs.delete(userId);
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
  async sincronizarPedidos(userId: number, apenasUltimaSemana: boolean = false, ignorarLock: boolean = false): Promise<{ success: boolean; message: string; total?: number }> {
    const inicio = Date.now();
    let registrosNovos = 0;
    let registrosAlterados = 0;
    let registrosTotal = 0;

    try {
      const modo = apenasUltimaSemana ? 'automática (última semana)' : 'manual (completa)';
      logger.info(`Iniciando sincronização de pedidos para usuário ${userId} - Modo: ${modo}`);

      // Bloqueio de concorrência: verificar se já existe uma sincronização em andamento para este usuário
      if (!ignorarLock && VmLavService.activeSyncs.get(userId)) {
        logger.warn(`⚠️ Sincronização de pedidos já em andamento para usuário ${userId}. Ignorando nova tentativa.`);
        return {
          success: false,
          message: 'Sincronização já em andamento para este usuário.'
        };
      }

      // Ativar trava (apenas se não estiver ignorando e se já não estiver travado)
      if (!ignorarLock) {
        VmLavService.activeSyncs.set(userId, true);
      }

      const token = await this.obterTokenParaSincronizacao(userId);

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
            const cpfPedidoNorm = normalizeCpfToDigits(pedido.cliente_cpf);
            const cliente = clientes.clientes.find(c => normalizeCpfToDigits(c.cpf) === cpfPedidoNorm);
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
            pago_com_fidelidade: false,
          };
        });

      logger.info(`Filtrados ${pedidosParaSalvar.length} pedidos com CPF de ${todosPedidos.length} pedidos totais`);

      // Salvar no banco (bulk upsert atômico)
      await this.pedidoModel.bulkUpsert(pedidosParaSalvar);

      const duracao = Math.round((Date.now() - inicio) / 1000);
      // Para fins de log, assumir que todos os pedidos processados são "novos" ou "alterados"
      // Não é possível determinar com precisão sem uma comparação detalhada, que é custosa.
      // O bulkUpsert já lida com a lógica de inserção/atualização internamente.
      const registrosTotal = pedidosParaSalvar.length;
      const registrosNovos = pedidosParaSalvar.length; // Aproximação
      const registrosAlterados = 0; // Não é possível determinar com precisão sem comparação

      // Atualizar última sincronização APENAS em caso de sucesso
      const credentials = await this.credentialsModel.findByUserId(userId);
      if (credentials) {
        await this.credentialsModel.update(credentials.id, {
          ultima_sincronizacao: new Date(),
          status: 'ativo',
          ultimo_erro: null,
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

      // As notificações automatizadas agora são processadas pelo scheduler 
      // após a marcação de pedidos pagos com fidelidade, para evitar contagem indevida.

      return {
        success: true,
        message: `Sincronização concluída: ${pedidosParaSalvar.length} pedidos processados`,
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
    } finally {
      // Liberar trava (apenas se não estiver ignorando)
      if (!ignorarLock) {
        VmLavService.activeSyncs.delete(userId);
      }
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
   * Headers para chamadas à API Wallet (itens-restricao, criar voucher, obter voucher)
   */
  private getHeadersWallet(token: string): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'Authorization': `Bearer ${token}`,
      'Origin': 'https://vmlav.vmhub.vmtecnologia.io',
      'Referer': 'https://vmlav.vmhub.vmtecnologia.io/',
      'Time-Zone': 'America/Sao_Paulo',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0',
      'X-Vm-App': 'vmlav',
      'X-Vm-Emp': this.empresaLocalizador,
    };
  }

  /**
   * Busca itens de restrição do cliente (API itens-restricao) para gerar voucher
   * Retorna idRestricao e descricao usados na criação do voucher
   */
  async buscarItensRestricaoCliente(
    userId: number,
    nomeCliente: string
  ): Promise<{ success: boolean; idRestricao?: number; descricao?: string; error?: string }> {
    try {
      const token = await this.obterTokenValido(userId);
      if (!token) {
        return { success: false, error: 'Token inválido ou expirado.' };
      }

      const body = {
        listaIdEmpresa: [this.idEmpresa],
        comHierarquia: true,
        nomeClasseRestricao: 'CLIENTE',
        descricaoItem: nomeCliente.trim(),
      };

      const response = await axios.post(this.itensRestricaoUrl, body, {
        headers: this.getHeadersWallet(token),
        timeout: 30000,
      });

      const items = Array.isArray(response.data) ? response.data : [];
      if (items.length === 0) {
        return { success: false, error: 'Cliente não encontrado na API VM.' };
      }

      const primeiro = items[0];
      const idRestricao = primeiro?.idRestricao;
      const descricao = primeiro?.descricao;

      if (idRestricao == null || !descricao) {
        return { success: false, error: 'Resposta da API sem idRestricao ou descricao.' };
      }

      return { success: true, idRestricao, descricao };
    } catch (error: any) {
      logger.error(`Erro ao buscar itens-restricao cliente: ${error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Cria voucher de fidelidade na API VM
   * Retorna o id do voucher criado (usar obterCodigoVoucher para obter o código)
   */
  async criarVoucherFidelidade(
    userId: number,
    params: {
      idRestricao: number;
      descricaoCliente: string;
      valor: string;
      quantidadeUtilizacoes: number;
      dataInicio: Date;
      dataTermino: Date;
      servico: 'LAVAGEM' | 'SECAGEM';
    }
  ): Promise<{ success: boolean; idVoucher?: number; error?: string }> {
    try {
      const token = await this.obterTokenValido(userId);
      if (!token) {
        return { success: false, error: 'Token inválido ou expirado.' };
      }

      const servicoInfo = this.SERVICO_IDS[params.servico];
      if (!servicoInfo) {
        return { success: false, error: 'Serviço deve ser LAVAGEM ou SECAGEM.' };
      }

      const limiteStr = String(params.quantidadeUtilizacoes);
      const valorStr = String(params.valor);

      const body = {
        id: null,
        dataCriacao: null,
        empresas: [{
          id: null,
          voucher: null,
          empresa: {
            id: this.idEmpresa,
            razaoSocial: 'B. E. - LAVANDERIA LTDA',
            nomeFantasia: 'Lavateria LOZANDES (Goiânia - GO)',
            localizador: this.empresaLocalizador,
            possuiPermissoesEspecificas: false,
            documento: { tipo: 'CNPJ', identificador: '57846491000103' },
            tipoBloqueio: 'NENHUM',
            descricaoBloqueio: 'Nenhum',
          },
        }],
        comHierarquia: true,
        ativo: true,
        valor: valorStr,
        codigo: '',
        periodoValidade: {
          dataInicio: params.dataInicio.toISOString(),
          dataTermino: params.dataTermino.toISOString(),
        },
        carteira: {
          idEmpresaCriacao: null,
          contaUsuarioCriacao: null,
          restricoes: [
            {
              id: null,
              classe: { nome: 'LAVANDERIA', descricao: 'Lavanderia', tipo: 'SELECIONAVEL', selecionada: false, editavel: false, importacaoEmLote: false },
              limiteUsoItemRestricao: null,
              limiteValorItemRestricao: null,
              itens: [],
            },
            {
              id: null,
              classe: { nome: 'CLIENTE', descricao: 'Cliente', tipo: 'AUTOCOMPLETE', selecionada: true, editavel: true, importacaoEmLote: true },
              limiteUsoItemRestricao: limiteStr,
              limiteValorItemRestricao: valorStr,
              itens: [{ id: null, idRestricao: params.idRestricao, descricao: params.descricaoCliente, processamento: null, observacao: null }],
            },
            {
              id: null,
              classe: { nome: 'SERVICO', descricao: 'Servico', tipo: 'SELECIONAVEL', selecionada: true, editavel: false, importacaoEmLote: false },
              limiteUsoItemRestricao: limiteStr,
              limiteValorItemRestricao: valorStr,
              itens: [{ id: null, idRestricao: servicoInfo.id, descricao: servicoInfo.desc, processamento: null, observacao: null }],
            },
          ],
          conta: null,
        },
        categoria: { id: 10, idAplicacao: 5, nome: 'Fidelidade', origem: null, editavel: true, creditoReal: false, comumEmpresas: false },
        recorrente: null,
        tipoRecorrencia: null,
        dataRenovacao: null,
        dataAtualizacao: null,
      };

      const response = await axios.post(this.criarVoucherUrl, body, {
        headers: this.getHeadersWallet(token),
        timeout: 30000,
      });

      const idVoucher = response.data?.id;
      if (idVoucher == null) {
        return { success: false, error: 'Resposta da API sem id do voucher.' };
      }

      return { success: true, idVoucher };
    } catch (error: any) {
      logger.error(`Erro ao criar voucher fidelidade: ${error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Obtém o código do voucher via GET /vouchers/{id}
   */
  async obterCodigoVoucher(userId: number, idVoucher: number): Promise<{ success: boolean; codigo?: string; error?: string }> {
    try {
      const token = await this.obterTokenValido(userId);
      if (!token) {
        return { success: false, error: 'Token inválido ou expirado.' };
      }

      const url = `https://apps.vmhub.vmtecnologia.io/wallet/api/v1/vouchers/${idVoucher}`;
      const response = await axios.get(url, {
        headers: this.getHeadersWallet(token),
        timeout: 15000,
      });

      const codigo = response.data?.codigo;
      if (codigo == null || codigo === '') {
        return { success: false, error: 'Resposta da API sem código do voucher.' };
      }

      return { success: true, codigo: String(codigo) };
    } catch (error: any) {
      logger.error(`Erro ao obter código voucher: ${error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Busca vouchers da API
   */
  async buscarVouchers(
    token: string,
    empresa: string = 'lavateriajdnovomundo',
    pagina: number = 0,
    quantidade: number = 100
  ): Promise<{ success: boolean; vouchers?: any[]; total?: number; error?: string }> {
    try {
      const queryParams = new URLSearchParams({
        execCount: 'true',
        pagina: String(pagina),
        quantidade: String(quantidade),
        direcaoOrdenacao: 'DESC',
        campoOrdenacao: 'voucher.dataCriacao',
      });

      const url = `${this.vouchersApiUrl}?${queryParams.toString()}`;

      const body = {
        idEmpresaLogada: 1737,
        listaIdEmpresas: [1737],
        listaIdCategoria: [],
        tipoHierarquia: "FILHOS",
        ativa: [],
        restricoesCarteira: [{
          id: null,
          classe: { nome: "CLIENTE", descricao: "Cliente", tipo: "AUTOCOMPLETE", selecionada: false },
          limiteUsoItemRestricao: null,
          limiteValorItemRestricao: null,
          itens: []
        }],
        vigente: []
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
        return {
          success: true,
          vouchers: response.data.resultadoPaginado.elementos,
          total: response.data.resultadoPaginado.total,
        };
      }

      throw new Error('Resposta da API não contém dados válidos');
    } catch (error: any) {
      logger.error(`Erro ao buscar vouchers: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Sincroniza vouchers (busca da API e salva no banco)
   */
  async sincronizarVouchers(userId: number, ignorarLock: boolean = false): Promise<{ success: boolean; message: string; total?: number }> {
    const inicio = Date.now();
    let registrosTotal = 0;

    try {
      logger.info(`Iniciando sincronização de vouchers para usuário ${userId}`);

      if (!ignorarLock && VmLavService.activeSyncs.get(userId)) {
        logger.warn(`⚠️ Sincronização de vouchers já em andamento para usuário ${userId}`);
        return {
          success: false,
          message: 'Sincronização já em andamento para este usuário.'
        };
      }

      if (!ignorarLock) {
        VmLavService.activeSyncs.set(userId, true);
      }

      const token = await this.obterTokenParaSincronizacao(userId);

      if (!token) {
        return { success: false, message: 'Token inválido ou expirado.' };
      }

      let todosVouchers: any[] = [];
      let pagina = 0;
      const quantidadePorPagina = 100;
      let totalVouchers = 0;

      do {
        const resultado = await this.buscarVouchers(token, 'lavateriajdnovomundo', pagina, quantidadePorPagina);
        if (!resultado.success || !resultado.vouchers) {
          throw new Error(resultado.error || 'Erro ao buscar vouchers');
        }

        todosVouchers = todosVouchers.concat(resultado.vouchers);
        totalVouchers = resultado.total || 0;

        // Se retornou menos que a quantidade solicitada, não há mais páginas
        if (resultado.vouchers.length < quantidadePorPagina) break;
        if (todosVouchers.length >= totalVouchers) break;

        pagina++;
      } while (pagina < 1000);

      const parseDate = (d: string) => {
        if (!d) return null;
        const [dia, mes, ano] = d.split('/');
        return new Date(`${ano}-${mes}-${dia}`);
      };

      const parseValor = (v: any) => {
        if (v === null || v === undefined) return 0;
        if (typeof v === 'number') return v;
        return parseFloat(String(v).replace('R$', '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.').trim()) || 0;
      };

      const normalizarCpf = (cpf: string): string => {
        const digits = cpf.replace(/\D/g, '');
        if (digits.length === 11) {
          return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
        }
        return cpf; // retornar original se nao tiver 11 digitos
      };

      // API: headers 0=dataCriacao, 1=codigo, 2=categoria, 3=comHierarquia, 4=recorrente, 5=dataRenovacao, 6=validade, 7=valor, 8=saldo, 9=responsavel, 10=carteira, 11=cliente, 12=acoes{idVoucher,ativo}
      const vouchersParaSalvar = todosVouchers.map(row => {
        const clienteFull = (row[11] ?? row[9] ?? '') || '';
        let clienteCpf = null;
        let clienteNome = clienteFull;

        if (clienteFull && typeof clienteFull === 'string' && clienteFull.includes(' - ')) {
          // Se houver múltiplos (ex: "CPF1 - Nome1, CPF2 - Nome2"),
          if (clienteFull.includes(',')) {
            const listParts = clienteFull.split(',').map((s: string) => s.trim());
            const firstPart = listParts[0];
            if (firstPart.includes(' - ')) {
              clienteCpf = normalizarCpf(firstPart.split(' - ')[0].trim());
            }
            clienteNome = clienteFull;
          } else {
            const parts = clienteFull.split(' - ');
            clienteCpf = normalizarCpf(parts[0].trim());
            clienteNome = parts.slice(1).join(' - ').trim();
          }
        }

        const validadeStr = (row[6] ?? row[4] ?? '') || '';
        let validadeInicio = null;
        let validadeFim = null;

        if (validadeStr && typeof validadeStr === 'string' && validadeStr.includes(' ~ ')) {
          try {
            const [ini, fim] = validadeStr.split(' ~ ').map((s: string) => s.trim());
            const parseDateTime = (dt: string) => {
              const [d, t] = dt.split(' ');
              const [dia, mes, ano] = d.split('/');
              return new Date(`${ano}-${mes}-${dia}T${t}`);
            };
            validadeInicio = parseDateTime(ini);
            validadeFim = parseDateTime(fim);
          } catch (e) {
            logger.warn(`Erro ao parsear validade do voucher: ${validadeStr}`);
          }
        }

        const acoes = row[12];
        const idVoucher = (typeof acoes === 'object' && acoes != null && 'idVoucher' in acoes) ? acoes.idVoucher : (typeof row[10] === 'number' ? row[10] : null);
        const ativo = (typeof acoes === 'object' && acoes != null && 'ativo' in acoes) ? acoes.ativo === true : false;

        return {
          user_id: userId,
          id_voucher_vm: idVoucher,
          codigo: row[1],
          categoria_id: row[2]?.id || null,
          categoria_nome: row[2]?.nome || null,
          data_gerado: parseDate(row[0]),
          validade_inicio: validadeInicio,
          validade_fim: validadeFim,
          valor: parseValor(row[7] ?? row[5]),
          saldo: parseValor(row[8] ?? row[6]),
          responsavel: (row[9] ?? row[7]) || null,
          carteira: (row[10] ?? row[8]) ?? null,
          cliente_cpf: clienteCpf ? clienteCpf.substring(0, 20) : null,
          cliente_nome: clienteNome,
          ativo
        };
      }).filter(v => v.id_voucher_vm != null);

      await this.voucherModel.bulkUpsert(vouchersParaSalvar);

      registrosTotal = vouchersParaSalvar.length;
      const duracao = Math.round((Date.now() - inicio) / 1000);

      await this.logModel.create({
        user_id: userId,
        tipo: 'vouchers',
        data_execucao: new Date(),
        registros_novos: 0,
        registros_alterados: 0,
        registros_total: registrosTotal,
        sucesso: true,
        erro: null,
        duracao_segundos: duracao,
      });

      // Marcar premios_clientes como utilizado quando saldo do voucher < 1 (só saldo local)
      await this.marcarPremiosUtilizadosPorSaldoVoucher(userId);

      // Atualizar tabela vm_lav_vouchers_movimentos (API de movimentações)
      const resMov = await this.sincronizarMovimentosVouchers(userId);
      if (!resMov.success) logger.debug(`Sync movimentos vouchers (manual): ${resMov.message}`);

      return {
        success: true,
        message: `${registrosTotal} vouchers sincronizados com sucesso`,
        total: registrosTotal,
      };
    } catch (error: any) {
      logger.error(`Erro ao sincronizar vouchers: ${error.message}`);

      const duracao = Math.round((Date.now() - inicio) / 1000);
      await this.logModel.create({
        user_id: userId,
        tipo: 'vouchers',
        data_execucao: new Date(),
        registros_novos: 0,
        registros_alterados: 0,
        registros_total: 0,
        sucesso: false,
        erro: error.message,
        duracao_segundos: duracao,
      });

      return { success: false, message: error.message };
    } finally {
      if (!ignorarLock) {
        VmLavService.activeSyncs.delete(userId);
      }
    }
  }

  /**
   * Marca premios_clientes como utilizado quando o saldo do voucher em vm_lav_vouchers for < 1.
   * Usa apenas dados locais (sem API). Chamado ao final do sync de vouchers.
   */
  async marcarPremiosUtilizadosPorSaldoVoucher(userId: number): Promise<{ marcados: number }> {
    const conn = await pool.getConnection();
    try {
      const result = await conn.query(
        `UPDATE premios_clientes pc
         INNER JOIN vm_lav_vouchers v ON v.user_id = pc.user_id AND v.codigo = pc.codigo_voucher
         SET pc.utilizado = 1,
             pc.data_utilizacao = COALESCE(v.updated_at, NOW()),
             pc.observacao = COALESCE(pc.observacao, 'Utilizado (saldo zerado no voucher)')
         WHERE pc.user_id = ? AND pc.utilizado = 0 AND pc.codigo_voucher IS NOT NULL AND v.saldo < 1`,
        [userId]
      ) as any;
      const affected = result?.affectedRows ?? result?.[0]?.affectedRows ?? 0;
      if (affected > 0) logger.info(`Prêmios marcados como utilizados por saldo (saldo < 1): ${affected} para usuário ${userId}`);
      return { marcados: affected };
    } catch (error: any) {
      logger.error(`Erro ao marcar prêmios por saldo: ${error.message}`);
      return { marcados: 0 };
    } finally {
      conn.release();
    }
  }

  /**
   * Busca as movimentações de um voucher específico
   */
  async buscarMovimentacoesVoucher(token: string, idVoucherVm: number, empresa: string = 'lavateriajdnovomundo'): Promise<{ success: boolean; elementos?: any[]; error?: string }> {
    try {
      const queryParams = new URLSearchParams({
        execCount: 'true',
        pagina: '0',
        quantidade: '50',
        direcaoOrdenacao: 'DESC',
        campoOrdenacao: 'dataMovimentacao',
      });

      const url = `https://apps.vmhub.vmtecnologia.io/wallet/api/v1/vouchers/${idVoucherVm}/conta/movimentacoes?${queryParams.toString()}`;

      // Configurar período de 30 dias
      const hoje = new Date();
      const trintaDiasAtras = new Date();
      trintaDiasAtras.setDate(hoje.getDate() - 30);

      const body = {
        dataInicio: null,
        dataTermino: null,
        periodoParametrizado: 30,
        periodo: {
          dataInicio: trintaDiasAtras.toISOString(),
          dataTermino: hoje.toISOString()
        }
      };

      const response = await axios.post(url, body, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/plain, */*',
          'Authorization': `Bearer ${token}`,
          'Origin': 'https://vmlav.vmhub.vmtecnologia.io',
          'Referer': 'https://vmlav.vmhub.vmtecnologia.io/',
          'Time-Zone': 'America/Sao_Paulo',
          'X-Vm-App': 'vmlav',
          'X-Vm-Emp': empresa,
        },
        timeout: 60000,
      });

      return {
        success: true,
        elementos: response.data?.elementos || []
      };
    } catch (error: any) {
      logger.error(`Erro ao buscar movimentações do voucher ${idVoucherVm}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Sincroniza a tabela vm_lav_vouchers_movimentos: para cada voucher (Fidelidade/Cortesia, saldo < valor, com CPF, data_gerado >= 2026-01-01),
   * chama a API de movimentações e grava/atualiza os registros. Usado na sync automática e na manual.
   */
  async sincronizarMovimentosVouchers(userId: number): Promise<{ success: boolean; message: string; inseridos?: number }> {
    const conn = await pool.getConnection();
    let totalInseridos = 0;
    try {
      const token = await this.obterTokenParaSincronizacao(userId);
      if (!token) {
        return { success: false, message: 'Token inválido para buscar movimentações.', inseridos: 0 };
      }

      const rows = await conn.query(
        `SELECT id, user_id, id_voucher_vm, codigo FROM vm_lav_vouchers
         WHERE CAST(REPLACE(REPLACE(COALESCE(saldo, '0'), ',', '.'), ' ', '') AS DECIMAL(12,2))
               < CAST(REPLACE(REPLACE(COALESCE(valor, '0'), ',', '.'), ' ', '') AS DECIMAL(12,2))
           AND categoria_nome IN ('Fidelidade', 'Cortesia')
           AND cliente_cpf IS NOT NULL
           AND data_gerado >= '2026-01-01'
           AND user_id = ?
         ORDER BY id`,
        [userId]
      ) as any[];

      const vouchers = Array.isArray(rows) ? rows : [];
      if (vouchers.length === 0) {
        return { success: true, message: 'Nenhum voucher elegível para movimentos.', inseridos: 0 };
      }

      for (const v of vouchers) {
        const movResult = await this.buscarMovimentacoesVoucher(token, v.id_voucher_vm);
        if (!movResult.success) continue;
        const elementos = movResult.elementos || [];
        for (const m of elementos as any[]) {
          const tipoMovimento = m.tipoMovimento ?? null;
          let dataMovimentacao: Date | null = null;
          if (m.dataMovimentacao) {
            const str = m.dataMovimentacao?.endsWith('Z') ? m.dataMovimentacao : m.dataMovimentacao + 'Z';
            dataMovimentacao = new Date(str);
          }
          const valor = m.valor != null ? Math.abs(parseFloat(m.valor)) : null;
          const maquinaProp = m.transacaoConta?.propriedades?.find(
            (p: any) => p.classe?.nome === 'EQUIPAMENTO' || p.propriedade?.tipo?.nome === 'EQUIPAMENTO'
          );
          let equipamentoNumeroSerie: string | null = maquinaProp?.propriedade?.numeroSerie ?? maquinaProp?.propriedade?.descricao ?? null;
          if (equipamentoNumeroSerie) equipamentoNumeroSerie = String(equipamentoNumeroSerie).trim();
          const localProp = m.transacaoConta?.propriedades?.find((p: any) => p.classe?.nome === 'LAVANDERIA');
          const localNome: string | null = localProp?.propriedade?.descricao ?? null;

          try {
            const result = await conn.query(
              `INSERT IGNORE INTO vm_lav_vouchers_movimentos
               (id_voucher_vm, user_id, tipo_movimento, data_movimentacao, valor, equipamento_numero_serie, local_nome)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [v.id_voucher_vm, userId, tipoMovimento, dataMovimentacao, valor, equipamentoNumeroSerie, localNome]
            ) as any;
            if (result?.affectedRows === 1) totalInseridos++;
          } catch (_) {
            // ignora duplicata ou erro pontual
          }
        }
      }

      if (totalInseridos > 0) logger.info(`vm_lav_vouchers_movimentos: ${totalInseridos} movimento(s) inserido(s) para usuário ${userId}`);
      return { success: true, message: `${totalInseridos} movimento(s) sincronizado(s).`, inseridos: totalInseridos };
    } catch (error: any) {
      logger.error(`Erro ao sincronizar movimentos de vouchers: ${error.message}`);
      return { success: false, message: error.message, inseridos: totalInseridos };
    } finally {
      conn.release();
    }
  }

  /**
   * Preenche observação rica (data e local da última retirada) em premios_clientes quando a API de movimentações está disponível.
   * A decisão "utilizado ou não" é feita apenas por marcarPremiosUtilizadosPorSaldoVoucher (saldo < 1).
   */
  async sincronizarUtilizacaoVouchersPremios(userId: number): Promise<{ success: boolean; message: string }> {
    try {
      logger.info(`Iniciando preenchimento de observação de vouchers (API movimentações) para usuário ${userId}`);

      const token = await this.obterTokenParaSincronizacao(userId);
      if (!token) {
        return { success: false, message: 'Token inválido.' };
      }

      const premios = await this.premioClienteModel.findByUserId(userId);
      const premiosComVoucher = premios.filter(p => p.codigo_voucher);

      if (premiosComVoucher.length === 0) {
        return { success: true, message: 'Nenhum prêmio com voucher para enriquecer observação.' };
      }

      let enriquecidos = 0;
      for (const premio of premiosComVoucher) {
        if (!premio.codigo_voucher) continue;

        const vInfo = await this.voucherModel.findByCodigo(premio.codigo_voucher, userId);
        if (!vInfo) continue;

        const movResult = await this.buscarMovimentacoesVoucher(token, vInfo.id_voucher_vm);
        if (!movResult.success || !movResult.elementos) continue;

        const retiradas = movResult.elementos
          .filter((m: any) => m.tipoMovimento === 'RETIRADA')
          .sort((a: any, b: any) => new Date(b.dataMovimentacao).getTime() - new Date(a.dataMovimentacao).getTime());

        if (retiradas.length === 0) continue;

        const ultimaRetirada = retiradas[0];
        const dataUso = new Date(ultimaRetirada.dataMovimentacao);
        const localProp = ultimaRetirada.transacaoConta?.propriedades?.find((p: any) => p.classe?.nome === 'LAVANDERIA');
        const localNome = localProp?.propriedade?.descricao || 'Local não identificado';
        const observacao = `Utilizado em ${dataUso.toLocaleString('pt-BR')} no local: ${localNome}`;

        await pool.query(
          'UPDATE premios_clientes SET observacao = ? WHERE id = ?',
          [observacao, premio.id]
        );
        enriquecidos++;
      }

      if (enriquecidos > 0) logger.info(`Observação rica preenchida para ${enriquecidos} prêmio(s) (usuário ${userId}).`);
      return { success: true, message: 'Observação de vouchers atualizada.' };
    } catch (error: any) {
      logger.error(`Erro ao sincronizar observação de vouchers: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  /**
   * Marca pedidos como pago_com_fidelidade usando a tabela vm_lav_vouchers_movimentos:
   * associa RETIRADAS a pedidos pelo mesmo CPF (normalizado), equipamento, mesma data e diferença <= 10 segundos.
   * Deve rodar após sync de pedidos, vouchers e movimentos (5.2), e antes das notificações (7).
   */
  async marcarPedidosPagosComFidelidadePorMovimentos(userId: number): Promise<{ success: boolean; marcados: number }> {
    const conn = await pool.getConnection();
    let marcados = 0;
    const cpfB = normalizeCpfColumnSql('b.cliente_cpf');
    const cpfC = normalizeCpfColumnSql('c.cliente_cpf');
    try {
      const rows = await conn.query(
        `SELECT c.id
         FROM vm_lav_vouchers_movimentos a
         INNER JOIN vm_lav_vouchers b ON a.id_voucher_vm = b.id_voucher_vm AND b.user_id = a.user_id
         INNER JOIN vm_lav_pedidos c ON c.user_id = a.user_id
           AND ${cpfB} = ${cpfC}
           AND TRIM(COALESCE(c.equipamento_numero_serie, '')) = TRIM(COALESCE(a.equipamento_numero_serie, ''))
           AND DATE(a.data_movimentacao) = DATE(c.data_venda)
           AND c.tipo_pagamento = 'Voucher'
           AND (c.pago_com_fidelidade = 0 OR c.pago_com_fidelidade IS NULL)
           AND ABS(TIMESTAMPDIFF(SECOND, a.data_movimentacao, c.data_venda)) <= 10
         WHERE a.tipo_movimento = 'RETIRADA' AND a.user_id = ?`,
        [userId]
      ) as any[];

      const ids = Array.isArray(rows) ? [...new Set(rows.map((r: any) => r.id).filter((id: any) => id != null))] : [];
      if (ids.length === 0) {
        const [diag] = await conn.query(
          `SELECT
             (SELECT COUNT(*) FROM vm_lav_vouchers_movimentos WHERE user_id = ? AND tipo_movimento = 'RETIRADA' AND equipamento_numero_serie IS NOT NULL AND equipamento_numero_serie != '') AS retiradas_com_serial,
             (SELECT COUNT(*) FROM vm_lav_pedidos WHERE user_id = ? AND tipo_pagamento = 'Voucher' AND (pago_com_fidelidade = 0 OR pago_com_fidelidade IS NULL)) AS pedidos_voucher_nao_marcados`,
          [userId, userId]
        ) as any[];
        const d = Array.isArray(diag) ? diag[0] : diag;
        logger.warn(
          `Fidelidade por movimentos: nenhum pedido encontrado para user ${userId}. ` +
          `Retiradas (com serial): ${(d as any)?.retiradas_com_serial ?? '?'}, pedidos Voucher não marcados: ${(d as any)?.pedidos_voucher_nao_marcados ?? '?'}. ` +
          `Verifique CPF (formato), equipamento_numero_serie, mesma data e janela 10s.`
        );
        return { success: true, marcados: 0 };
      }

      const placeholders = ids.map(() => '?').join(',');
      const result = await conn.query(
        `UPDATE vm_lav_pedidos SET pago_com_fidelidade = 1 WHERE user_id = ? AND id IN (${placeholders})`,
        [userId, ...ids]
      ) as any;
      marcados = result?.affectedRows ?? 0;
      if (marcados > 0) logger.info(`Pedidos marcados como pago com fidelidade (por movimentos): ${marcados} para usuário ${userId}`);
      return { success: true, marcados };
    } catch (error: any) {
      logger.error(`Erro ao marcar pedidos fidelidade por movimentos: ${error.message}`);
      return { success: false, marcados };
    } finally {
      conn.release();
    }
  }

  /**
   * Marca pedidos como pago_com_fidelidade usando apenas vm_lav_vouchers (valor e saldo).
   * Só considera pedidos com tipo_pagamento = 'Voucher'. Não usa updated_at (evita dependência do sync).
   */
  async marcarPedidosPagosComFidelidadePorSaldoVoucher(userId: number): Promise<{ success: boolean; marcados: number }> {
    const conn = await pool.getConnection();
    let totalMarcados = 0;
    try {
      const parseNum = (v: any): number => {
        if (v === null || v === undefined) return 0;
        if (typeof v === 'number') return v;
        return parseFloat(String(v).replace(',', '.').trim()) || 0;
      };

      const [rowsV] = await conn.query(
        `SELECT user_id, cliente_cpf, valor, saldo FROM vm_lav_vouchers
         WHERE user_id = ? AND categoria_nome IN ('Fidelidade', 'Cortesia') AND saldo < valor`,
        [userId]
      ) as any;
      const vouchers = Array.isArray(rowsV) ? (Array.isArray(rowsV[0]) ? rowsV[0] : rowsV) : [];
      if (vouchers.length === 0) return { success: true, marcados: 0 };

      const consumoPorCpf = new Map<string, number>();
      for (const v of vouchers) {
        const cpfNorm = normalizeCpfToDigits(v.cliente_cpf);
        if (!cpfNorm) continue;
        const valor = parseNum(v.valor);
        const saldo = parseNum(v.saldo);
        const consumo = valor - saldo;
        if (consumo <= 0) continue;
        consumoPorCpf.set(cpfNorm, (consumoPorCpf.get(cpfNorm) || 0) + consumo);
      }

      const cpfCol = normalizeCpfColumnSql('cliente_cpf');
      for (const [cpfNorm, totalConsumo] of consumoPorCpf) {
        if (totalConsumo <= 0) continue;
        const [rowsP] = await conn.query(
          `SELECT id, valor_sem_desconto FROM vm_lav_pedidos
           WHERE user_id = ? AND ${cpfCol} = ? AND tipo_pagamento = 'Voucher' AND pago_com_fidelidade = 0
           ORDER BY data_venda ASC`,
          [userId, cpfNorm]
        ) as any;
        const pedidos = Array.isArray(rowsP) ? (Array.isArray(rowsP[0]) ? rowsP[0] : rowsP) : [];
        let running = 0;
        const tolerancia = 1;
        for (const p of pedidos) {
          const valorPed = parseNum(p.valor_sem_desconto);
          if (running + valorPed <= totalConsumo + tolerancia) {
            await conn.query('UPDATE vm_lav_pedidos SET pago_com_fidelidade = 1 WHERE id = ?', [p.id]);
            running += valorPed;
            totalMarcados++;
          }
        }
      }
      if (totalMarcados > 0) logger.info(`Pedidos marcados como pago com fidelidade (por saldo voucher): ${totalMarcados} para usuário ${userId}`);
      return { success: true, marcados: totalMarcados };
    } catch (error: any) {
      logger.error(`Erro ao marcar pedidos por saldo voucher: ${error.message}`);
      return { success: false, marcados: totalMarcados };
    } finally {
      conn.release();
    }
  }

  /**
   * Estratégia combinada: API de movimentações (qual pedido) + saldo em vm_lav_vouchers (teto e fallback).
   * 1) Calcula teto por CPF (soma valor-saldo dos vouchers Fidelidade/Cortesia).
   * 2) Busca retiradas na API e casa cada retirada com 1 ou 2 pedidos (CPF, máquina, data, valor).
   * 3) Aplica teto: só marca pedidos casados pela API até não ultrapassar o consumo do saldo.
   * 4) Fallback: para consumo restante não casado, marca pedidos Voucher por data_venda até o teto.
   */
  async marcarPedidosPagosComFidelidadeCombinado(userId: number): Promise<{ success: boolean; marcados: number }> {
    const conn = await pool.getConnection();
    const TOL = 0.02;
    const JANELA_MIN = 15;
    let totalMarcados = 0;

    const parseNum = (v: any): number => {
      if (v === null || v === undefined) return 0;
      if (typeof v === 'number') return v;
      return parseFloat(String(v).replace(',', '.').trim()) || 0;
    };

    try {
      const cpfCol = normalizeCpfColumnSql('cliente_cpf');

      // —— 1. Teto por CPF (vm_lav_vouchers: Fidelidade/Cortesia, saldo < valor) ——
      const [rowsV] = await conn.query(
        `SELECT user_id, cliente_cpf, valor, saldo FROM vm_lav_vouchers
         WHERE user_id = ? AND categoria_nome IN ('Fidelidade', 'Cortesia') AND saldo < valor`,
        [userId]
      ) as any;
      const vouchers = Array.isArray(rowsV) ? (Array.isArray(rowsV[0]) ? rowsV[0] : rowsV) : [];
      const tetoPorCpf = new Map<string, number>();
      for (const v of vouchers) {
        const cpfNorm = normalizeCpfToDigits(v.cliente_cpf);
        if (!cpfNorm) continue;
        const consumo = parseNum(v.valor) - parseNum(v.saldo);
        if (consumo <= 0) continue;
        tetoPorCpf.set(cpfNorm, (tetoPorCpf.get(cpfNorm) || 0) + consumo);
      }

      // —— 2. Retiradas da API (vouchers Fidelidade/Cortesia) ——
      const retiradas: { valorRetirada: number; dataRetirada: Date; serialMaquina: string; cpfNorm: string }[] = [];
      const token = await this.obterTokenValido(userId);
      if (token) {
        const [rowsVouchersApi] = await conn.query(
          `SELECT id_voucher_vm, cliente_cpf FROM vm_lav_vouchers WHERE user_id = ? AND categoria_nome IN ('Fidelidade', 'Cortesia')`,
          [userId]
        ) as any;
        const vouchersApi = Array.isArray(rowsVouchersApi) ? (Array.isArray(rowsVouchersApi[0]) ? rowsVouchersApi[0] : rowsVouchersApi) : [];
        for (const v of vouchersApi) {
          const movResult = await this.buscarMovimentacoesVoucher(token, v.id_voucher_vm);
          if (!movResult.success || !movResult.elementos) continue;
          const cpfNorm = normalizeCpfToDigits(v.cliente_cpf);
          if (!cpfNorm) continue;
          const lista = (movResult.elementos as any[]).filter((m: any) => m.tipoMovimento === 'RETIRADA');
          for (const r of lista) {
            const dataStr = r.dataMovimentacao?.endsWith('Z') ? r.dataMovimentacao : (r.dataMovimentacao || '') + 'Z';
            const dataRetirada = new Date(dataStr);
            const valorRetirada = Math.abs(parseFloat(r.valor) || 0);
            const maquinaProp = r.transacaoConta?.propriedades?.find((p: any) =>
              p.classe?.nome === 'EQUIPAMENTO' || p.propriedade?.tipo?.nome === 'EQUIPAMENTO'
            );
            let serial = maquinaProp?.propriedade?.numeroSerie || maquinaProp?.propriedade?.descricao;
            if (serial) serial = String(serial).trim();
            if (!serial) continue;
            retiradas.push({ valorRetirada, dataRetirada, serialMaquina: serial, cpfNorm });
          }
        }
      }

      // —— 3. Casar cada retirada com 1 ou 2 pedidos (Voucher, mesmo CPF/máquina, janela de tempo); aplicar teto ——
      const matchedIds = new Set<number>();
      const pedidosPorCpfFromApi = new Map<string, { id: number; valor_sem_desconto: number; data_venda: Date }[]>();

      for (const ret of retiradas) {
        const [rowsC] = await conn.query(
          `SELECT id, valor_sem_desconto, data_venda, valor FROM vm_lav_pedidos
           WHERE user_id = ? AND ${cpfCol} = ? AND tipo_pagamento = 'Voucher' AND pago_com_fidelidade = 0
             AND equipamento_numero_serie = ?
             AND ABS(TIMESTAMPDIFF(MINUTE, data_venda, ?)) <= ?
           ORDER BY data_venda ASC`,
          [userId, ret.cpfNorm, ret.serialMaquina, ret.dataRetirada, JANELA_MIN]
        ) as any;
        const candidatos = Array.isArray(rowsC) ? (Array.isArray(rowsC[0]) ? rowsC[0] : rowsC) : [];
        const disponiveis = candidatos.filter((p: any) => !matchedIds.has(p.id));

        let escolhidos: { id: number; valor_sem_desconto: number; data_venda: Date }[] = [];
        const v = ret.valorRetirada;
        const v1 = disponiveis.find((p: any) => Math.abs(parseNum(p.valor_sem_desconto) - v) <= TOL || (parseNum(p.valor) === 0 && parseNum(p.valor_sem_desconto) > 0));
        if (v1) {
          escolhidos = [{ id: v1.id, valor_sem_desconto: parseNum(v1.valor_sem_desconto), data_venda: v1.data_venda }];
        } else if (disponiveis.length >= 2) {
          const metade = v / 2;
          const dois = disponiveis.filter((p: any) => Math.abs(parseNum(p.valor_sem_desconto) - metade) <= TOL);
          if (dois.length >= 2) {
            escolhidos = [
              { id: dois[0].id, valor_sem_desconto: parseNum(dois[0].valor_sem_desconto), data_venda: dois[0].data_venda },
              { id: dois[1].id, valor_sem_desconto: parseNum(dois[1].valor_sem_desconto), data_venda: dois[1].data_venda },
            ];
          } else if (dois.length === 1 && disponiveis.length >= 2) {
            const outro = disponiveis.find((p: any) => p.id !== dois[0].id && Math.abs(parseNum(p.valor_sem_desconto) + parseNum(dois[0].valor_sem_desconto) - v) <= TOL);
            if (outro) escolhidos = [
              { id: dois[0].id, valor_sem_desconto: parseNum(dois[0].valor_sem_desconto), data_venda: dois[0].data_venda },
              { id: outro.id, valor_sem_desconto: parseNum(outro.valor_sem_desconto), data_venda: outro.data_venda },
            ];
          }
        }
        for (const p of escolhidos) {
          matchedIds.add(p.id);
          const arr = pedidosPorCpfFromApi.get(ret.cpfNorm) || [];
          arr.push(p);
          pedidosPorCpfFromApi.set(ret.cpfNorm, arr);
        }
      }

      // Aplicar teto aos pedidos vindos da API (ordenar por data_venda, cortar onde passar do teto)
      const idsParaMarcar = new Set<number>();
      for (const [cpfNorm, lista] of pedidosPorCpfFromApi) {
        const teto = tetoPorCpf.get(cpfNorm) ?? 0;
        const ordenados = [...lista].sort((a, b) => new Date(a.data_venda).getTime() - new Date(b.data_venda).getTime());
        let running = 0;
        for (const p of ordenados) {
          if (running + p.valor_sem_desconto <= teto + TOL) {
            idsParaMarcar.add(p.id);
            running += p.valor_sem_desconto;
          }
        }
      }

      for (const id of idsParaMarcar) {
        await conn.query('UPDATE vm_lav_pedidos SET pago_com_fidelidade = 1 WHERE id = ?', [id]);
        totalMarcados++;
      }

      // —— 4. Fallback por saldo: consumo restante não coberto pela API ——
      for (const [cpfNorm, teto] of tetoPorCpf) {
        if (teto <= 0) continue;
        const resSum = await conn.query(
          `SELECT COALESCE(SUM(valor_sem_desconto), 0) as s FROM vm_lav_pedidos WHERE user_id = ? AND ${cpfCol} = ? AND pago_com_fidelidade = 1`,
          [userId, cpfNorm]
        ) as any;
        const rowsSum = resSum[0];
        const firstRow = (Array.isArray(rowsSum) ? rowsSum[0] : rowsSum) as { s?: number } | undefined;
        const jaMarcado = parseNum(firstRow?.s ?? 0);
        const resto = teto - jaMarcado;
        if (resto <= TOL) continue;
        const [rowsP] = await conn.query(
          `SELECT id, valor_sem_desconto FROM vm_lav_pedidos
           WHERE user_id = ? AND ${cpfCol} = ? AND tipo_pagamento = 'Voucher' AND pago_com_fidelidade = 0
           ORDER BY data_venda ASC`,
          [userId, cpfNorm]
        ) as any;
        const pedidos = Array.isArray(rowsP) ? (Array.isArray(rowsP[0]) ? rowsP[0] : rowsP) : [];
        let running = jaMarcado;
        for (const p of pedidos) {
          const valorPed = parseNum(p.valor_sem_desconto);
          if (running + valorPed <= teto + TOL) {
            await conn.query('UPDATE vm_lav_pedidos SET pago_com_fidelidade = 1 WHERE id = ?', [p.id]);
            running += valorPed;
            totalMarcados++;
          }
        }
      }

      if (totalMarcados > 0) logger.info(`Pedidos marcados como pago com fidelidade (combinado API+saldo): ${totalMarcados} para usuário ${userId}`);
      return { success: true, marcados: totalMarcados };
    } catch (error: any) {
      logger.error(`Erro ao marcar pedidos fidelidade (combinado): ${error.message}`);
      return { success: false, marcados: totalMarcados };
    } finally {
      conn.release();
    }
  }

  /**
   * Identifica e marca pedidos que foram pagos com vouchers da categoria 'Fidelidade'
   * (usa apenas API de movimentações; mantido para compatibilidade / uso manual)
   */
  async marcarPedidosPagosComVoucherFidelidade(userId: number): Promise<{ success: boolean; marcados: number }> {
    try {
      logger.info(`Iniciando marcação de pedidos pagos com voucher de fidelidade para usuário ${userId}`);

      const token = await this.obterTokenValido(userId);
      if (!token) {
        throw new Error('Token inválido para marcar pedidos fidelidade');
      }

      const conn = await pool.getConnection();
      let marcados = 0;

      try {
        const queryVouchers = `SELECT id_voucher_vm, codigo, cliente_cpf FROM vm_lav_vouchers WHERE user_id = ? AND categoria_nome IN ('Fidelidade', 'Cortesia')`;
        const vouchersResult = await conn.query(queryVouchers, [userId]) as any;

        let vouchers: any[] = [];
        if (Array.isArray(vouchersResult)) {
          vouchers = Array.isArray(vouchersResult[0]) ? vouchersResult[0] : vouchersResult;
        }

        const cpfCol = normalizeCpfColumnSql('cliente_cpf');

        for (const v of vouchers) {
          const movResult = await this.buscarMovimentacoesVoucher(token, v.id_voucher_vm);
          if (!movResult.success || !movResult.elementos) continue;

          const retiradas = movResult.elementos.filter((m: any) => m.tipoMovimento === 'RETIRADA');

          for (const retirada of retiradas) {
            const dataString = retirada.dataMovimentacao?.endsWith('Z') ? retirada.dataMovimentacao : retirada.dataMovimentacao + 'Z';
            const dataRetirada = new Date(dataString);
            const valorRetirada = Math.abs(parseFloat(retirada.valor));

            const maquinaProp = retirada.transacaoConta?.propriedades?.find((p: any) =>
              p.classe?.nome === 'EQUIPAMENTO' || p.propriedade?.tipo?.nome === 'EQUIPAMENTO'
            );
            let serialMaquina = maquinaProp?.propriedade?.numeroSerie || maquinaProp?.propriedade?.descricao;
            if (serialMaquina) serialMaquina = String(serialMaquina).trim();

            if (!serialMaquina || !v.cliente_cpf) continue;

            const cpfNorm = normalizeCpfToDigits(v.cliente_cpf);
            if (!cpfNorm) continue;

            const queryPedido = `
              UPDATE vm_lav_pedidos 
              SET pago_com_fidelidade = 1 
              WHERE user_id = ? 
                AND ${cpfCol} = ? 
                AND equipamento_numero_serie = ? 
                AND valor = 0
                AND ABS(TIMESTAMPDIFF(MINUTE, data_venda, ?)) <= 5
                AND pago_com_fidelidade = 0
                AND tipo_pagamento = 'Voucher'
            `;
            const result = await conn.query(queryPedido, [userId, cpfNorm, serialMaquina, dataRetirada]) as any;

            if (result.affectedRows === 0) {
              const queryPedidoValor = `
                UPDATE vm_lav_pedidos 
                SET pago_com_fidelidade = 1 
                WHERE user_id = ? 
                  AND ${cpfCol} = ? 
                  AND equipamento_numero_serie = ? 
                  AND valor_sem_desconto >= ?
                  AND ABS(TIMESTAMPDIFF(MINUTE, data_venda, ?)) <= 5
                  AND pago_com_fidelidade = 0
                  AND tipo_pagamento = 'Voucher'
              `;
              const resultValor = await conn.query(queryPedidoValor, [userId, cpfNorm, serialMaquina, valorRetirada, dataRetirada]) as any;
              if (resultValor.affectedRows > 0) marcados++;
            } else {
              marcados++;
            }
          }
        }

        logger.info(`Marcação concluída: ${marcados} pedidos identificados como pagamento via fidelidade.`);
        return { success: true, marcados };
      } finally {
        conn.release();
      }
    } catch (error: any) {
      logger.error(`Erro ao marcar pedidos fidelidade: ${error.message}`);
      return { success: false, marcados: 0 };
    }
  }

}

