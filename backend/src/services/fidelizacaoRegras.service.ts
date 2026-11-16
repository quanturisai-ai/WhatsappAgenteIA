import pool from '../config/database';
import logger from '../utils/logger';
import { normalizeCpfToDigits, normalizeCpfColumnSql, formatCpfWithSeparators } from '../utils/cpfUtils';
import { FidelizacaoTipoGatilhoModel, FidelizacaoTipoGatilho } from '../models/fidelizacaoTipoGatilho.model';
import { FidelizacaoRegraModel, FidelizacaoRegra, SegmentacaoPublico } from '../models/fidelizacaoRegra.model';
import { FidelizacaoRegrasConfigModel } from '../models/fidelizacaoRegrasConfig.model';
import { FidelizacaoNotificacaoModel } from '../models/fidelizacaoNotificacao.model';
import { WhatsAppManager } from './whatsapp.manager';

export interface ClienteAlvo {
  id: number;
  user_id: number;
  nome: string | null;
  cpf: string | null;
  telefone: string | null;
  data_ultima_compra: Date | null;
  data_nascimento?: Date | null;
  data_cadastro?: Date | null;
  qtd_compras: number;
  valor_total_compras: number;
  dias_ausente?: number;
  email?: string | null;
  genero?: string | null;
  pedidos_fds?: number;
  pedidos_total?: number;
  percentual_fds?: number;
}

export interface PreviewCliente {
  nome: string;
  cpf: string;
  telefone: string;
  dias_ausente?: number;
  data_ultima_visita: string;
  data_nascimento: string | null;
  data_cadastro: string | null;
  data_ultima_compra: string | null;
  qtd_compras: number;
  mensagem_previa: string;
  status: 'qualificado' | 'bloqueado_frequencia' | 'bloqueado_antispam' | 'bloqueado_semanal' | 'bloqueado_mensal';
}

export interface PreviewResult {
  total_qualificados: number;
  total_bloqueados_antispam: number;
  clientes: PreviewCliente[];
}

export class FidelizacaoRegrasService {
  private tipoGatilhoModel: FidelizacaoTipoGatilhoModel;
  private regraModel: FidelizacaoRegraModel;
  private configModel: FidelizacaoRegrasConfigModel;
  private notificacaoModel: FidelizacaoNotificacaoModel;

  constructor() {
    this.tipoGatilhoModel = new FidelizacaoTipoGatilhoModel();
    this.regraModel = new FidelizacaoRegraModel();
    this.configModel = new FidelizacaoRegrasConfigModel();
    this.notificacaoModel = new FidelizacaoNotificacaoModel();
  }

