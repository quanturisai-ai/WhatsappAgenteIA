/**
 * Script para adicionar o status 'connection_failed' ao ENUM da tabela whatsapp_sessions
 * 
 * Execute: npx ts-node src/scripts/add-connection-failed-status.ts
 */

import pool from '../config/database';
import logger from '../utils/logger';

async function addConnectionFailedStatus() {
  const conn = await pool.getConnection();
  
  try {
    logger.info('🔄 Iniciando migração: Adicionar status "connection_failed" ao ENUM...');
    
    // Verificar o ENUM atual
    const currentEnumResult = await conn.query(`
      SELECT COLUMN_TYPE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'whatsapp_sessions' 
        AND COLUMN_NAME = 'status'
    `) as any;
    
    let currentEnum: any[];
    if (Array.isArray(currentEnumResult) && Array.isArray(currentEnumResult[0])) {
      [currentEnum] = currentEnumResult;
    } else {
      currentEnum = Array.isArray(currentEnumResult) ? currentEnumResult : [currentEnumResult];
    }
    
    if (currentEnum && currentEnum.length > 0) {
      const currentType = currentEnum[0].COLUMN_TYPE || currentEnum[0]?.COLUMN_TYPE;
      logger.info(`📋 ENUM atual: ${currentType}`);
      
      // Verificar se 'connection_failed' já existe
      if (currentType && currentType.includes('connection_failed')) {
        logger.info('✅ Status "connection_failed" já existe no ENUM. Nenhuma alteração necessária.');
        return;
      }
    }
    
    // Adicionar 'connection_failed' ao ENUM
    logger.info('🔧 Adicionando "connection_failed" ao ENUM...');
    await conn.query(`
      ALTER TABLE whatsapp_sessions 
      MODIFY COLUMN status ENUM('disconnected', 'connecting', 'connected', 'authenticated', 'connection_failed') 
      DEFAULT 'disconnected'
    `);
    
    // Verificar se a alteração foi aplicada
    const updatedEnumResult = await conn.query(`
      SELECT COLUMN_TYPE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'whatsapp_sessions' 
        AND COLUMN_NAME = 'status'
    `) as any;
    
    let updatedEnum: any[];
    if (Array.isArray(updatedEnumResult) && Array.isArray(updatedEnumResult[0])) {
      [updatedEnum] = updatedEnumResult;
    } else {
      updatedEnum = Array.isArray(updatedEnumResult) ? updatedEnumResult : [updatedEnumResult];
    }
    
    if (updatedEnum && updatedEnum.length > 0) {
      const newType = updatedEnum[0].COLUMN_TYPE || updatedEnum[0]?.COLUMN_TYPE;
      logger.info(`✅ ENUM atualizado: ${newType}`);
      
      if (newType && newType.includes('connection_failed')) {
        logger.info('✅ Migração concluída com sucesso!');
        logger.info('📊 Status disponíveis: disconnected, connecting, connected, authenticated, connection_failed');
      } else {
        logger.error('❌ Erro: Status "connection_failed" não foi adicionado ao ENUM.');
        process.exit(1);
      }
    } else {
      logger.error('❌ Erro: Não foi possível verificar o ENUM atualizado.');
      logger.error(`Resultado: ${JSON.stringify(updatedEnumResult)}`);
      process.exit(1);
    }
    
  } catch (error: any) {
    logger.error(`❌ Erro ao executar migração: ${error.message}`);
    logger.error(`Stack: ${error.stack}`);
    process.exit(1);
  } finally {
    conn.release();
    await pool.end();
    process.exit(0);
  }
}

// Executar migração
addConnectionFailedStatus();

