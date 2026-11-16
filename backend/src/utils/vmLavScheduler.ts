import { VmLavService } from '../services/vmLav.service';
import { FidelizacaoService } from '../services/fidelizacao.service';
import { FidelizacaoNotificacaoService } from '../services/fidelizacaoNotificacao.service';
import { FidelizacaoRegrasService } from '../services/fidelizacaoRegras.service';
import { FidelizacaoConfigModel } from '../models/fidelizacaoConfig.model';
import { FidelizacaoRegrasConfigModel } from '../models/fidelizacaoRegrasConfig.model';
import { VmLavCredentialsModel } from '../models/vmLavCredentials.model';
import { FidelizacaoNotificacaoModel } from '../models/fidelizacaoNotificacao.model';
import { PremioModel } from '../models/premio.model';
import { FidelizacaoVoucherAutoService } from '../services/fidelizacaoVoucherAuto.service';
import logger from './logger';
import pool from '../config/database';

const vmLavService = new VmLavService();
const fidelizacaoService = new FidelizacaoService();
const notificacaoService = new FidelizacaoNotificacaoService();
const fidelizacaoRegrasService = new FidelizacaoRegrasService();
const fidelizacaoRegrasConfigModel = new FidelizacaoRegrasConfigModel();
const credentialsModel = new VmLavCredentialsModel();
const notificacaoModel = new FidelizacaoNotificacaoModel();
const premioModel = new PremioModel();
const configModel = new FidelizacaoConfigModel();

/**
 * Captura o MAX(data_venda) atual no banco para o usuário.
 * Isso é lido ANTES do sync para identificar pedidos genuinamente novos.
 */
async function capturarWatermark(userId: number): Promise<Date | null> {
  const conn = await pool.getConnection();
  try {
    const result = await conn.query(
      `SELECT MAX(data_venda) as max_data FROM vm_lav_pedidos WHERE user_id = ?`,
      [userId]
    ) as any;
    const rows = Array.isArray(result) ? (Array.isArray(result[0]) ? result[0] : result) : [];
    const val = rows[0]?.max_data;
    return val ? new Date(val) : null;
  } finally {
    conn.release();
  }
}

/**
 * Busca pedidos novos (data_venda > watermark E >= dataBarreira) agrupados por CPF.
 * Retorna um Map de CPF → pedido mais recente do ciclo.
 */
async function buscarPedidosNovosPorCpf(
  userId: number,
  watermark: Date,
  dataBarreira: Date | null
): Promise<Map<string, { pedidoId: number; dataVenda: Date }>> {
  const conn = await pool.getConnection();
  try {
    const barreiraSql = dataBarreira ? `AND data_venda >= ?` : '';
    const params: any[] = [userId, watermark];
    if (dataBarreira) params.push(dataBarreira);

    const result = await conn.query(
      `SELECT id, cliente_cpf, data_venda
       FROM vm_lav_pedidos
       WHERE user_id = ?
         AND data_venda > ?
         ${barreiraSql}
         AND situacao_venda = 'Sucesso'
         AND pago_com_fidelidade = 0
         AND cliente_cpf IS NOT NULL
         AND cliente_cpf != ''
       ORDER BY data_venda ASC`,
      params
    ) as any;

    const rows: any[] = Array.isArray(result)
      ? (Array.isArray(result[0]) ? result[0] : result)
      : [];

    // Agrupar por CPF, mantendo o pedido mais recente de cada CPF
    const cpfMap = new Map<string, { pedidoId: number; dataVenda: Date }>();
    for (const row of rows) {
      const cpf = row.cliente_cpf as string;
      const dataVenda = new Date(row.data_venda);
      const existing = cpfMap.get(cpf);
      if (!existing || dataVenda > existing.dataVenda) {
        cpfMap.set(cpf, { pedidoId: row.id, dataVenda });
      }
    }
    return cpfMap;
  } finally {
    conn.release();
  }
}

/**
 * Processa notificações (progresso + conquista) para um usuário.
 * Chamado pelo scheduler automático E pelo sync manual.
 */
