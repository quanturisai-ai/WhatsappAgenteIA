import logger from '../utils/logger';
import { FidelizacaoService } from './fidelizacao.service';
import { FidelizacaoNotificacaoService } from './fidelizacaoNotificacao.service';
import { FidelizacaoConfigModel } from '../models/fidelizacaoConfig.model';
import { PremioModel, Premio } from '../models/premio.model';
import { PremioClienteModel } from '../models/premioCliente.model';

/** Intervalo mínimo entre tentativas de geração de voucher após falha (ms) */
const VOUCHER_RETRY_BACKOFF_MS = 30 * 60 * 1000;

export class FidelizacaoVoucherAutoService {
  private fidelizacaoService: FidelizacaoService;
  private notificacaoService: FidelizacaoNotificacaoService;
  private configModel: FidelizacaoConfigModel;
  private premioModel: PremioModel;
  private premioClienteModel: PremioClienteModel;

  constructor() {
    this.fidelizacaoService = new FidelizacaoService();
    this.notificacaoService = new FidelizacaoNotificacaoService();
    this.configModel = new FidelizacaoConfigModel();
    this.premioModel = new PremioModel();
    this.premioClienteModel = new PremioClienteModel();
  }

  /**
   * Executado ao final do ciclo de sync VM: gera vouchers, envia entregas, fallback conquista.
   */
  async processarPosSincronizacaoVm(userId: number): Promise<void> {
    try {
      const config = await this.configModel.getOrCreateDefault(userId);
      if (!config.notificar_conquistas) {
        return;
      }

      const lista = await this.premioClienteModel.findByUserId(userId);
      const premioCache = new Map<number, Premio | null>();

      const getPremio = async (premioId: number): Promise<Premio | null> => {
        if (premioCache.has(premioId)) return premioCache.get(premioId) ?? null;
        const p = await this.premioModel.findById(premioId);
        premioCache.set(premioId, p);
        return p;
      };

      // --- Fase 1: gerar voucher ---
      for (const pc of lista) {
        if (pc.utilizado) continue;
        const premio = await getPremio(pc.premio_id);
        if (!premio || !premio.gerar_automatico) continue;
        if (premio.servico === 'TOTAL') continue;
        if (premio.servico !== 'LAVAGEM' && premio.servico !== 'SECAGEM') continue;
        if (!premio.valor_voucher || !premio.quantidade_utilizacoes) continue;
        if (pc.codigo_voucher) continue;

        if (pc.voucher_tentativa_em) {
          const elapsed = Date.now() - new Date(pc.voucher_tentativa_em).getTime();
          if (elapsed < VOUCHER_RETRY_BACKOFF_MS) {
            continue;
          }
        }

        await this.premioClienteModel.updateAutomacao(pc.id, {
          voucher_tentativa_em: new Date(),
        });

        const resultado = await this.fidelizacaoService.gerarVoucherParaConquista(pc.id, userId);
        if (resultado.success) {
          await this.premioClienteModel.updateAutomacao(pc.id, {
            voucher_erro_ultimo: null,
          });
          logger.info(`[VoucherAuto] Voucher gerado para premio_cliente ${pc.id} (user ${userId})`);
        } else {
          await this.premioClienteModel.updateAutomacao(pc.id, {
            voucher_erro_ultimo: (resultado.error || 'Erro desconhecido').slice(0, 2000),
          });
          logger.warn(`[VoucherAuto] Falha geração voucher premio_cliente ${pc.id}: ${resultado.error}`);
        }
      }

      // Recarregar lista após possíveis atualizações
      const lista2 = await this.premioClienteModel.findByUserId(userId);

      // --- Fase 2: entrega automática (só com código) ---
      for (const pc of lista2) {
        if (pc.utilizado || pc.data_entrega) continue;
        const premio = await getPremio(pc.premio_id);
        if (!premio || !premio.entrega_automatico) continue;
        if (!pc.codigo_voucher) continue;

        try {
          await this.notificacaoService.enviarNotificacaoEntregaPremio(userId, pc.id, undefined, {
            marcarDataEntrega: true,
            apenasSeAutomatico: true,
          });
        } catch (err: any) {
          logger.error(`[VoucherAuto] Falha entrega automática premio_cliente ${pc.id}: ${err.message}`);
          try {
            await this.notificacaoService.dispararConquistaAposFalhaEntrega(userId, pc.id);
          } catch (fbErr: any) {
            logger.error(`[VoucherAuto] Falha fallback conquista após entrega premio_cliente ${pc.id}: ${fbErr.message}`);
          }
        }
      }

      // --- Fase 3: fallback conquista (sem voucher, entrega automática) ---
      const lista3 = await this.premioClienteModel.findByUserId(userId);
      for (const pc of lista3) {
        if (pc.utilizado || pc.data_entrega) continue;
        const premio = await getPremio(pc.premio_id);
        if (!premio || !premio.entrega_automatico) continue;
        if (pc.codigo_voucher) continue;

        const eligibleGen =
          premio.gerar_automatico &&
          (premio.servico === 'LAVAGEM' || premio.servico === 'SECAGEM') &&
          premio.valor_voucher != null &&
          premio.quantidade_utilizacoes != null;

        if (eligibleGen && pc.voucher_tentativa_em) {
          const elapsed = Date.now() - new Date(pc.voucher_tentativa_em).getTime();
          if (elapsed < VOUCHER_RETRY_BACKOFF_MS) {
            continue;
          }
        }

        try {
          await this.notificacaoService.enviarOuRetentarConquistaFallback(userId, pc, premio, config);
        } catch (err: any) {
          logger.error(`[VoucherAuto] Falha fallback conquista premio_cliente ${pc.id}: ${err.message}`);
        }
      }
    } catch (error: any) {
      logger.error(`[VoucherAuto] Erro processamento user ${userId}: ${error.message}`);
    }
  }
}
