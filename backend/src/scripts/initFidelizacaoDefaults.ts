#!/usr/bin/env node
/**
 * Script para inicializar valores padrão de configuração de fidelização
 * Execute: npm run init-fidelizacao-defaults
 * ou: npx ts-node src/scripts/initFidelizacaoDefaults.ts
 */

import dotenv from 'dotenv';
import { initFidelizacaoDefaults } from '../utils/initFidelizacaoDefaults';
import logger from '../utils/logger';

// Carregar variáveis de ambiente
dotenv.config();

async function main() {
  try {
    logger.info('🚀 Iniciando script de inicialização de valores padrão de fidelização...');
    await initFidelizacaoDefaults();
    logger.info('✅ Script concluído com sucesso!');
    process.exit(0);
  } catch (error: any) {
    logger.error('❌ Erro ao executar script: ' + error.message);
    console.error(error);
    process.exit(1);
  }
}

main();