  /**
   * Processa todas as regras ativas do usuário (motor de disparo).
   */
  async processarRegrasUsuario(userId: number): Promise<void> {
    const config = await this.configModel.getOrCreateDefault(userId);
    if (!config.ativo) {
      logger.debug(`Módulo de automações inativo para usuário ${userId}.`);
      return;
    }

    const regras = await this.regraModel.findAtivasByUserId(userId);
    if (regras.length === 0) return;

    const hoje = new Date().toISOString().slice(0, 10);

    for (const regra of regras) {
      try {
        const vigenciaInicio = regra.vigencia_inicio ? new Date(regra.vigencia_inicio).toISOString().slice(0, 10) : null;
        const vigenciaFim = regra.vigencia_fim ? new Date(regra.vigencia_fim).toISOString().slice(0, 10) : null;
        if (vigenciaInicio && hoje < vigenciaInicio) {
          logger.debug(`Regra ${regra.id} (${regra.nome_regra}) ainda não iniciou vigência.`);
          continue;
        }
        if (vigenciaFim && hoje > vigenciaFim) {
          logger.debug(`Regra ${regra.id} (${regra.nome_regra}) já encerrou vigência.`);
          continue;
        }

        if (!this.estaNoHorarioDaRegra(regra)) {
          logger.debug(`Regra ${regra.id} (${regra.nome_regra}) fora do horário de envio.`);
          continue;
        }

        const tipo = await this.tipoGatilhoModel.findById(regra.tipo_gatilho_id);
        if (!tipo || !tipo.ativo) {
          logger.warn(`Tipo de gatilho ${regra.tipo_gatilho_id} não encontrado ou inativo.`);
          continue;
        }

        const clientes = await this.executarQueryGatilho(tipo, regra);
        let enviados = 0;
        let ignorados = 0;

        for (const cliente of clientes) {
          const cpfNorm = normalizeCpfToDigits(cliente.cpf) ?? cliente.cpf;
          if (!cpfNorm || !cliente.telefone) continue;

          const bloqueado = await this.verificarBloqueios(userId, regra.id, regra.frequencia_minima_dias, cpfNorm, config);
          if (bloqueado) {
            ignorados++;
            continue;
          }

          const mensagem = this.processarTemplate(regra.mensagem_template, cliente);

          if (config.simulacao) {
            await this.notificacaoModel.create({
              user_id: userId,
              cpf_cliente: formatCpfWithSeparators(cpfNorm) ?? cpfNorm,
              pedido_id: null,
              regra_id: regra.id,
              data_venda: null,
              tipo_notificacao: tipo.codigo,
              premio_id: null,
              mensagem_enviada: mensagem,
              enviado_whatsapp: false,
              data_envio: new Date(),
              erro: null,
            } as any);
            enviados++;
            logger.info(`[SIMULAÇÃO] Automação regra ${regra.id} para ${cliente.nome || cpfNorm}`);
          } else {
            try {
              const whatsappManager = WhatsAppManager.getInstance();
              const whatsappService = whatsappManager.getServiceSync(userId);
              if (whatsappService?.isReady()) {
                await whatsappService.sendMessage(cliente.telefone, mensagem);
                await this.notificacaoModel.create({
                  user_id: userId,
                  cpf_cliente: formatCpfWithSeparators(cpfNorm) ?? cpfNorm,
                  pedido_id: null,
                  regra_id: regra.id,
                  data_venda: null,
                  tipo_notificacao: tipo.codigo,
                  premio_id: null,
                  mensagem_enviada: mensagem,
                  enviado_whatsapp: true,
                  data_envio: new Date(),
                  erro: null,
                } as any);
                enviados++;
                logger.info(`Automação regra ${regra.id} enviada para ${cliente.nome || cpfNorm}`);
              } else {
                await this.notificacaoModel.create({
                  user_id: userId,
                  cpf_cliente: formatCpfWithSeparators(cpfNorm) ?? cpfNorm,
                  pedido_id: null,
                  regra_id: regra.id,
                  data_venda: null,
                  tipo_notificacao: tipo.codigo,
                  premio_id: null,
                  mensagem_enviada: mensagem,
                  enviado_whatsapp: false,
                  data_envio: new Date(),
                  erro: 'WhatsApp não está pronto',
                } as any);
                ignorados++;
              }
            } catch (err: any) {
              await this.notificacaoModel.create({
                user_id: userId,
                cpf_cliente: formatCpfWithSeparators(cpfNorm) ?? cpfNorm,
                pedido_id: null,
                regra_id: regra.id,
                data_venda: null,
                tipo_notificacao: tipo.codigo,
                premio_id: null,
                mensagem_enviada: mensagem,
                enviado_whatsapp: false,
                data_envio: new Date(),
                erro: err?.message || String(err),
              } as any);
              ignorados++;
              logger.error(`Erro ao enviar automação regra ${regra.id} para ${cpfNorm}: ${err?.message}`);
            }
          }
        }

        logger.info(`Regra ${regra.id} (${regra.nome_regra}): ${clientes.length} qualificados, ${enviados} enviados, ${ignorados} ignorados.`);
      } catch (err: any) {
        logger.error(`Erro ao processar regra ${regra.id} para usuário ${userId}: ${err?.message}`);
      }
    }
  }