export async function processarNotificacoesUsuario(userId: number): Promise<void> {
  try {
    const config = await configModel.getOrCreateDefault(userId);

    if (!config.notificar_progresso && !config.notificar_conquistas) {
      logger.debug(`Notificações desativadas para usuário ${userId}.`);
      return;
    }

    // Barreira: só notificar pedidos APÓS a desativação da simulação
    const dataBarreira = config.simulacao_desativada_em;

    // Se ainda em simulação E nunca foi desativada: registrar mas não enviar
    // Se simulacao = false mas dataBarreira = null: foi ativado de outra forma (não bloquear)

    logger.info(`Iniciando apuração de notificações para usuário ${userId}. Barreira: ${dataBarreira?.toISOString() ?? 'nenhuma'}`);

    // 1. Buscar o watermark ATUAL (já inclui os pedidos recém-sincronizados)
    //    Nota: o watermark FOI capturado antes do sync em sincronizarUsuario().
    //    Aqui recapturamos para usar como base dos "pedidos já no banco desde a última passagem".
    //    A lógica de watermark "antes do sync" é feita em sincronizarUsuario.
    //    Esta função recebe o watermark pré-sync via parâmetro quando chamada do fluxo completo.
    //    Quando chamada standalone (ex: manual), usa findMaxDataVenda da tabela de notificações.
    const ultimaNotificacaoData = await notificacaoModel.findMaxDataVenda(userId, 'PROGRESSO');

    // Se nunca houve notificação, usar a barreira como ponto de partida
    // Se também não há barreira, não notificar (primeira vez = histórico não vai gerar mensagens)
    if (!ultimaNotificacaoData && !dataBarreira) {
      logger.info(`Primeira execução para usuário ${userId}: sem watermark e sem barreira. Nenhuma notificação enviada.`);
      return;
    }

    const watermarkParaFiltro = ultimaNotificacaoData ?? dataBarreira!;

    // 2. Buscar pedidos novos desde última notificação, respeitando a barreira
    const pedidosNovosPorCpf = await buscarPedidosNovosPorCpf(userId, watermarkParaFiltro, dataBarreira);

    if (pedidosNovosPorCpf.size === 0) {
      logger.info(`Nenhum pedido novo para notificar para usuário ${userId}.`);
      return;
    }

    logger.info(`${pedidosNovosPorCpf.size} CPF(s) com pedidos novos para notificar (usuário ${userId}).`);

    // 3. Para cada CPF: enviar 1 notificação de progresso + verificar conquista
    for (const [cpf, { pedidoId, dataVenda }] of pedidosNovosPorCpf) {

      // --- PROGRESSO ---
      if (config.notificar_progresso) {
        try {
          await notificacaoService.enviarNotificacaoProgressoPorPedido(userId, cpf, pedidoId, dataVenda);
        } catch (err: any) {
          if (err.code === 'ER_DUP_ENTRY' || (err.message && err.message.includes('Duplicate entry'))) {
            logger.debug(`Notificação de progresso já registrada para pedido ${pedidoId} (CPF: ${cpf}).`);
          } else {
            logger.error(`Erro ao enviar notificação de progresso para CPF ${cpf}: ${err.message}`);
          }
        }
      }

      // --- CONQUISTA ---
      if (config.notificar_conquistas) {
        try {
          const resultadoPremios = await fidelizacaoService.apurarEConcederPremios(userId, cpf);

          if (resultadoPremios.premiosConcedidos > 0 && resultadoPremios.premios.length > 0) {
            logger.info(`${resultadoPremios.premiosConcedidos} prêmio(s) concedido(s) para CPF ${cpf}`);

            // Filtrar prêmios não notificados ainda
            const premiosParaNotificar = [];
            for (const premioCliente of resultadoPremios.premios) {
              const premioTipo = await premioModel.findById(premioCliente.premio_id);
              if (premioTipo?.entrega_automatico) {
                continue;
              }
              const jaNotificado = await notificacaoModel.existsNotificacaoConquista(
                userId,
                cpf,
                premioCliente.premio_id ?? premioCliente.id
              );
              if (!jaNotificado) premiosParaNotificar.push(premioCliente);
            }

            if (premiosParaNotificar.length > 0) {
              await notificacaoService.enviarNotificacaoConquistaPorPedido(
                userId, cpf, pedidoId, dataVenda, premiosParaNotificar
              );
            }
          }
        } catch (err: any) {
          logger.error(`Erro ao processar conquistas para CPF ${cpf}: ${err.message}`);
        }
      }
    }

    logger.info(`✅ Notificações concluídas para usuário ${userId}: ${pedidosNovosPorCpf.size} CPF(s) processado(s).`);
  } catch (error: any) {
    logger.error(`Erro ao processar notificações para usuário ${userId}: ${error.message}`);
  }
}

