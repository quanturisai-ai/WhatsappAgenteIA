import logger from '../utils/logger';
import { FidelizacaoConfigModel, FidelizacaoConfig } from '../models/fidelizacaoConfig.model';
import { FidelizacaoNotificacaoModel } from '../models/fidelizacaoNotificacao.model';
import { VmLavClienteModel, VmLavCliente } from '../models/vmLavCliente.model';
import { PremioModel, Premio } from '../models/premio.model';
import { PremioClienteModel, PremioCliente } from '../models/premioCliente.model';
import { FidelizacaoService, SaldoFidelidade } from './fidelizacao.service';
import { WhatsAppManager } from './whatsapp.manager';

export interface ResultadoNotificacao {
  notificacoesEnviadas: number;
  notificacoesSimuladas: number;
  erros: number;
}

export class FidelizacaoNotificacaoService {
  private configModel: FidelizacaoConfigModel;
  private notificacaoModel: FidelizacaoNotificacaoModel;
  private clienteModel: VmLavClienteModel;
  private premioModel: PremioModel;
  private premioClienteModel: PremioClienteModel;
  private fidelizacaoService: FidelizacaoService;

  constructor() {
    this.configModel = new FidelizacaoConfigModel();
    this.notificacaoModel = new FidelizacaoNotificacaoModel();
    this.clienteModel = new VmLavClienteModel();
    this.premioModel = new PremioModel();
    this.premioClienteModel = new PremioClienteModel();
    this.fidelizacaoService = new FidelizacaoService();
  }