  /**
   * Pré-visualiza clientes afetados por uma regra (ou por dados de regra ainda não salvos).
   */
  async previewRegra(
    userId: number,
    regraOrDados: FidelizacaoRegra | (Omit<FidelizacaoRegra, 'id' | 'created_at' | 'updated_at'> & { tipo_gatilho_id: number })
  ): Promise<PreviewResult> {
    const config = await this.configModel.getOrCreateDefault(userId);
    const isRegraSalva = 'id' in regraOrDados && regraOrDados.id != null;
    const regra = isRegraSalva ? (regraOrDados as FidelizacaoRegra) : null;
    const dados = regraOrDados as any;

    const tipo = await this.tipoGatilhoModel.findById(dados.tipo_gatilho_id);
    if (!tipo) {
      return { total_qualificados: 0, total_bloqueados_antispam: 0, clientes: [] };
    }

    const regraParaQuery = regra ?? {
      ...dados,
      id: 0,
      parametros: dados.parametros || {},
      segmentacao: dados.segmentacao && typeof dados.segmentacao === 'object' ? dados.segmentacao : null,
      vigencia_inicio: dados.vigencia_inicio ? new Date(dados.vigencia_inicio) : new Date(),
      vigencia_fim: dados.vigencia_fim ? new Date(dados.vigencia_fim) : null,
    } as FidelizacaoRegra;

    const clientes = await this.executarQueryGatilho(tipo, regraParaQuery);
    const clientesPreview: PreviewCliente[] = [];
    let totalQualificados = 0;
    let totalBloqueadosAntispam = 0;

    for (const c of clientes) {
      const cpfNorm = normalizeCpfToDigits(c.cpf) ?? c.cpf;
      if (!cpfNorm || !c.telefone) continue;

      const bloqueado = regra ? await this.verificarBloqueios(userId, regra.id, regra.frequencia_minima_dias, cpfNorm, config) : false;
      if (bloqueado) {
        totalBloqueadosAntispam++;
      } else {
        totalQualificados++;
      }

      const status = bloqueado ? 'bloqueado_antispam' : 'qualificado';
      const mensagem_previa = this.processarTemplate(
        dados.mensagem_template ?? regraParaQuery.mensagem_template,
        c
      );
      const data_ultima_visita = c.data_ultima_compra
        ? new Date(c.data_ultima_compra).toLocaleDateString('pt-BR')
        : '';
      const data_nascimento = c.data_nascimento ? new Date(c.data_nascimento).toLocaleDateString('pt-BR') : null;
      const data_cadastro = c.data_cadastro ? new Date(c.data_cadastro).toLocaleDateString('pt-BR') : null;
      const data_ultima_compra = c.data_ultima_compra ? new Date(c.data_ultima_compra).toLocaleDateString('pt-BR') : null;

      clientesPreview.push({
        nome: c.nome?.trim() || 'Cliente',
        cpf: cpfNorm,
        telefone: c.telefone,
        dias_ausente: c.dias_ausente,
        data_ultima_visita,
        data_nascimento,
        data_cadastro,
        data_ultima_compra,
        qtd_compras: c.qtd_compras ?? 0,
        mensagem_previa,
        status,
      });
    }

    return {
      total_qualificados: totalQualificados,
      total_bloqueados_antispam: totalBloqueadosAntispam,
      clientes: clientesPreview,
    };
  }

  private estaNoHorarioDaRegra(regra: FidelizacaoRegra): boolean {
    const now = new Date();
    const hora = now.getHours();
    const min = now.getMinutes();
    const seg = now.getSeconds();
    const agoraSegundos = hora * 3600 + min * 60 + seg;

    const [hi, mi, si] = (regra.horario_inicio || '08:00:00').split(':').map(Number);
    const [hf, mf, sf] = (regra.horario_fim || '20:00:00').split(':').map(Number);
    const inicioSegundos = (hi || 0) * 3600 + (mi || 0) * 60 + (si || 0);
    const fimSegundos = (hf || 0) * 3600 + (mf || 0) * 60 + (sf || 0);

    return agoraSegundos >= inicioSegundos && agoraSegundos <= fimSegundos;
  }