/**
 * Função principal de sincronização para um usuário específico.
 * Captura watermark ANTES do sync para identificar pedidos genuinamente novos na próxima passagem.
 */
export async function sincronizarUsuario(userId: number): Promise<void> {
  try {
    // 1. Verificar credenciais
    const credenciais = await credentialsModel.findByUserId(userId);
    if (!credenciais || !credenciais.ativo) {
      logger.warn(`Sincronização ignorada para usuário ${userId}: Credenciais inativas ou não encontradas.`);
      return;
    }

    // 2. Capturar watermark ANTES do sync (max data_venda atual no banco)
    const watermarkAntesDaSync = await capturarWatermark(userId);
    logger.info(`Watermark PRÉ-sync para usuário ${userId}: ${watermarkAntesDaSync?.toISOString() ?? 'vazio (primeira vez)'}`);

    // 3. Sincronizar Clientes
    const resultadoClientes = await vmLavService.sincronizarClientes(userId);
    if (!resultadoClientes.success) {
      logger.error(`Erro ao sincronizar clientes para usuário ${userId}: ${resultadoClientes.message}`);
    } else {
      logger.info(`Sincronização de clientes concluída para usuário ${userId}: ${resultadoClientes.message}`);
    }

    // 4. Sincronizar Pedidos (últimos 7 dias)
    const resultadoPedidos = await vmLavService.sincronizarPedidos(userId, true);
    if (!resultadoPedidos.success) {
      logger.error(`Erro ao sincronizar pedidos para usuário ${userId}: ${resultadoPedidos.message}`);
    } else {
      logger.info(`Sincronização de pedidos concluída para usuário ${userId}: ${resultadoPedidos.message}`);
    }

    // 5. Sincronizar Vouchers (já chama marcarPremiosUtilizadosPorSaldoVoucher ao final)
    const resultadoVouchers = await vmLavService.sincronizarVouchers(userId);
    if (!resultadoVouchers.success) {
      logger.warn(`Sincronização de vouchers falhou para usuário ${userId}: ${resultadoVouchers.message}`);
    } else {
      logger.info(`Sincronização de vouchers concluída para usuário ${userId}: ${resultadoVouchers.message}`);
    }

    // 5.1 Preencher observação rica (data/local da última retirada) quando API de movimentações disponível
    const resultadoObsVouchers = await vmLavService.sincronizarUtilizacaoVouchersPremios(userId);
    if (!resultadoObsVouchers.success) {
      logger.debug(`Observação de vouchers não atualizada para usuário ${userId}: ${resultadoObsVouchers.message}`);
    }

    // 5.2 Sincronizar tabela vm_lav_vouchers_movimentos (API de movimentações por voucher)
    const resultadoMovimentos = await vmLavService.sincronizarMovimentosVouchers(userId);
    if (!resultadoMovimentos.success) {
      logger.debug(`Movimentos de vouchers não atualizados para usuário ${userId}: ${resultadoMovimentos.message}`);
    } else if ((resultadoMovimentos.inseridos ?? 0) > 0) {
      logger.info(`Movimentos de vouchers: ${resultadoMovimentos.inseridos} registro(s) para usuário ${userId}`);
    }

    // 6. Marcar pedidos pagos com fidelidade (vm_lav_vouchers_movimentos: RETIRADA + pedido mesmo CPF/equipamento/data, <= 10s)
    const resultadoMarcacao = await vmLavService.marcarPedidosPagosComFidelidadePorMovimentos(userId);
    if (resultadoMarcacao.success) {
      logger.info(`Marcação de pedidos fidelidade: ${resultadoMarcacao.marcados} pedidos marcados para usuário ${userId}`);
    }

    // 7. Processar notificações usando o watermark pré-sync
    //    Se watermarkAntesDaSync é null (primeira vez): não notificar histórico
    if (watermarkAntesDaSync === null) {
      logger.info(`Primeira sincronização para usuário ${userId}: pedidos históricos não geram notificações.`);
      return;
    }

    const config = await configModel.getOrCreateDefault(userId);
    const dataBarreira = config.simulacao_desativada_em;

    // Buscar pedidos novos com base no watermark capturado ANTES do sync
    const pedidosNovosPorCpf = await buscarPedidosNovosPorCpf(userId, watermarkAntesDaSync, dataBarreira);

    if (pedidosNovosPorCpf.size > 0) {
      logger.info(`${pedidosNovosPorCpf.size} CPF(s) com pedidos novos para notificar (usuário ${userId}).`);

      for (const [cpf, { pedidoId, dataVenda }] of pedidosNovosPorCpf) {

      // --- PROGRESSO ---
      if (config.notificar_progresso) {
        try {
          await notificacaoService.enviarNotificacaoProgressoPorPedido(userId, cpf, pedidoId, dataVenda);
        } catch (err: any) {
          if (err.code === 'ER_DUP_ENTRY' || (err.message && err.message.includes('Duplicate entry'))) {
            logger.debug(`Notificação de progresso já registrada para pedido ${pedidoId} (CPF: ${cpf}).`);
          } else {
            logger.error(`Erro ao enviar notificação de progresso para CPF ${cpf}: ${err.message}`);
          }
        }
      }

      // --- CONQUISTA ---
      if (config.notificar_conquistas) {
        try {
          const resultadoPremios = await fidelizacaoService.apurarEConcederPremios(userId, cpf);

          if (resultadoPremios.premiosConcedidos > 0 && resultadoPremios.premios.length > 0) {
            logger.info(`${resultadoPremios.premiosConcedidos} prêmio(s) concedido(s) para CPF ${cpf}`);

            const premiosParaNotificar = [];
            for (const premioCliente of resultadoPremios.premios) {
              const premioTipo = await premioModel.findById(premioCliente.premio_id);
              if (premioTipo?.entrega_automatico) {
                continue;
              }
              const premioIdParaCheck = premioCliente.premio_id ?? premioCliente.id;
              const jaNotificado = await notificacaoModel.existsNotificacaoConquista(userId, cpf, premioIdParaCheck);
              if (!jaNotificado) premiosParaNotificar.push(premioCliente);
            }

            if (premiosParaNotificar.length > 0) {
              await notificacaoService.enviarNotificacaoConquistaPorPedido(
                userId, cpf, pedidoId, dataVenda, premiosParaNotificar
              );
            }
          }
        } catch (err: any) {
          logger.error(`Erro ao processar conquistas para CPF ${cpf}: ${err.message}`);
        }
      }
    }
    logger.info(`✅ Ciclo completo para usuário ${userId}: ${pedidosNovosPorCpf.size} CPF(s) notificado(s).`);
    } else {
      logger.info(`Nenhum pedido genuinamente novo desde o último sync para usuário ${userId}.`);
    }

    const voucherAuto = new FidelizacaoVoucherAutoService();
    await voucherAuto.processarPosSincronizacaoVm(userId);

  } catch (error: any) {
    logger.error(`Erro ao sincronizar usuário ${userId}: ${error.message}`);
  }
}

