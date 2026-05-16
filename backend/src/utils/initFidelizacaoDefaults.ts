import pool from '../config/database';
import logger from './logger';
import { FidelizacaoConfigModel } from '../models/fidelizacaoConfig.model';

/**
 * Inicializa valores padrão de configuração de fidelização para todos os usuários
 * Pode ser chamado manualmente ou automaticamente durante a migration
 */
export async function initFidelizacaoDefaults(): Promise<void> {
  const conn = await pool.getConnection();
  try {
    logger.info('Inicializando valores padrão de configuração de notificações...');
    
    const configModel = new FidelizacaoConfigModel();
    
    // Por enquanto, usar user_id = 1 hardcoded (único usuário presente no banco)
    const userIds = [1];
    
    logger.info(`Inicializando configurações para ${userIds.length} usuário(s)`);
    
    let criados = 0;
    let jaExistentes = 0;
    let erros = 0;
    
    for (const userId of userIds) {
      try {
        
        // Verificar se já existe
        const existing = await configModel.findByUserId(userId);
        
        if (existing) {
          logger.info(`Configuração já existe para usuário ${userId}`);
          jaExistentes++;
        } else {
          // Criar configuração padrão
          await configModel.getOrCreateDefault(userId);
          logger.info(`✅ Configuração padrão criada para usuário ${userId}`);
          criados++;
        }
      } catch (error: any) {
        logger.error(`❌ Erro ao criar configuração padrão para usuário ${userId}: ${error.message}`);
        logger.error('Stack: ' + (error.stack || 'N/A'));
        erros++;
      }
    }
    
    logger.info(
      `✅ Inicialização de configurações concluída: ` +
      `${criados} criadas, ${jaExistentes} já existentes, ${erros} erros`
    );
  } catch (error: any) {
    logger.error('Erro ao inicializar configurações padrão: ' + String(error.message));
    throw error;
  } finally {
    conn.release();
  }
}