  /**
   * Converte query_template com placeholders :user_id, :param_* em SQL com ? e array de valores (ordem de ocorrência).
   * Segmentação é aplicada depois via aplicarSegmentacao.
   */
  private buildQueryAndParams(tipo: FidelizacaoTipoGatilho, regra: FidelizacaoRegra): { sql: string; params: any[] } {
    let sql = tipo.query_template;

    const valueMap: Record<string, any> = {
      ':user_id': regra.user_id,
    };

    for (const campo of tipo.parametros_schema?.campos || []) {
      const key = (campo as any).placeholder_sql || `:param_${campo.nome}`;
      const val = regra.parametros[campo.nome];
      valueMap[key] = val !== undefined && val !== null ? val : (campo.default ?? null);
    }

    const params: any[] = [];
    const regex = /:[\w]+/g;
    let match;
    while ((match = regex.exec(sql)) !== null) {
      const ph = match[0];
      const value = valueMap[ph];
      params.push(value !== undefined ? value : null);
    }
    sql = sql.replace(/:[\w]+/g, '?');
    return { sql, params };
  }

  /**
   * Aplica filtros de segmentação de público (AND adicionais na query).
   */
  private aplicarSegmentacao(
    sql: string,
    params: any[],
    segmentacao: SegmentacaoPublico | null
  ): { sql: string; params: any[] } {
    if (!segmentacao || typeof segmentacao !== 'object') return { sql, params };
    const seg = segmentacao as Record<string, any>;
    const newParams: any[] = [...params];
    const clauses: string[] = [];

    if (seg.genero) {
      const generoVal = String(seg.genero).trim();
      if (generoVal) {
        const dbValues = generoVal === 'Feminino' ? ['F', 'Feminino'] : generoVal === 'Masculino' ? ['M', 'Masculino'] : generoVal === 'Outro' ? ['O', 'Outro'] : [generoVal];
        clauses.push(`c.genero IN (${dbValues.map(() => '?').join(', ')})`);
        newParams.push(...dbValues);
      }
    }
    const num = (v: any): number => (v === '' || v == null ? NaN : Number(v));
    if (seg.idade_min != null && seg.idade_min !== '') {
      clauses.push('c.data_nascimento IS NOT NULL AND TIMESTAMPDIFF(YEAR, c.data_nascimento, CURDATE()) >= ?');
      newParams.push(num(seg.idade_min));
    }
    if (seg.idade_max != null && seg.idade_max !== '') {
      clauses.push('TIMESTAMPDIFF(YEAR, c.data_nascimento, CURDATE()) <= ?');
      newParams.push(num(seg.idade_max));
    }
    if (seg.tempo_cadastro_min_dias != null && seg.tempo_cadastro_min_dias !== '') {
      clauses.push('c.data_cadastro IS NOT NULL AND c.data_cadastro <= NOW() - INTERVAL ? DAY');
      newParams.push(num(seg.tempo_cadastro_min_dias));
    }
    if (seg.qtd_compras_min != null && seg.qtd_compras_min !== '') {
      clauses.push('c.qtd_compras >= ?');
      newParams.push(num(seg.qtd_compras_min));
    }
    if (seg.qtd_compras_max != null && seg.qtd_compras_max !== '') {
      clauses.push('c.qtd_compras <= ?');
      newParams.push(num(seg.qtd_compras_max));
    }
    if (seg.valor_gasto_min != null && seg.valor_gasto_min !== '') {
      clauses.push('c.valor_total_compras >= ?');
      newParams.push(num(seg.valor_gasto_min));
    }
    if (seg.valor_gasto_max != null && seg.valor_gasto_max !== '') {
      clauses.push('c.valor_total_compras <= ?');
      newParams.push(num(seg.valor_gasto_max));
    }
    if (seg.qtd_compras_90_min != null && seg.qtd_compras_90_min !== '') {
      clauses.push('c.qtd_compras_90 >= ?');
      newParams.push(num(seg.qtd_compras_90_min));
    }
    if (seg.cadastro_de) {
      clauses.push('c.data_cadastro >= ?');
      newParams.push(seg.cadastro_de);
    }
    if (seg.cadastro_ate) {
      clauses.push('c.data_cadastro <= ?');
      newParams.push(seg.cadastro_ate);
    }
    if (seg.pedido_de || seg.pedido_ate) {
      const subParts: string[] = ['p2.cliente_cpf = c.cpf', 'p2.user_id = c.user_id', "p2.situacao_venda = 'Sucesso'"];
      if (seg.pedido_de) {
        subParts.push('p2.data_venda >= ?');
        newParams.push(seg.pedido_de);
      }
      if (seg.pedido_ate) {
        subParts.push('p2.data_venda <= ?');
        newParams.push(seg.pedido_ate);
      }
      clauses.push(`EXISTS (SELECT 1 FROM vm_lav_pedidos p2 WHERE ${subParts.join(' AND ')})`);
    }

    if (clauses.length === 0) return { sql, params };

    const groupByIdx = sql.search(/\bGROUP\s+BY\b/i);
    if (groupByIdx > 0) {
      const before = sql.slice(0, groupByIdx).trim();
      const after = sql.slice(groupByIdx);
      // Parâmetros da segmentação devem ficar ENTRE os do WHERE e os do HAVING.
      // buildQueryAndParams retorna params na ordem: [WHERE..., HAVING...]. Ao inserir
      // cláusulas antes do GROUP BY, os ? da segmentação ficam entre WHERE e HAVING.
      const countParamsBeforeGroupBy = (before.match(/\?/g) || []).length;
      const paramsBefore = params.slice(0, countParamsBeforeGroupBy);
      const paramsAfter = params.slice(countParamsBeforeGroupBy);
      const segmentacaoParams = newParams.slice(params.length);
      const reorderedParams = [...paramsBefore, ...segmentacaoParams, ...paramsAfter];
      return { sql: `${before} AND ${clauses.join(' AND ')} ${after}`, params: reorderedParams };
    }
    const whereIdx = sql.search(/\bWHERE\b/i);
    if (whereIdx > 0) {
      return { sql: `${sql} AND ${clauses.join(' AND ')}`, params: newParams };
    }
    return { sql: `${sql} WHERE ${clauses.join(' AND ')}`, params: newParams };
  }