  /**
   * Processa notificações para um cliente após sincronização de pedidos
   * @param userId ID do usuário
   * @param cpf CPF do cliente
   * @param premiosConcedidos Lista de prêmios recém-concedidos (retornado por apurarEConcederPremios)
   */
  async processarNotificacoes(
    userId: number,
    cpf: string,
    premiosConcedidos: PremioCliente[]
  ): Promise<ResultadoNotificacao> {
    const resultado: ResultadoNotificacao = {
      notificacoesEnviadas: 0,
      notificacoesSimuladas: 0,
      erros: 0,
    };

    try {
      // Buscar ou criar configuração
      const config = await this.configModel.getOrCreateDefault(userId);

      // Buscar dados do cliente por CPF
      const cliente = await this.buscarClientePorCpf(userId, cpf);

      if (!cliente) {
        logger.warn(`Cliente com CPF ${cpf} não encontrado para notificações`);
        return resultado;
      }

      if (!cliente.telefone) {
        logger.warn(`Cliente ${cpf} não possui telefone cadastrado`);
        return resultado;
      }

      // Processar notificações de conquista
      if (config.notificar_conquistas && premiosConcedidos.length > 0) {
        for (const premioConcedido of premiosConcedidos) {
          try {
            const premio = await this.premioModel.findById(premioConcedido.premio_id);
            if (!premio) {
              continue;
            }
            if (premio.entrega_automatico) {
              continue;
            }

            const mensagem = this.processarTemplateConquista(
              config.template_mensagem_conquista || this.getTemplateConquistaPadrao(),
              cliente.nome || 'Cliente',
              premio
            );

            // Salvar no histórico primeiro
            const notificacao = await this.notificacaoModel.create({
              user_id: userId,
              cpf_cliente: cpf,
              pedido_id: null,
              data_venda: new Date(),
              tipo_notificacao: 'CONQUISTA',
              premio_id: premio.id,
              regra_id: null,
              mensagem_enviada: mensagem,
              enviado_whatsapp: false,
              data_envio: new Date(),
              erro: null,
            });

            // Enviar via WhatsApp se não estiver em simulação
            if (!config.simulacao) {
              try {
                const whatsappManager = WhatsAppManager.getInstance();
                const whatsappService = whatsappManager.getServiceSync(userId);

                if (whatsappService && whatsappService.isReady()) {
                  await whatsappService.sendMessage(cliente.telefone, mensagem);
                  // Atualizar como enviado
                  await this.notificacaoModel.update(notificacao.id, { enviado_whatsapp: true });
                  resultado.notificacoesEnviadas++;
                  logger.info(`Notificação de conquista enviada para cliente ${cpf} (prêmio: ${premio.descricao})`);
                } else {
                  const erro = 'WhatsApp não está pronto';
                  await this.notificacaoModel.update(notificacao.id, { erro });
                  resultado.erros++;
                  logger.warn(`Não foi possível enviar notificação de conquista para ${cpf}: ${erro}`);
                }
              } catch (error: any) {
                const erroMsg = error.message || 'Erro desconhecido ao enviar WhatsApp';
                await this.notificacaoModel.update(notificacao.id, { erro: erroMsg });
                resultado.erros++;
                logger.error(`Erro ao enviar notificação de conquista para ${cpf}: ${erroMsg}`);
              }
            } else {
              resultado.notificacoesSimuladas++;
              logger.info(`[SIMULAÇÃO] Notificação de conquista processada para cliente ${cpf} (prêmio: ${premio.descricao})`);
            }
          } catch (error: any) {
            resultado.erros++;
            logger.error(`Erro ao processar notificação de conquista para ${cpf}: ${error.message}`);
          }
        }
      }

      // Processar notificação de progresso
      if (config.notificar_progresso) {
        try {
          const deveEnviar = await this.verificarSeDeveEnviarProgresso(userId, cpf, config);

          if (deveEnviar) {
            const saldos = await this.obterSaldosFidelidade(userId, cpf);
            const mensagem = this.processarTemplateProgresso(
              config.template_mensagem_progresso || this.getTemplateProgressoPadrao(),
              cliente.nome || 'Cliente',
              saldos
            );

            // Salvar no histórico primeiro
            const notificacao = await this.notificacaoModel.create({
              user_id: userId,
              cpf_cliente: cpf,
              pedido_id: null,
              data_venda: new Date(),
              tipo_notificacao: 'PROGRESSO',
              premio_id: null,
              regra_id: null,
              mensagem_enviada: mensagem,
              enviado_whatsapp: false,
              data_envio: new Date(),
              erro: null,
            });

            // Enviar via WhatsApp se não estiver em simulação
            if (!config.simulacao) {
              try {
                const whatsappManager = WhatsAppManager.getInstance();
                const whatsappService = whatsappManager.getServiceSync(userId);

                if (whatsappService && whatsappService.isReady()) {
                  await whatsappService.sendMessage(cliente.telefone, mensagem);
                  // Atualizar como enviado
                  await this.notificacaoModel.update(notificacao.id, { enviado_whatsapp: true });
                  resultado.notificacoesEnviadas++;
                  logger.info(`Notificação de progresso enviada para cliente ${cpf}`);
                } else {
                  const erro = 'WhatsApp não está pronto';
                  await this.notificacaoModel.update(notificacao.id, { erro });
                  resultado.erros++;
                  logger.warn(`Não foi possível enviar notificação de progresso para ${cpf}: ${erro}`);
                }
              } catch (error: any) {
                const erroMsg = error.message || 'Erro desconhecido ao enviar WhatsApp';
                await this.notificacaoModel.update(notificacao.id, { erro: erroMsg });
                resultado.erros++;
                logger.error(`Erro ao enviar notificação de progresso para ${cpf}: ${erroMsg}`);
              }
            } else {
              resultado.notificacoesSimuladas++;
              logger.info(`[SIMULAÇÃO] Notificação de progresso processada para cliente ${cpf}`);
            }
          }
        } catch (error: any) {
          resultado.erros++;
          logger.error(`Erro ao processar notificação de progresso para ${cpf}: ${error.message}`);
        }
      }

      return resultado;
    } catch (error: any) {
      logger.error(`Erro ao processar notificações para cliente ${cpf}: ${error.message}`);
      resultado.erros++;
      return resultado;
    }
  }

