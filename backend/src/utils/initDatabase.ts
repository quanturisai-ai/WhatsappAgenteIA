import fs from 'fs';
import path from 'path';
import mariadb from 'mariadb';
import pool from '../config/database';
import logger from './logger';
import { migrateIndexingColumns } from './migrateIndexingColumns';
import { migrateModelColumns } from './migrateModelColumns';
import { migrateGenerationParams } from './migrateGenerationParams';
import { migrateMediaIsActive } from './migrateMediaIsActive';
import { migrateVmLavTables } from './migrateVmLavTables';

export async function initDatabase(): Promise<void> {
  try {
    const schemaPath = path.join(__dirname, '../config/database.schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');

    // Primeiro, criar o banco de dados se não existir (usando conexão sem database)
    const dbName = process.env.DB_NAME || 'agente_zap';
    const tempPool = mariadb.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD,
      allowPublicKeyRetrieval: true,
    });
    
    try {
      const tempConn = await tempPool.getConnection();
      try {
        await tempConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        logger.debug(`Banco de dados ${dbName} verificado/criado`);
      } finally {
        tempConn.release();
      }
    } finally {
      await tempPool.end();
    }

    const conn = await pool.getConnection();
    try {
      // Garantir que estamos usando o banco correto
      await conn.query(`USE \`${dbName}\``);

      // Dividir o schema em comandos individuais
      const commands = schema
        .split(';')
        .map((cmd) => cmd.trim())
        .filter((cmd) => {
          // Filtrar comandos vazios e comentários
          if (!cmd || cmd.length === 0) return false;
          if (cmd.startsWith('--')) return false;
          // Remover comentários de linha do comando
          const lines = cmd.split('\n');
          const cleanLines = lines
            .map(line => {
              const commentIndex = line.indexOf('--');
              return commentIndex >= 0 ? line.substring(0, commentIndex).trim() : line.trim();
            })
            .filter(line => line.length > 0);
          return cleanLines.length > 0;
        });

      // Executar cada comando
      for (const command of commands) {
        if (command.trim()) {
          try {
            await conn.query(command);
            logger.debug(`Comando SQL executado: ${command.substring(0, 50)}...`);
          } catch (error: any) {
            // Ignorar erros de tabela já existente
            if (error.message.includes('already exists') || error.code === 'ER_TABLE_EXISTS_ERROR') {
              logger.debug(`Tabela já existe, ignorando: ${error.message}`);
            } else {
              logger.error(`Erro ao executar comando SQL: ${error.message}`);
              logger.error(`Comando: ${command.substring(0, 100)}...`);
              throw error;
            }
          }
        }
      }
      logger.info('✅ Schema do banco de dados inicializado');
    } finally {
      conn.release();
    }

    // Executar migrações
    await migrateIndexingColumns();
    await migrateModelColumns();
    await migrateGenerationParams();
    await migrateMediaIsActive();
    await migrateVmLavTables();
  } catch (error: any) {
    logger.error(`Erro ao inicializar banco de dados: ${error.message}`);
    logger.error(error.stack);
    throw error;
  }
}