  /**
   * Substitui ? na SQL pelos valores reais (para log/debug).
   */
  private sqlComParamsSubstituidos(sql: string, params: any[]): string {
    let i = 0;
    return sql.replace(/\?/g, () => {
      const v = params[i++];
      if (v === null || v === undefined) return 'NULL';
      if (typeof v === 'number' && !Number.isNaN(v)) return String(v);
      if (v instanceof Date) return `'${v.toISOString().slice(0, 19).replace('T', ' ')}'`;
      const s = String(v).replace(/'/g, "''");
      return `'${s}'`;
    });
  }

  private async executarQueryGatilho(tipo: FidelizacaoTipoGatilho, regra: FidelizacaoRegra): Promise<ClienteAlvo[]> {
    const conn = await pool.getConnection();
    try {
      let { sql, params } = this.buildQueryAndParams(tipo, regra);
      ({ sql, params } = this.aplicarSegmentacao(sql, params, regra.segmentacao ?? null));
      const sqlReal = this.sqlComParamsSubstituidos(sql, params);
      logger.info(`[Fidelizacao] Query gatilho ${tipo.codigo} (regra ${regra.nome_regra})`);
      logger.info(`  SQL executado:\n${sqlReal}`);
      const queryResult = await conn.query(sql, params) as any;

      let rows: any[] = [];
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
        rows = Array.from(queryResult as any);
      }

      return (rows || []).map((row: any) => ({
        id: row.id,
        user_id: row.user_id,
        nome: row.nome,
        cpf: row.cpf,
        telefone: row.telefone,
        data_ultima_compra: row.data_ultima_compra ? new Date(row.data_ultima_compra) : null,
        data_nascimento: row.data_nascimento ? new Date(row.data_nascimento) : null,
        data_cadastro: row.data_cadastro ? new Date(row.data_cadastro) : null,
        qtd_compras: Number(row.qtd_compras) || 0,
        valor_total_compras: Number(row.valor_total_compras) || 0,
        dias_ausente: row.dias_ausente != null ? Number(row.dias_ausente) : undefined,
        email: row.email,
        genero: row.genero ?? undefined,
        pedidos_fds: row.pedidos_fds != null ? Number(row.pedidos_fds) : undefined,
        pedidos_total: row.pedidos_total != null ? Number(row.pedidos_total) : undefined,
        percentual_fds: row.percentual_fds != null ? Number(row.percentual_fds) : undefined,
      }));
    } catch (err: any) {
      logger.error(`Erro ao executar query do gatilho ${tipo.codigo}: ${err?.message}`);
      return [];
    } finally {
      conn.release();
    }
  }

