import { migrateVmLavTables } from './migrateVmLavTables';
import logger from './logger';

async function testMigration() {
  try {
    logger.info('Iniciando teste de migration...');
    await migrateVmLavTables();
    logger.info('✅ Teste de migration concluído com sucesso');
    process.exit(0);
  } catch (error: any) {
    logger.error('❌ Erro no teste de migration: ' + error.message);
    console.error(error);
    process.exit(1);
  }
}

testMigration();