  /**
   * Envia notificação manual de entrega de prêmio com código de voucher
   * @param options.marcarDataEntrega — após envio bem-sucedido, grava data_entrega em premios_clientes
   * @param options.apenasSeAutomatico — só envia se o prêmio tiver entrega_automatico (fluxo VM)
   */
  async enviarNotificacaoEntregaPremio(
    userId: number,
    premioClienteId: number,
    mensagemPersonalizada?: string,
    options?: { marcarDataEntrega?: boolean; apenasSeAutomatico?: boolean }
  ): Promise<boolean> {
    try {
      const premioCliente = await this.premioClienteModel.findById(premioClienteId);
      if (!premioCliente) {
        throw new Error('Prêmio do cliente não encontrado');
      }

      const premioRow = await this.premioModel.findById(premioCliente.premio_id);
      if (options?.apenasSeAutomatico && !premioRow?.entrega_automatico) {
        return false;
      }

      const cliente = await this.buscarClientePorCpf(userId, premioCliente.cpf_cliente);
      if (!cliente || !cliente.telefone) {
        throw new Error('Cliente não encontrado ou sem telefone');
      }

      let mensagem = mensagemPersonalizada;
      if (!mensagem) {
        const config = await this.configModel.getOrCreateDefault(userId);
        if (premioRow) {
          mensagem = this.processarTemplateEntrega(
            config.template_mensagem_entrega || this.getTemplateEntregaPadrao(),
            cliente.nome || 'Cliente',
            premioRow,
            premioCliente.codigo_voucher,
            premioCliente.data_validade ? new Date(premioCliente.data_validade) : null
          );
        } else {
          mensagem = "Você recebeu um prêmio!";
        }
      }

      // Send via WhatsApp
      const whatsappManager = WhatsAppManager.getInstance();
      const whatsappService = whatsappManager.getServiceSync(userId);

      if (whatsappService && whatsappService.isReady()) {
        await whatsappService.sendMessage(cliente.telefone, mensagem);

        // Log notification
        await this.notificacaoModel.create({
          user_id: userId,
          cpf_cliente: premioCliente.cpf_cliente,
          pedido_id: null,
          regra_id: null,
          data_venda: new Date(), // Delivery moment as reference
          tipo_notificacao: 'ENTREGA',
          premio_id: premioCliente.premio_id,
          mensagem_enviada: mensagem,
          enviado_whatsapp: true,
          data_envio: new Date(),
          erro: null,
        });

        logger.info(`Notificação de entrega de prêmio enviada para cliente ${premioCliente.cpf_cliente}`);
        if (options?.marcarDataEntrega) {
          await this.premioClienteModel.updateAutomacao(premioClienteId, {
            data_entrega: new Date(),
          });
        }
        return true;
      } else {
        throw new Error('WhatsApp não está pronto');
      }
    } catch (error: any) {
      logger.error(`Erro ao enviar notificação de entrega de prêmio: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fallback automático: mensagem de conquista quando não há voucher para entrega automática.
   * Cria ou reutiliza linha em fidelizacao_notificacoes; grava conquista_notificacao_id em premios_clientes.
   * Reenvia se a notificação existir mas não tiver sido enviada ao WhatsApp.
   */
  async enviarOuRetentarConquistaFallback(
    userId: number,
    pc: PremioCliente,
    premio: Premio,
    config: FidelizacaoConfig
  ): Promise<void> {
    const cliente = await this.buscarClientePorCpf(userId, pc.cpf_cliente);
    if (!cliente || !cliente.telefone) {
      logger.warn(
        `[ConquistaFallback] Cliente sem telefone (premio_cliente ${pc.id}, CPF ${pc.cpf_cliente})`
      );
      return;
    }

    const mensagemBase = this.processarTemplateConquista(
      config.template_mensagem_conquista || this.getTemplateConquistaPadrao(),
      cliente.nome || 'Cliente',
      premio
    );

    let notif = pc.conquista_notificacao_id
      ? await this.notificacaoModel.findById(pc.conquista_notificacao_id)
      : null;

    if (pc.conquista_notificacao_id && !notif) {
      await this.premioClienteModel.updateAutomacao(pc.id, { conquista_notificacao_id: null });
    }

    if (notif) {
      if (notif.user_id !== userId) {
        logger.warn(`[ConquistaFallback] Notificação ${notif.id} não pertence ao user ${userId}`);
        return;
      }
      if (notif.enviado_whatsapp) {
        return;
      }

      const mensagem = notif.mensagem_enviada || mensagemBase;

      if (config.simulacao) {
        logger.info(
          `[SIMULAÇÃO] Retentativa conquista fallback premio_cliente ${pc.id} (notif ${notif.id})`
        );
        return;
      }

      const whatsappManager = WhatsAppManager.getInstance();
      const whatsappService = whatsappManager.getServiceSync(userId);

      try {
        if (whatsappService && whatsappService.isReady()) {
          await whatsappService.sendMessage(cliente.telefone, mensagem);
          await this.notificacaoModel.update(notif.id, { enviado_whatsapp: true, erro: null });
          logger.info(`[ConquistaFallback] Reenvio conquista OK premio_cliente ${pc.id} (notif ${notif.id})`);
        } else {
          await this.notificacaoModel.update(notif.id, { erro: 'WhatsApp não está pronto' });
        }
      } catch (error: any) {
        const erroMsg = error.message || 'Erro ao enviar WhatsApp';
        await this.notificacaoModel.update(notif.id, { erro: erroMsg });
        logger.error(`[ConquistaFallback] Falha reenvio premio_cliente ${pc.id}: ${erroMsg}`);
      }
      return;
    }

    const notificacao = await this.notificacaoModel.create({
      user_id: userId,
      cpf_cliente: pc.cpf_cliente,
      pedido_id: null,
      regra_id: null,
      data_venda: new Date(),
      tipo_notificacao: 'CONQUISTA',
      premio_id: premio.id,
      mensagem_enviada: mensagemBase,
      enviado_whatsapp: false,
      data_envio: new Date(),
      erro: null,
    });

    await this.premioClienteModel.updateAutomacao(pc.id, {
      conquista_notificacao_id: notificacao.id,
    });

    if (config.simulacao) {
      logger.info(
        `[SIMULAÇÃO] Conquista fallback registrada premio_cliente ${pc.id} (notif ${notificacao.id})`
      );
      return;
    }

    const whatsappManager = WhatsAppManager.getInstance();
    const whatsappService = whatsappManager.getServiceSync(userId);

    try {
      if (whatsappService && whatsappService.isReady()) {
        await whatsappService.sendMessage(cliente.telefone, mensagemBase);
        await this.notificacaoModel.update(notificacao.id, { enviado_whatsapp: true, erro: null });
        logger.info(
          `[ConquistaFallback] Conquista fallback enviada premio_cliente ${pc.id} (notif ${notificacao.id})`
        );
      } else {
        await this.notificacaoModel.update(notificacao.id, { erro: 'WhatsApp não está pronto' });
      }
    } catch (error: any) {
      const erroMsg = error.message || 'Erro ao enviar WhatsApp';
      await this.notificacaoModel.update(notificacao.id, { erro: erroMsg });
      logger.error(`[ConquistaFallback] Falha envio premio_cliente ${pc.id}: ${erroMsg}`);
    }
  }

  /**
   * Verifica se deve enviar notificação de progresso baseado na configuração
   */
  private async verificarSeDeveEnviarProgresso(
    userId: number,
    cpf: string,
    config: FidelizacaoConfig
  ): Promise<boolean> {
    if (config.frequencia_progresso === 'sempre') {
      return true;
    }

    // Obter saldos atuais
    const saldos = await this.obterSaldosFidelidade(userId, cpf);

    // Calcular percentuais
    const percentLav = this.calcularPercentual(saldos.lavagens);
    const percentSec = this.calcularPercentual(saldos.secagens);
    const percentTotal = this.calcularPercentual(saldos.total);
    const maiorPercentual = Math.max(percentLav, percentSec, percentTotal);

    if (config.frequencia_progresso === 'marcos') {
      // Verificar se está em um marco (25%, 50%, 75%, 90%)
      const ultimaNotificacao = await this.notificacaoModel.findUltimaNotificacaoProgresso(userId, cpf);

      if (!ultimaNotificacao) {
        // Primeira notificação, enviar se estiver em algum marco
        return this.estaEmMarco(maiorPercentual);
      }

      // Extrair percentual da última mensagem (buscar no texto ou usar lógica diferente)
      // Por simplicidade, vamos verificar se cruzou um marco desde a última notificação
      // Vamos usar uma abordagem mais simples: verificar se está em um marco e não estava antes
      // Para isso, precisaríamos salvar o percentual na notificação, mas por enquanto vamos usar uma heurística
      // Se não houver histórico recente (últimas 24h), enviar se estiver em marco
      const horasDesdeUltimaNotificacao = (new Date().getTime() - ultimaNotificacao.data_envio.getTime()) / (1000 * 60 * 60);
      if (horasDesdeUltimaNotificacao > 24) {
        return this.estaEmMarco(maiorPercentual);
      }

      // Se houve notificação recente, não enviar novamente (evitar spam)
      return false;
    }

    if (config.frequencia_progresso === 'mudanca_significativa') {
      const ultimaNotificacao = await this.notificacaoModel.findUltimaNotificacaoProgresso(userId, cpf);

      if (!ultimaNotificacao) {
        // Primeira notificação, enviar
        return true;
      }

      // Extrair percentual da última mensagem é complexo, então vamos usar uma abordagem diferente:
      // Buscar saldos anteriores seria ideal, mas não temos isso salvo
      // Por enquanto, vamos enviar apenas se passou muito tempo desde a última notificação
      // OU se o percentual atual é muito alto (próximo de conquistar)
      const horasDesdeUltimaNotificacao = (new Date().getTime() - ultimaNotificacao.data_envio.getTime()) / (1000 * 60 * 60);

      // Se passou mais de 7 dias, enviar
      if (horasDesdeUltimaNotificacao > 168) {
        return true;
      }

      // Se está próximo de conquistar (>= 90%), enviar
      if (maiorPercentual >= 90) {
        return true;
      }

      // Por enquanto, não enviar se houve notificação recente
      // TODO: Melhorar isso salvando percentual na notificação
      return false;
    }

    return false;
  }

  /**
   * Verifica se um percentual está em um marco (25%, 50%, 75%, 90%)
   */
  private estaEmMarco(percentual: number): boolean {
    const marcos = [25, 50, 75, 90];
    return marcos.some(marco => percentual >= marco && percentual < marco + 5); // Margem de 5% para evitar múltiplos envios
  }

  /**
   * Calcula percentual de cumprimento
   */
  private calcularPercentual(saldo: SaldoFidelidade): number {
    if (!saldo.proximoObjetivo || saldo.proximoObjetivo === 0) {
      return 100;
    }
    return Math.min(100, Math.round((saldo.atual / saldo.proximoObjetivo) * 100));
  }

  /**
   * Busca cliente por CPF
   */
  private async buscarClientePorCpf(userId: number, cpf: string): Promise<VmLavCliente | null> {
    const clientes = await this.clienteModel.findByUserId(userId, 1, 10000);
    return clientes.clientes.find(c => c.cpf === cpf) || null;
  }

  /**
   * Obtém saldos de fidelidade para um cliente
   */
  private async obterSaldosFidelidade(
    userId: number,
    cpf: string
  ): Promise<{
    lavagens: SaldoFidelidade;
    secagens: SaldoFidelidade;
    total: SaldoFidelidade;
  }> {
    const cliente = await this.buscarClientePorCpf(userId, cpf);
    const dataBase = cliente?.data_cadastro || new Date();

    const saldoLavagens = await this.fidelizacaoService.calcularSaldoFidelidade(userId, cpf, 'LAVAGEM', dataBase);
    const saldoSecagens = await this.fidelizacaoService.calcularSaldoFidelidade(userId, cpf, 'SECAGEM', dataBase);
    const saldoTotal = await this.fidelizacaoService.calcularSaldoFidelidade(userId, cpf, 'TOTAL', dataBase);

    return {
      lavagens: saldoLavagens,
      secagens: saldoSecagens,
      total: saldoTotal,
    };
  }

  /**
   * Extrai o primeiro nome do nome completo
   */
  private extrairPrimeiroNome(nomeCompleto: string): string {
    if (!nomeCompleto || nomeCompleto.trim() === '') {
      return 'Cliente';
    }

    const partes = nomeCompleto.trim().split(/\s+/);
    return partes[0] || 'Cliente';
  }

  /**
   * Processa template de mensagem de conquista.
   * {data_validade} vira "Válido até dd/mm/aaaa" (calculado a partir de validade_dias).
   */
  private processarTemplateConquista(template: string, nome: string, premio: Premio): string {
    let mensagem = template;

    const primeiroNome = this.extrairPrimeiroNome(nome);
    mensagem = mensagem.replace(/{nome}/g, nome);
    mensagem = mensagem.replace(/{primeiro_nome}/g, primeiroNome);
    mensagem = mensagem.replace(/{descricao_premio}/g, premio.descricao);

    if (premio.validade_dias) {
      const dataValidade = new Date();
      dataValidade.setDate(dataValidade.getDate() + premio.validade_dias);
      const dataValidadeStr = dataValidade.toLocaleDateString('pt-BR');
      mensagem = mensagem.replace(/{data_validade}/g, `Válido até ${dataValidadeStr}`);
      mensagem = mensagem.replace(/{validade_dias}/g, String(premio.validade_dias));
    } else {
      mensagem = mensagem.replace(/{data_validade}/g, '');
      mensagem = mensagem.replace(/{validade_dias}/g, '');
    }

    mensagem = mensagem.replace(/\n{3,}/g, '\n\n');
    return mensagem.trim();
  }

  /**
   * Processa template de mensagem de entrega (voucher).
   * {data_validade} = só a data do voucher em pt-BR (sem prefixo — o template pode adicionar "Válido até:").
   * {voucher_codigo} = código do voucher.
   */
  private processarTemplateEntrega(
    template: string,
    nome: string,
    premio: Premio,
    codigoVoucher: string | null,
    dataValidade: Date | null
  ): string {
    let mensagem = template;

    const primeiroNome = this.extrairPrimeiroNome(nome);
    mensagem = mensagem.replace(/{nome}/g, nome);
    mensagem = mensagem.replace(/{primeiro_nome}/g, primeiroNome);
    mensagem = mensagem.replace(/{descricao_premio}/g, premio.descricao);

    if (premio.validade_dias) {
      mensagem = mensagem.replace(/{validade_dias}/g, String(premio.validade_dias));
    } else {
      mensagem = mensagem.replace(/{validade_dias}/g, '');
    }

    const dataFmt = dataValidade
      ? dataValidade.toLocaleDateString('pt-BR')
      : '';
    mensagem = mensagem.replace(/{data_validade}/g, dataFmt);

    mensagem = mensagem.replace(/{voucher_codigo}/g, codigoVoucher || '');

    mensagem = mensagem.replace(/\n{3,}/g, '\n\n');
    return mensagem.trim();
  }

  /**
   * Gera uma barra de progresso com emojis
   */
  private gerarBarraEmojis(atual: number, objetivo: number): string {
    if (!objetivo || objetivo <= 0) return '';
    const tamanhoBarra = 10;
    const preenchidos = Math.min(tamanhoBarra, Math.floor((atual / objetivo) * tamanhoBarra));
    const vazios = tamanhoBarra - preenchidos;
    return '✅'.repeat(preenchidos) + '⬜'.repeat(vazios);
  }

  /**
   * Gera o texto de "faltam X" com singular/plural correto
   */
  private getFaltamTexto(faltam: number, unidade: string): string {
    if (faltam <= 0) return `Você já pode resgatar seu prêmio!`;
    const termo = faltam === 1 ? 'Falta apenas' : 'Faltam apenas';

    let unidadeTexto = unidade;
    if (faltam > 1) {
      if (unidade.endsWith('m')) {
        unidadeTexto = unidade.slice(0, -1) + 'ns';
      } else if (unidade.endsWith('ão')) {
        unidadeTexto = unidade.slice(0, -2) + 'ões';
      } else {
        unidadeTexto = `${unidade}s`;
      }
    }

    return `${termo} ${faltam} ${unidadeTexto}`;
  }

  /**
   * Processa template de mensagem de progresso
   */
  private processarTemplateProgresso(
    template: string,
    nome: string,
    saldos: {
      lavagens: SaldoFidelidade;
      secagens: SaldoFidelidade;
      total: SaldoFidelidade;
    }
  ): string {
    let mensagem = template;

    // Utilitário para substituição em massa por categoria
    const substituirCategoria = (prefixo: string, saldo: SaldoFidelidade, unidade: string) => {
      const atual = saldo.atual;
      const objetivo = saldo.proximoObjetivo || 0;
      const faltam = saldo.faltam;
      const percentual = this.calcularPercentual(saldo);

      mensagem = mensagem.replace(new RegExp(`{${prefixo}_atual}`, 'g'), String(atual));
      mensagem = mensagem.replace(new RegExp(`{${prefixo}_objetivo}`, 'g'), String(objetivo));
      mensagem = mensagem.replace(new RegExp(`{${prefixo}_percentual}`, 'g'), String(percentual));
      mensagem = mensagem.replace(new RegExp(`{${prefixo}_faltam}`, 'g'), String(faltam));
      mensagem = mensagem.replace(new RegExp(`{${prefixo}_proximo_premio}`, 'g'), saldo.proximoPremio || 'Prêmio Indisponível');
      mensagem = mensagem.replace(new RegExp(`{${prefixo}_barra}`, 'g'), this.gerarBarraEmojis(atual, objetivo));
      mensagem = mensagem.replace(new RegExp(`{${prefixo}_faltam_texto}`, 'g'), this.getFaltamTexto(faltam, unidade));
    };

    substituirCategoria('lavagens', saldos.lavagens, 'lavagem');
    substituirCategoria('secagens', saldos.secagens, 'secagem');
    substituirCategoria('total', saldos.total, 'utilização');

    // Extrair primeiro nome
    const primeiroNome = this.extrairPrimeiroNome(nome);

    // Substituir nome
    mensagem = mensagem.replace(/{nome}/g, nome);
    mensagem = mensagem.replace(/{primeiro_nome}/g, primeiroNome);

    // Limpar linhas vazias extras
    mensagem = mensagem.replace(/\n{3,}/g, '\n\n');

    return mensagem.trim();
  }


  /**
   * Template padrão de conquista
   */
  private getTemplateConquistaPadrao(): string {
    return `🎉 Parabéns, {nome}!

Você conquistou um novo prêmio:
{descricao_premio}

{data_validade}

Continue utilizando nossos serviços para ganhar mais prêmios!`;
  }

  /** Padrão apenas quando template_mensagem_entrega na config está vazio (não reutiliza texto de conquista). */
  private getTemplateEntregaPadrao(): string {
    return `Olá, {nome}!

Segue a entrega do seu prêmio: {descricao_premio}

{data_validade}

Use o código e a validade informados abaixo ao utilizar o voucher.`;
  }

  /**
   * Após falha no envio da mensagem de entrega (ou erro equivalente), dispara conquista com template da tabela.
   */
  async dispararConquistaAposFalhaEntrega(userId: number, premioClienteId: number): Promise<void> {
    const config = await this.configModel.getOrCreateDefault(userId);
    if (!config.notificar_conquistas) {
      return;
    }
    const pc = await this.premioClienteModel.findById(premioClienteId);
    if (!pc) {
      return;
    }
    const premio = await this.premioModel.findById(pc.premio_id);
    if (!premio) {
      return;
    }
    await this.enviarOuRetentarConquistaFallback(userId, pc, premio, config);
  }

  /**
   * Template padrão de progresso
   */
  private getTemplateProgressoPadrao(): string {
    return `Olá, {primeiro_nome}! 👋
Veja seu progresso na fidelidade:

Prêmio: {lavagens_proximo_premio}
{lavagens_barra}
• {lavagens_faltam_texto}

Prêmio: {secagens_proximo_premio}
{secagens_barra}
• {secagens_faltam_texto}

Continue assim! 🚀`;
  }

  /**
   * Envia notificação de progresso para um pedido específico (automatizado)
   * Este método é chamado apenas para pedidos que ainda não foram notificados
   */
  async enviarNotificacaoProgressoPorPedido(
    userId: number,
    cpf: string,
    pedidoId: number,
    dataVenda: Date // Momento exato da venda para idempotência
  ): Promise<void> {
    const config = await this.configModel.getOrCreateDefault(userId);

    if (!config.notificar_progresso) {
      return;
    }

    const cliente = await this.buscarClientePorCpf(userId, cpf);
    if (!cliente || !cliente.telefone) {
      logger.warn(`Cliente ${cpf} não encontrado ou sem telefone para notificação de progresso (pedido ${pedidoId})`);
      return;
    }

    try {
      const saldos = await this.obterSaldosFidelidade(userId, cpf);
      const mensagem = this.processarTemplateProgresso(
        config.template_mensagem_progresso || this.getTemplateProgressoPadrao(),
        cliente.nome || 'Cliente',
        saldos
      );

      // Salvar no histórico com pedido_id e data_venda
      const notificacao = await this.notificacaoModel.create({
        user_id: userId,
        cpf_cliente: cpf,
        pedido_id: pedidoId,
        data_venda: dataVenda,
        tipo_notificacao: 'PROGRESSO',
        premio_id: null,
        regra_id: null,
        mensagem_enviada: mensagem,
        enviado_whatsapp: false,
        data_envio: new Date(),
        erro: null,
      });

      // Enviar via WhatsApp se não estiver em simulação
      if (!config.simulacao) {
        try {
          const whatsappManager = WhatsAppManager.getInstance();
          const whatsappService = whatsappManager.getServiceSync(userId);

          if (whatsappService && whatsappService.isReady()) {
            await whatsappService.sendMessage(cliente.telefone, mensagem);
            await this.notificacaoModel.update(notificacao.id, { enviado_whatsapp: true });
            logger.info(`Notificação de progresso enviada para pedido ${pedidoId} (cliente ${cpf})`);
          } else {
            await this.notificacaoModel.update(notificacao.id, { erro: 'WhatsApp não está pronto' });
            logger.warn(`WhatsApp não está pronto para enviar notificação de progresso (pedido ${pedidoId})`);
          }
        } catch (error: any) {
          await this.notificacaoModel.update(notificacao.id, { erro: error.message });
          logger.error(`Erro ao enviar notificação de progresso para pedido ${pedidoId}: ${error.message}`);
        }
      } else {
        logger.info(`[SIMULAÇÃO] Notificação de progresso processada para pedido ${pedidoId} (cliente ${cpf})`);
      }
    } catch (error: any) {
      if (error.code === 'ER_DUP_ENTRY' || error.message?.includes('Duplicate entry')) {
        logger.info(`Notificação de PROGRESSO ignorada por duplicidade (Pedido ${pedidoId}, Cliente ${cpf}, Momento ${dataVenda.toISOString()})`);
        return;
      }
      logger.error(`Erro ao processar notificação de progresso para pedido ${pedidoId}: ${error.message}`);
    }
  }

  /**
   * Envia notificação de conquista para um pedido específico (automatizado)
   * Este método é chamado apenas para pedidos que ainda não foram notificados
   */
  async enviarNotificacaoConquistaPorPedido(
    userId: number,
    cpf: string,
    pedidoId: number,
    dataVenda: Date, // Momento exato da venda para idempotência
    premios: PremioCliente[]
  ): Promise<void> {
    const config = await this.configModel.getOrCreateDefault(userId);

    if (!config.notificar_conquistas || premios.length === 0) {
      return;
    }

    const cliente = await this.buscarClientePorCpf(userId, cpf);
    if (!cliente || !cliente.telefone) {
      logger.warn(`Cliente ${cpf} não encontrado ou sem telefone para notificação de conquista (pedido ${pedidoId})`);
      return;
    }

    for (const premioConcedido of premios) {
      try {
        const premio = await this.premioModel.findById(premioConcedido.premio_id);
        if (!premio) {
          continue;
        }
        if (premio.entrega_automatico) {
          continue;
        }

        const mensagem = this.processarTemplateConquista(
          config.template_mensagem_conquista || this.getTemplateConquistaPadrao(),
          cliente.nome || 'Cliente',
          premio
        );

        // Salvar no histórico com pedido_id e data_venda
        const notificacao = await this.notificacaoModel.create({
          user_id: userId,
          cpf_cliente: cpf,
          pedido_id: pedidoId,
          data_venda: dataVenda,
          tipo_notificacao: 'CONQUISTA',
          premio_id: premio.id,
          regra_id: null,
          mensagem_enviada: mensagem,
          enviado_whatsapp: false,
          data_envio: new Date(),
          erro: null,
        });

        // Enviar via WhatsApp se não estiver em simulação
        if (!config.simulacao) {
          try {
            const whatsappManager = WhatsAppManager.getInstance();
            const whatsappService = whatsappManager.getServiceSync(userId);

            if (whatsappService && whatsappService.isReady()) {
              await whatsappService.sendMessage(cliente.telefone, mensagem);
              await this.notificacaoModel.update(notificacao.id, { enviado_whatsapp: true });
              logger.info(`Notificação de conquista enviada para pedido ${pedidoId} (cliente ${cpf}, prêmio: ${premio.descricao})`);
            } else {
              await this.notificacaoModel.update(notificacao.id, { erro: 'WhatsApp não está pronto' });
              logger.warn(`WhatsApp não está pronto para enviar notificação de conquista (pedido ${pedidoId})`);
            }
          } catch (error: any) {
            await this.notificacaoModel.update(notificacao.id, { erro: error.message });
            logger.error(`Erro ao enviar notificação de conquista para pedido ${pedidoId}: ${error.message}`);
          }
        } else {
          logger.info(`[SIMULAÇÃO] Notificação de conquista processada para pedido ${pedidoId} (cliente ${cpf}, prêmio: ${premio.descricao})`);
        }
      } catch (error: any) {
        if (error.code === 'ER_DUP_ENTRY' || error.message?.includes('Duplicate entry')) {
          logger.info(`Notificação de CONQUISTA ignorada por duplicidade (Prêmio ${premioConcedido.premio_id}, Cliente ${cpf})`);
          continue;
        }
        logger.error(`Erro ao processar notificação de conquista para pedido ${pedidoId}: ${error.message}`);
      }
    }
  }
}

