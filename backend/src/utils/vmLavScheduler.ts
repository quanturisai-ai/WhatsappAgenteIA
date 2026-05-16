import logger from './logger';
import { VmLavService } from '../services/vmLav.service';
import { VmLavCredentialsModel } from '../models/vmLavCredentials.model';
import pool from '../config/database';

const vmLavService = new VmLavService();
const credentialsModel = new VmLavCredentialsModel();

/**
 * Sincroniza clientes para todos os usuários ativos
 */
async function sincronizarTodosUsuarios(): Promise<void> {
  try {
    logger.info('Iniciando sincronização automática de clientes VM Lav...');

    // Buscar todos os user_ids com credenciais ativas
    const conn = await pool.getConnection();
    try {
      const queryResult = await conn.query(
        'SELECT DISTINCT user_id FROM vm_lav_credentials WHERE ativo = 1 AND status = ?',
        ['ativo']
      ) as any;

      // Extrair rows de forma segura (mesmo padrão usado nos models)
      let rows: any[] = [];
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
        rows = Array.from(queryResult as any);
      }

      if (!rows || rows.length === 0) {
        logger.warn('Nenhum usuário com credenciais ativas encontrado (verifique se há credenciais com ativo=1 e status="ativo")');
        return;
      }

      const userIds = rows.map((row: any) => row.user_id);
      logger.info(`Encontrados ${userIds.length} usuário(s) com credenciais ativas: ${userIds.join(', ')}`);

      // Sincronizar cada usuário
      for (const userId of userIds) {
        await sincronizarUsuario(userId);
        // Pequeno delay entre sincronizações para não sobrecarregar
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      logger.info('Sincronização automática concluída');
    } finally {
      conn.release();
    }
  } catch (error: any) {
    logger.error(`Erro na sincronização automática: ${error.message}`);
  }
}

/**
 * Sincroniza clientes e pedidos para um usuário específico (sincronização automática)
 */
export async function sincronizarUsuario(userId: number): Promise<void> {
  try {
    logger.info(`Sincronizando clientes VM Lav para usuário ${userId}...`);
    
    // Sincronizar clientes (sempre busca todos)
    const resultadoClientes = await vmLavService.sincronizarClientes(userId);
    
    if (resultadoClientes.success) {
      logger.info(`✅ Sincronização de clientes concluída para usuário ${userId}: ${resultadoClientes.total} clientes`);
    } else {
      logger.warn(`⚠️  Sincronização de clientes falhou para usuário ${userId}: ${resultadoClientes.message}`);
    }

    // Sincronizar pedidos da última semana (apenasUltimaSemana = true)
    logger.info(`Sincronizando pedidos da última semana para usuário ${userId}...`);
    const resultadoPedidos = await vmLavService.sincronizarPedidos(userId, true);
    
    if (resultadoPedidos.success) {
      logger.info(`✅ Sincronização de pedidos concluída para usuário ${userId}: ${resultadoPedidos.total || 0} pedidos`);
    } else {
      logger.warn(`⚠️  Sincronização de pedidos falhou para usuário ${userId}: ${resultadoPedidos.message}`);
    }
  } catch (error: any) {
    logger.error(`Erro ao sincronizar usuário ${userId}: ${error.message}`);
  }
}

// Timer único para verificação periódica
let verificacaoTimer: NodeJS.Timeout | null = null;

/**
 * Verifica quais usuários precisam ser sincronizados baseado em ultima_sincronizacao + intervalo
 */
async function verificarESincronizarUsuarios(): Promise<void> {
  try {
    const conn = await pool.getConnection();
    try {
      // Buscar todos os usuários com credenciais ativas
      const queryResult = await conn.query(
        `SELECT DISTINCT user_id, intervalo_sincronizacao_minutos, ultima_sincronizacao 
         FROM vm_lav_credentials 
         WHERE ativo = 1 AND status = ?`,
        ['ativo']
      ) as any;

      // Extrair rows de forma segura
      let rows: any[] = [];
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
        rows = Array.from(queryResult as any);
      }

      if (!rows || rows.length === 0) {
        logger.debug('Nenhum usuário ativo encontrado para sincronização');
        return;
      }

      const agora = new Date();
      const usuariosParaSincronizar: number[] = [];

      for (const row of rows) {
        const userId = row.user_id;
        const intervaloMinutos = row.intervalo_sincronizacao_minutos || 10;
        const ultimaSincronizacao = row.ultima_sincronizacao;

        // Se nunca foi sincronizado, adicionar à lista
        if (!ultimaSincronizacao) {
          usuariosParaSincronizar.push(userId);
          logger.debug(`Usuário ${userId} nunca foi sincronizado, será sincronizado agora`);
          continue;
        }

        // Calcular próxima sincronização
        const ultimaSync = new Date(ultimaSincronizacao);
        const proximaSync = new Date(ultimaSync.getTime() + (intervaloMinutos * 60 * 1000));

        // Se já passou o tempo, adicionar à lista
        if (agora >= proximaSync) {
          usuariosParaSincronizar.push(userId);
          const minutosAtraso = Math.floor((agora.getTime() - proximaSync.getTime()) / (60 * 1000));
          logger.debug(`Usuário ${userId} precisa sincronizar (última: ${ultimaSync.toLocaleString('pt-BR')}, intervalo: ${intervaloMinutos}min, atraso: ${minutosAtraso}min)`);
        }
      }

      // Sincronizar usuários que precisam
      if (usuariosParaSincronizar.length > 0) {
        logger.info(`Sincronizando ${usuariosParaSincronizar.length} usuário(s): ${usuariosParaSincronizar.join(', ')}`);
        for (const userId of usuariosParaSincronizar) {
          await sincronizarUsuario(userId).catch((error: any) => {
            logger.error(`Erro ao sincronizar usuário ${userId}: ${error.message}`);
          });
          // Pequeno delay entre sincronizações
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } else {
        logger.debug('Nenhum usuário precisa ser sincronizado no momento');
      }
    } finally {
      conn.release();
    }
  } catch (error: any) {
    logger.error(`Erro ao verificar usuários para sincronização: ${error.message}`);
  }
}

/**
 * Inicia o scheduler para sincronização automática com intervalos configuráveis por usuário
 * Usa um único timer que verifica periodicamente quais usuários precisam ser sincronizados
 */
export function iniciarScheduler(): void {
  logger.info('Iniciando scheduler VM Lav (verificação baseada em timestamp)...');

  // Sincronizar imediatamente ao iniciar
  sincronizarTodosUsuarios().catch((error: any) => {
    logger.error(`Erro na sincronização inicial: ${error.message}`);
  });

  // Verificar a cada 1 minuto quais usuários precisam ser sincronizados
  // Isso é mais simples e confiável do que múltiplos timers
  const INTERVALO_VERIFICACAO_MS = 60 * 1000; // 1 minuto

  // Cancelar timer existente se houver (caso de reinicialização)
  if (verificacaoTimer) {
    clearInterval(verificacaoTimer);
  }

  // Criar timer único
  verificacaoTimer = setInterval(() => {
    verificarESincronizarUsuarios().catch((error: any) => {
      logger.error(`Erro na verificação periódica: ${error.message}`);
    });
  }, INTERVALO_VERIFICACAO_MS);

  logger.info(`✅ Scheduler VM Lav iniciado (verifica a cada ${INTERVALO_VERIFICACAO_MS / 1000} segundos)`);
  logger.info('   A sincronização será executada quando: ultima_sincronizacao + intervalo_sincronizacao_minutos < agora');
}