// Timer único para verificação periódica
let verificacaoTimer: NodeJS.Timeout | null = null;

/**
 * Verifica quais usuários precisam ser sincronizados baseado em ultima_sincronizacao + intervalo.
 * Exportada para permitir chamada pontual (ex: após sync manual).
 */
export async function verificarESincronizarUsuarios(filtroUserId?: number): Promise<void> {
  try {
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        `SELECT DISTINCT user_id, intervalo_sincronizacao_minutos, ultima_sincronizacao 
         FROM vm_lav_credentials 
         WHERE ativo = 1 AND status = ?`,
        ['ativo']
      ) as any;

      let rows: any[] = [];
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
        rows = Array.from(queryResult as any);
      }

      if (rows.length === 0) {
        return;
      }

      for (const row of rows) {
        const userId = row.user_id;

        // Se filtroUserId fornecido, processar apenas aquele usuário
        if (filtroUserId !== undefined && userId !== filtroUserId) continue;

        const intervalo = row.intervalo_sincronizacao_minutos || 60; // Default 60 min
        const ultimaSync = row.ultima_sincronizacao ? new Date(row.ultima_sincronizacao) : null;

        let precisaSincronizar = filtroUserId !== undefined; // Se chamado manualmente, sempre sincronizar

        if (!precisaSincronizar) {
          if (!ultimaSync) {
            precisaSincronizar = true;
          } else {
            const proximaSync = new Date(ultimaSync.getTime() + intervalo * 60000);
            if (new Date() >= proximaSync) {
              precisaSincronizar = true;
            }
          }
        }

        if (precisaSincronizar) {
          logger.info(`Sincronização ${filtroUserId !== undefined ? 'manual' : 'automática'} iniciada para usuário ${userId}.`);
          sincronizarUsuario(userId).catch(err => {
            logger.error(`Erro na task de sincronização para usuário ${userId}: ${err.message}`);
          });
        }
      }

    } finally {
      conn.release();
    }
  } catch (error: any) {
    logger.error(`Erro no loop de verificação do scheduler: ${error.message}`);
  }
}