  private async verificarBloqueios(
    userId: number,
    regraId: number,
    frequenciaMinimaDias: number,
    cpfCliente: string,
    config: { max_mensagens_por_cliente_semana: number; max_mensagens_por_cliente_mes: number }
  ): Promise<boolean> {
    const cpfNorm = normalizeCpfToDigits(cpfCliente) ?? cpfCliente;
    if (!cpfNorm) return false;

    const conn = await pool.getConnection();
    try {
      const cpfCol = normalizeCpfColumnSql('cpf_cliente');
      const rowsRegra = (await conn.query(
        `SELECT 1 FROM fidelizacao_notificacoes
         WHERE user_id = ? AND ${cpfCol} = ? AND regra_id = ?
         AND data_envio > NOW() - INTERVAL ? DAY
         LIMIT 1`,
        [userId, cpfNorm, regraId, frequenciaMinimaDias]
      )) as any[];
      const arrRegra = Array.isArray(rowsRegra) ? rowsRegra : [];
      if (arrRegra.length > 0) return true;

      const rows7 = (await conn.query(
        `SELECT COUNT(*) as total FROM fidelizacao_notificacoes
         WHERE user_id = ? AND ${cpfCol} = ? AND regra_id IS NOT NULL
         AND data_envio >= NOW() - INTERVAL 7 DAY`,
        [userId, cpfNorm]
      )) as any[];
      const count7 = Array.isArray(rows7) && rows7[0] ? Number(rows7[0].total) : 0;
      if (count7 >= config.max_mensagens_por_cliente_semana) return true;

      const rows30 = (await conn.query(
        `SELECT COUNT(*) as total FROM fidelizacao_notificacoes
         WHERE user_id = ? AND ${cpfCol} = ? AND regra_id IS NOT NULL
         AND data_envio >= NOW() - INTERVAL 30 DAY`,
        [userId, cpfNorm]
      )) as any[];
      const count30 = Array.isArray(rows30) && rows30[0] ? Number(rows30[0].total) : 0;
      if (count30 >= config.max_mensagens_por_cliente_mes) return true;

      return false;
    } finally {
      conn.release();
    }
  }

  private processarTemplate(template: string, cliente: ClienteAlvo): string {
    let msg = template;
    const nome = cliente.nome?.trim() || 'Cliente';
    const primeiroNome = nome.split(/\s+/)[0] || 'Cliente';
    const diasAusente = cliente.dias_ausente != null ? String(cliente.dias_ausente) : '';
    const dataUltimaVisita = cliente.data_ultima_compra
      ? new Date(cliente.data_ultima_compra).toLocaleDateString('pt-BR')
      : '';
    const qtdCompras = String(cliente.qtd_compras ?? 0);
    const valorTotal = typeof cliente.valor_total_compras === 'number'
      ? `R$ ${cliente.valor_total_compras.toFixed(2).replace('.', ',')}`
      : '';

    msg = msg.replace(/\{nome\}/g, nome);
    msg = msg.replace(/\{primeiro_nome\}/g, primeiroNome);
    msg = msg.replace(/\{dias_ausente\}/g, diasAusente);
    msg = msg.replace(/\{data_ultima_visita\}/g, dataUltimaVisita);
    msg = msg.replace(/\{qtd_compras\}/g, qtdCompras);
    msg = msg.replace(/\{valor_total\}/g, valorTotal);
    const pedidosFds = (cliente as any).pedidos_fds != null ? String((cliente as any).pedidos_fds) : '';
    const pedidosTotal = (cliente as any).pedidos_total != null ? String((cliente as any).pedidos_total) : '';
    const percentualFds = (cliente as any).percentual_fds != null ? String((cliente as any).percentual_fds) : '';
    msg = msg.replace(/\{pedidos_fds\}/g, pedidosFds);
    msg = msg.replace(/\{pedidos_total\}/g, pedidosTotal);
    msg = msg.replace(/\{percentual_fds\}/g, percentualFds);
    return msg.trim();
  }
}
