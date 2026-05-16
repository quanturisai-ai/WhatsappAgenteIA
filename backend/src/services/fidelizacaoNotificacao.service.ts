import logger from '../utils/logger';
import { FidelizacaoConfigModel, FidelizacaoConfig } from '../models/fidelizacaoConfig.model';
import { FidelizacaoNotificacaoModel, FidelizacaoNotificacao } from '../models/fidelizacaoNotificacao.model';
import { VmLavClienteModel, VmLavCliente } from '../models/vmLavCliente.model';
import { PremioModel, Premio } from '../models/premio.model';
import { PremioCliente } from '../models/premioCliente.model';
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
  private fidelizacaoService: FidelizacaoService;

  constructor() {
    this.configModel = new FidelizacaoConfigModel();
    this.notificacaoModel = new FidelizacaoNotificacaoModel();
    this.clienteModel = new VmLavClienteModel();
    this.premioModel = new PremioModel();
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

            const mensagem = this.processarTemplateConquista(
              config.template_mensagem_conquista || this.getTemplateConquistaPadrao(),
              cliente.nome || 'Cliente',
              premio
            );

            // Salvar no histórico primeiro
            const notificacao = await this.notificacaoModel.create({
              user_id: userId,
              cpf_cliente: cpf,
              tipo_notificacao: 'CONQUISTA',
              premio_id: premio.id,
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
              tipo_notificacao: 'PROGRESSO',
              premio_id: null,
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
   * Processa template de mensagem de conquista
   */
  private processarTemplateConquista(template: string, nome: string, premio: Premio): string {
    let mensagem = template;

    // Extrair primeiro nome
    const primeiroNome = this.extrairPrimeiroNome(nome);

    // Substituir variáveis
    mensagem = mensagem.replace(/{nome}/g, nome);
    mensagem = mensagem.replace(/{primeiro_nome}/g, primeiroNome);
    mensagem = mensagem.replace(/{descricao_premio}/g, premio.descricao);

    // Data de validade
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

    // Limpar linhas vazias extras
    mensagem = mensagem.replace(/\n{3,}/g, '\n\n');

    return mensagem.trim();
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

    // Substituir variáveis de lavagem
    mensagem = mensagem.replace(/{lavagens_atual}/g, String(saldos.lavagens.atual));
    mensagem = mensagem.replace(/{lavagens_objetivo}/g, String(saldos.lavagens.proximoObjetivo || 0));
    mensagem = mensagem.replace(/{lavagens_percentual}/g, String(this.calcularPercentual(saldos.lavagens)));
    mensagem = mensagem.replace(/{lavagens_faltam}/g, String(saldos.lavagens.faltam));
    mensagem = mensagem.replace(/{lavagens_proximo_premio}/g, saldos.lavagens.proximoPremio || 'Nenhum prêmio disponível');

    // Substituir variáveis de secagem
    mensagem = mensagem.replace(/{secagens_atual}/g, String(saldos.secagens.atual));
    mensagem = mensagem.replace(/{secagens_objetivo}/g, String(saldos.secagens.proximoObjetivo || 0));
    mensagem = mensagem.replace(/{secagens_percentual}/g, String(this.calcularPercentual(saldos.secagens)));
    mensagem = mensagem.replace(/{secagens_faltam}/g, String(saldos.secagens.faltam));
    mensagem = mensagem.replace(/{secagens_proximo_premio}/g, saldos.secagens.proximoPremio || 'Nenhum prêmio disponível');

    // Substituir variáveis de total
    mensagem = mensagem.replace(/{total_atual}/g, String(saldos.total.atual));
    mensagem = mensagem.replace(/{total_objetivo}/g, String(saldos.total.proximoObjetivo || 0));
    mensagem = mensagem.replace(/{total_percentual}/g, String(this.calcularPercentual(saldos.total)));
    mensagem = mensagem.replace(/{total_faltam}/g, String(saldos.total.faltam));
    mensagem = mensagem.replace(/{total_proximo_premio}/g, saldos.total.proximoPremio || 'Nenhum prêmio disponível');

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

  /**
   * Template padrão de progresso
   */
  private getTemplateProgressoPadrao(): string {
    return `Olá, {nome}! 👋

Seu progresso na fidelidade:
• Lavagens: {lavagens_atual}/{lavagens_objetivo} → {lavagens_percentual}% completo
• Secagens: {secagens_atual}/{secagens_objetivo} → {secagens_percentual}% completo
• Total: {total_atual}/{total_objetivo} → {total_percentual}% completo

Próximo prêmio: {lavagens_proximo_premio}
Faltam apenas {lavagens_faltam} utilizações!

Continue assim! 🚀`;
  }

  /**
   * Envia notificação de progresso para um pedido específico (automatizado)
   * Este método é chamado apenas para pedidos que ainda não foram notificados
   */
  async enviarNotificacaoProgressoPorPedido(
    userId: number,
    cpf: string,
    pedidoId: number
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

      // Salvar no histórico com pedido_id
      const notificacao = await this.notificacaoModel.create({
        user_id: userId,
        cpf_cliente: cpf,
        pedido_id: pedidoId, // Associar ao pedido
        tipo_notificacao: 'PROGRESSO',
        premio_id: null,
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

        const mensagem = this.processarTemplateConquista(
          config.template_mensagem_conquista || this.getTemplateConquistaPadrao(),
          cliente.nome || 'Cliente',
          premio
        );

        // Salvar no histórico com pedido_id
        const notificacao = await this.notificacaoModel.create({
          user_id: userId,
          cpf_cliente: cpf,
          pedido_id: pedidoId, // Associar ao pedido
          tipo_notificacao: 'CONQUISTA',
          premio_id: premio.id,
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
        logger.error(`Erro ao processar notificação de conquista para pedido ${pedidoId}: ${error.message}`);
      }
    }
  }
}