/**
 * Verifica quais usuários precisam processar regras de automação e executa.
 * Usa fidelizacao_regras_config (ativo=1) e intervalo_verificacao_minutos.
 * Executado em paralelo ao sync, mas com lógica própria de intervalo.
 */
export async function verificarEProcessarAutomaticoes(): Promise<void> {
  try {
    const usuarios = await fidelizacaoRegrasConfigModel.findUsuariosParaVerificacao();
    if (usuarios.length === 0) return;

    for (const { user_id } of usuarios) {
      try {
        await fidelizacaoRegrasService.processarRegrasUsuario(user_id);
        await fidelizacaoRegrasConfigModel.atualizarUltimaVerificacao(user_id);
      } catch (err: any) {
        logger.error(`Erro ao processar automações para usuário ${user_id}: ${err.message}`);
      }
    }
  } catch (error: any) {
    logger.error(`Erro no loop de verificação de automações: ${error.message}`);
  }
}

/**
 * Inicia o scheduler
 */
export function startScheduler(intervaloCheckMs: number = 60000) {
  if (verificacaoTimer) {
    logger.warn('Scheduler já está rodando.');
    return;
  }

  logger.info(`Iniciando VmLavScheduler (Check a cada ${intervaloCheckMs}ms)...`);

  // Executar imediatamente a primeira vez
  verificarESincronizarUsuarios().catch(err => logger.error(`Erro no scheduler (sync): ${err.message}`));
  verificarEProcessarAutomaticoes().catch(err => logger.error(`Erro no scheduler (automações): ${err.message}`));

  verificacaoTimer = setInterval(() => {
    verificarESincronizarUsuarios().catch(err => logger.error(`Erro no scheduler (sync): ${err.message}`));
    verificarEProcessarAutomaticoes().catch(err => logger.error(`Erro no scheduler (automações): ${err.message}`));
  }, intervaloCheckMs);
}

/**
 * Para o scheduler
 */
export function stopScheduler() {
  if (verificacaoTimer) {
    clearInterval(verificacaoTimer);
    verificacaoTimer = null;
    logger.info('VmLavScheduler parado.');
  }
}
