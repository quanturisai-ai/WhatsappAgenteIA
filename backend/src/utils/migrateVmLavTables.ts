import pool from '../config/database';
import logger from './logger';
import fs from 'fs';
import path from 'path';

export async function migrateVmLavTables(): Promise<void> {
  const conn = await pool.getConnection();
  try {
    logger.info('Iniciando migração: adicionando tabelas VM Lav...');

    // Ler o arquivo SQL principal
    const sqlPath = path.join(__dirname, '../config/migrations/add_vm_lav_tables.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    // Dividir em comandos individuais
    const commands = sql
      .split(';')
      .map((cmd) => cmd.trim())
      .filter((cmd) => {
        if (!cmd || cmd.length === 0) return false;
        if (cmd.startsWith('--')) return false;
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
          logger.debug('Comando SQL executado: ' + command.substring(0, 50) + '...');
        } catch (error: any) {
          // Ignorar erros de tabela já existente
          if (error.message.includes('already exists') || error.code === 'ER_TABLE_EXISTS_ERROR') {
            logger.debug('Tabela já existe, ignorando: ' + String(error.message));
          } else {
            logger.error('Erro ao executar comando SQL: ' + String(error.message));
            logger.error('Comando: ' + command.substring(0, 100) + '...');
            throw error;
          }
        }
      }
    }

    // Verificar e corrigir coluna user_id na tabela vm_lav_clientes
    logger.info('Verificando coluna user_id na tabela vm_lav_clientes...');
    try {
      // Verificar se a coluna existe
      const [columns] = await conn.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'vm_lav_clientes' 
         AND COLUMN_NAME = 'user_id'`
      ) as any[];

      if (!columns || columns.length === 0) {
        logger.info('Coluna user_id não existe, adicionando...');
        
        // Verificar se há dados na tabela
        const [countRows] = await conn.query(
          'SELECT COUNT(*) as count FROM vm_lav_clientes'
        ) as any[];
        const hasData = countRows && countRows[0] && countRows[0].count > 0;
        
        if (hasData) {
          logger.warn('Tabela vm_lav_clientes contém dados. Adicionando coluna user_id como NULL temporariamente...');
          // Adicionar coluna como NULL primeiro
          await conn.query(
            `ALTER TABLE vm_lav_clientes 
             ADD COLUMN user_id INT NULL COMMENT 'ID do usuário que possui estes clientes' AFTER id`
          );
          
          // Atualizar registros existentes com user_id = 1 (ou o primeiro usuário disponível)
          const [users] = await conn.query('SELECT id FROM users ORDER BY id LIMIT 1') as any[];
          if (users && users.length > 0) {
            const defaultUserId = users[0].id;
            logger.info('Atualizando registros existentes com user_id = ' + String(defaultUserId));
            await conn.query(
              'UPDATE vm_lav_clientes SET user_id = ? WHERE user_id IS NULL',
              [defaultUserId]
            );
          }
          
          // Agora tornar a coluna NOT NULL
          await conn.query(
            `ALTER TABLE vm_lav_clientes 
             MODIFY COLUMN user_id INT NOT NULL COMMENT 'ID do usuário que possui estes clientes'`
          );
        } else {
          // Adicionar coluna user_id diretamente como NOT NULL se não houver dados
          await conn.query(
            `ALTER TABLE vm_lav_clientes 
             ADD COLUMN user_id INT NOT NULL COMMENT 'ID do usuário que possui estes clientes' AFTER id`
          );
        }
        
        // Adicionar foreign key
        try {
          await conn.query(
            `ALTER TABLE vm_lav_clientes 
             ADD CONSTRAINT fk_vm_lav_clientes_user_id 
             FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`
          );
        } catch (fkError: any) {
          if (!fkError.message.includes('Duplicate foreign key')) {
            logger.warn('Erro ao adicionar foreign key (pode já existir): ' + String(fkError.message));
          }
        }
        
        // Adicionar índice
        try {
          await conn.query('CREATE INDEX idx_user_id ON vm_lav_clientes(user_id)');
        } catch (idxError: any) {
          if (!idxError.message.includes('Duplicate key name')) {
            logger.warn('Erro ao adicionar índice (pode já existir): ' + String(idxError.message));
          }
        }
        
        // Adicionar unique constraint
        try {
          await conn.query(
            `ALTER TABLE vm_lav_clientes 
             ADD CONSTRAINT unique_user_vm_cliente UNIQUE (user_id, id_cliente_vm)`
          );
        } catch (uniqueError: any) {
          if (!uniqueError.message.includes('Duplicate key name')) {
            logger.warn('Erro ao adicionar unique constraint (pode já existir): ' + String(uniqueError.message));
          }
        }
        
        logger.info('✅ Coluna user_id adicionada com sucesso');
      } else {
        logger.info('✅ Coluna user_id já existe');
      }
    } catch (error: any) {
      logger.error('Erro ao verificar/adicionar coluna user_id: ' + String(error.message));
      // Não lançar erro, apenas logar - a tabela pode já estar correta
    }

    // Migrar tabela de pedidos
    logger.info('Migrando tabela vm_lav_pedidos...');
    try {
      const pedidosSqlPath = path.join(__dirname, '../config/migrations/add_vm_lav_pedidos_table.sql');
      const pedidosSql = fs.readFileSync(pedidosSqlPath, 'utf-8');

      const pedidosCommands = pedidosSql
        .split(';')
        .map((cmd) => cmd.trim())
        .filter((cmd) => {
          if (!cmd || cmd.length === 0) return false;
          if (cmd.startsWith('--')) return false;
          const lines = cmd.split('\n');
          const cleanLines = lines
            .map(line => {
              const commentIndex = line.indexOf('--');
              return commentIndex >= 0 ? line.substring(0, commentIndex).trim() : line.trim();
            })
            .filter(line => line.length > 0);
          return cleanLines.length > 0;
        });

      for (const command of pedidosCommands) {
        if (command.trim()) {
          try {
            await conn.query(command);
            logger.debug('Comando SQL de pedidos executado: ' + command.substring(0, 50) + '...');
          } catch (error: any) {
            if (error.message.includes('already exists') || error.code === 'ER_TABLE_EXISTS_ERROR') {
              logger.debug('Tabela de pedidos já existe, ignorando: ' + String(error.message));
            } else {
              logger.error('Erro ao executar comando SQL de pedidos: ' + String(error.message));
              throw error;
            }
          }
        }
      }
      logger.info('✅ Tabela vm_lav_pedidos migrada com sucesso');
    } catch (error: any) {
      logger.error('Erro ao migrar tabela de pedidos: ' + String(error.message));
      // Não lançar erro, apenas logar - pode ser que a tabela já exista
    }

    // Remover campo data_inicio_utilizacoes de vm_lav_clientes se existir (foi movido para premios)
    logger.info('Verificando campo data_inicio_utilizacoes na tabela vm_lav_clientes para remoção...');
    try {
      const [columns] = await conn.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'vm_lav_clientes' 
         AND COLUMN_NAME = 'data_inicio_utilizacoes'`
      ) as any[];

      if (columns && columns.length > 0) {
        logger.info('Removendo campo data_inicio_utilizacoes de vm_lav_clientes (foi movido para premios)...');
        await conn.query(
          `ALTER TABLE vm_lav_clientes 
           DROP COLUMN data_inicio_utilizacoes`
        );
        logger.info('✅ Campo data_inicio_utilizacoes removido de vm_lav_clientes');
      } else {
        logger.info('✅ Campo data_inicio_utilizacoes não existe em vm_lav_clientes (já foi removido ou nunca existiu)');
      }
    } catch (error: any) {
      logger.warn('Erro ao verificar/remover campo data_inicio_utilizacoes de vm_lav_clientes: ' + String(error.message));
      // Não é crítico, apenas logar
    }

    // Migrar tabelas de fidelização
    logger.info('Migrando tabelas de fidelização...');
    try {
      const fidelizacaoSqlPath = path.join(__dirname, '../config/migrations/add_fidelizacao_tables.sql');
      const fidelizacaoSql = fs.readFileSync(fidelizacaoSqlPath, 'utf-8');

      const fidelizacaoCommands = fidelizacaoSql
        .split(';')
        .map((cmd) => cmd.trim())
        .filter((cmd) => {
          if (!cmd || cmd.length === 0) return false;
          if (cmd.startsWith('--')) return false;
          const lines = cmd.split('\n');
          const cleanLines = lines
            .map(line => {
              const commentIndex = line.indexOf('--');
              return commentIndex >= 0 ? line.substring(0, commentIndex).trim() : line.trim();
            })
            .filter(line => line.length > 0);
          return cleanLines.length > 0;
        });

      for (const command of fidelizacaoCommands) {
        if (command.trim()) {
          try {
            await conn.query(command);
            logger.debug('Comando SQL de fidelização executado: ' + command.substring(0, 50) + '...');
          } catch (error: any) {
            if (error.message.includes('already exists') || error.code === 'ER_TABLE_EXISTS_ERROR' || 
                error.message.includes('Duplicate column name') || error.code === 'ER_DUP_FIELDNAME') {
              logger.debug('Tabela/coluna de fidelização já existe, ignorando: ' + String(error.message));
            } else {
              logger.error('Erro ao executar comando SQL de fidelização: ' + String(error.message));
              throw error;
            }
          }
        }
      }
      logger.info('✅ Tabelas de fidelização migradas com sucesso');
    } catch (error: any) {
      logger.error('Erro ao migrar tabelas de fidelização: ' + String(error.message));
      // Não lançar erro, apenas logar - pode ser que as tabelas já existam
    }

    // Adicionar coluna tipo_atingimento se não existir
    logger.info('Verificando coluna tipo_atingimento na tabela premios...');
    try {
      const [columns] = await conn.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'premios' 
         AND COLUMN_NAME = 'tipo_atingimento'`
      ) as any[];

      if (!columns || columns.length === 0) {
        logger.info('Adicionando coluna tipo_atingimento na tabela premios...');
        await conn.query(
          `ALTER TABLE premios 
           ADD COLUMN tipo_atingimento ENUM('UNICO', 'PERPETUO') DEFAULT 'UNICO' 
           COMMENT 'Tipo de atingimento: UNICO (conquista uma vez) ou PERPETUO (pode conquistar múltiplas vezes)' 
           AFTER data_inicio_utilizacoes`
        );
        logger.info('✅ Coluna tipo_atingimento adicionada na tabela premios');
      } else {
        logger.info('✅ Coluna tipo_atingimento já existe na tabela premios');
      }
    } catch (error: any) {
      logger.warn('Erro ao verificar/adicionar coluna tipo_atingimento: ' + String(error.message));
      // Não é crítico, apenas logar
    }

    // Adicionar coluna data_fim_utilizacoes se não existir
    logger.info('Verificando coluna data_fim_utilizacoes na tabela premios...');
    try {
      const [columns] = await conn.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'premios' 
         AND COLUMN_NAME = 'data_fim_utilizacoes'`
      ) as any[];

      if (!columns || columns.length === 0) {
        logger.info('Adicionando coluna data_fim_utilizacoes na tabela premios...');
        await conn.query(
          `ALTER TABLE premios 
           ADD COLUMN data_fim_utilizacoes DATE NULL 
           COMMENT 'Data até a qual as utilizações contam para este prêmio (NULL = sem data de fim)' 
           AFTER data_inicio_utilizacoes`
        );
        logger.info('✅ Coluna data_fim_utilizacoes adicionada na tabela premios');
      } else {
        logger.info('✅ Coluna data_fim_utilizacoes já existe na tabela premios');
      }
    } catch (error: any) {
      logger.warn('Erro ao verificar/adicionar coluna data_fim_utilizacoes: ' + String(error.message));
      // Não é crítico, apenas logar
    }

    // Executar migration de tabelas de notificações de fidelização
    logger.info('Executando migration: tabelas de notificações de fidelização...');
    try {
      const notificacoesSqlPath = path.join(__dirname, '../config/migrations/add_fidelizacao_notificacoes_tables.sql');
      if (fs.existsSync(notificacoesSqlPath)) {
        const notificacoesSql = fs.readFileSync(notificacoesSqlPath, 'utf-8');
        
        // Remover comentários de linha (-- comentário)
        const sqlSemComentarios = notificacoesSql
          .split('\n')
          .map(line => {
            const commentIndex = line.indexOf('--');
            return commentIndex >= 0 ? line.substring(0, commentIndex).trim() : line.trim();
          })
          .filter(line => line.length > 0 && !line.startsWith('--'))
          .join('\n');
        
        // Dividir por ponto e vírgula, mas manter comandos completos
        const notificacoesCommands = sqlSemComentarios
          .split(';')
          .map((cmd) => cmd.trim())
          .filter((cmd) => cmd.length > 0 && cmd.toUpperCase().includes('CREATE'));

        for (const command of notificacoesCommands) {
          if (command.trim()) {
            try {
              // Adicionar ponto e vírgula de volta
              const fullCommand = command.endsWith(';') ? command : command + ';';
              await conn.query(fullCommand);
              logger.info('✅ Comando SQL de notificações executado: ' + command.substring(0, 80) + '...');
            } catch (error: any) {
              if (error.message.includes('already exists') || error.code === 'ER_TABLE_EXISTS_ERROR') {
                logger.info('ℹ️ Tabela de notificações já existe, ignorando');
              } else {
                logger.error('❌ Erro ao executar comando SQL de notificações: ' + String(error.message));
                logger.error('Comando problemático: ' + command.substring(0, 300));
                // Não falhar a migração por causa disso, mas logar o erro
              }
            }
          }
        }
        logger.info('✅ Migration de notificações de fidelização concluída');
        
        // Inicializar valores padrão para todos os usuários existentes
        try {
          const { initFidelizacaoDefaults } = await import('./initFidelizacaoDefaults');
          await initFidelizacaoDefaults();
        } catch (error: any) {
          logger.warn('Erro ao inicializar configurações padrão: ' + String(error.message));
          logger.warn('Stack: ' + (error.stack || 'N/A'));
          // Não falhar a migração por causa disso
        }
      } else {
        logger.warn('Arquivo de migration de notificações não encontrado: ' + notificacoesSqlPath);
      }
    } catch (error: any) {
      logger.warn('Erro ao executar migration de notificações: ' + String(error.message));
      // Não falhar a migração principal por causa disso
    }

    // Adicionar coluna intervalo_sincronizacao_minutos se não existir
    logger.info('Verificando coluna intervalo_sincronizacao_minutos na tabela vm_lav_credentials...');
    try {
      const [columns] = await conn.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'vm_lav_credentials' 
         AND COLUMN_NAME = 'intervalo_sincronizacao_minutos'`
      ) as any[];

      if (!columns || columns.length === 0) {
        logger.info('Adicionando coluna intervalo_sincronizacao_minutos na tabela vm_lav_credentials...');
        await conn.query(
          `ALTER TABLE vm_lav_credentials 
           ADD COLUMN intervalo_sincronizacao_minutos INT DEFAULT 10 
           COMMENT 'Intervalo em minutos para sincronização automática (padrão: 10 minutos)'`
        );
        logger.info('✅ Coluna intervalo_sincronizacao_minutos adicionada na tabela vm_lav_credentials');
      } else {
        logger.info('✅ Coluna intervalo_sincronizacao_minutos já existe na tabela vm_lav_credentials');
      }
    } catch (error: any) {
      logger.warn('Erro ao verificar/adicionar coluna intervalo_sincronizacao_minutos: ' + String(error.message));
      // Não é crítico, apenas logar
    }

    // Executar migration de melhorias (tabela de log de sincronizações)
    logger.info('Executando migration: melhorias de autenticação e sincronização...');
    try {
      const melhoriasSqlPath = path.join(__dirname, '../config/migrations/add_vm_lav_improvements.sql');
      if (fs.existsSync(melhoriasSqlPath)) {
        const melhoriasSql = fs.readFileSync(melhoriasSqlPath, 'utf-8');
        
        // Remover comentários de linha (-- comentário)
        const sqlSemComentarios = melhoriasSql
          .split('\n')
          .map(line => {
            const commentIndex = line.indexOf('--');
            return commentIndex >= 0 ? line.substring(0, commentIndex).trim() : line.trim();
          })
          .filter(line => line.length > 0 && !line.startsWith('--'))
          .join('\n');
        
        // Dividir por ponto e vírgula, mas manter comandos completos
        const melhoriasCommands = sqlSemComentarios
          .split(';')
          .map((cmd) => cmd.trim())
          .filter((cmd) => cmd.length > 0 && cmd.toUpperCase().includes('CREATE'));

        for (const command of melhoriasCommands) {
          if (command.trim()) {
            try {
              // Adicionar ponto e vírgula de volta
              const fullCommand = command.endsWith(';') ? command : command + ';';
              await conn.query(fullCommand);
              logger.info('✅ Comando SQL de melhorias executado: ' + command.substring(0, 80) + '...');
            } catch (error: any) {
              if (error.message.includes('already exists') || error.code === 'ER_TABLE_EXISTS_ERROR') {
                logger.info('ℹ️ Tabela de melhorias já existe, ignorando');
              } else {
                logger.error('❌ Erro ao executar comando SQL de melhorias: ' + String(error.message));
                logger.error('Comando problemático: ' + command.substring(0, 300));
                // Não falhar a migração por causa disso, mas logar o erro
              }
            }
          }
        }
        logger.info('✅ Migration de melhorias concluída');
      } else {
        logger.warn('Arquivo de migration de melhorias não encontrado: ' + melhoriasSqlPath);
      }
    } catch (error: any) {
      logger.warn('Erro ao executar migration de melhorias: ' + String(error.message));
      // Não falhar a migração principal por causa disso
    }

    // Criar função normaliza_numeros se não existir
    logger.info('Verificando função normaliza_numeros...');
    try {
      const [functions] = await conn.query(
        `SELECT ROUTINE_NAME FROM information_schema.ROUTINES 
         WHERE ROUTINE_SCHEMA = DATABASE() 
         AND ROUTINE_NAME = 'normaliza_numeros' 
         AND ROUTINE_TYPE = 'FUNCTION'`
      ) as any[];

      if (!functions || functions.length === 0) {
        logger.info('Criando função normaliza_numeros...');
        // Usar método compatível com MariaDB (loop para remover caracteres não numéricos)
        // Criar função em uma única query sem DELIMITER
        const functionSql = `CREATE FUNCTION normaliza_numeros(valor VARCHAR(255))
          RETURNS VARCHAR(255)
          DETERMINISTIC
          NO SQL
          BEGIN
            DECLARE resultado VARCHAR(255);
            DECLARE i INT DEFAULT 1;
            DECLARE char_atual CHAR(1);
            SET resultado = '';
            IF valor IS NULL THEN
              RETURN '';
            END IF;
            WHILE i <= CHAR_LENGTH(valor) DO
              SET char_atual = SUBSTRING(valor, i, 1);
              IF char_atual REGEXP '[0-9]' THEN
                SET resultado = CONCAT(resultado, char_atual);
              END IF;
              SET i = i + 1;
            END WHILE;
            RETURN resultado;
          END`;
        await conn.query(functionSql);
        logger.info('✅ Função normaliza_numeros criada com sucesso');
      } else {
        logger.info('✅ Função normaliza_numeros já existe');
      }
    } catch (error: any) {
      logger.warn('Erro ao verificar/criar função normaliza_numeros: ' + String(error.message));
      // Não falhar a migração por causa disso
    }

    // Criar função normaliza_telefone se não existir
    logger.info('Verificando função normaliza_telefone...');
    try {
      const [functionsTelefone] = await conn.query(
        `SELECT ROUTINE_NAME FROM information_schema.ROUTINES 
         WHERE ROUTINE_SCHEMA = DATABASE() 
         AND ROUTINE_NAME = 'normaliza_telefone' 
         AND ROUTINE_TYPE = 'FUNCTION'`
      ) as any[];

      if (!functionsTelefone || functionsTelefone.length === 0) {
        logger.info('Criando função normaliza_telefone...');
        // Função para normalizar telefone para formato: 55 + DDD + 9 + número (13 dígitos)
        // Remove todos os caracteres não numéricos, depois garante formato 55 + DDD + 9 + número
        const functionTelefoneSql = `CREATE FUNCTION normaliza_telefone(telefone VARCHAR(255))
          RETURNS VARCHAR(255)
          DETERMINISTIC
          NO SQL
          BEGIN
            DECLARE resultado VARCHAR(255);
            DECLARE numeros VARCHAR(255);
            DECLARE i INT DEFAULT 1;
            DECLARE char_atual CHAR(1);
            DECLARE len INT;
            
            SET resultado = '';
            SET numeros = '';
            
            IF telefone IS NULL OR telefone = '' THEN
              RETURN '';
            END IF;
            
            -- Primeiro, extrair apenas números
            SET i = 1;
            WHILE i <= CHAR_LENGTH(telefone) DO
              SET char_atual = SUBSTRING(telefone, i, 1);
              IF char_atual REGEXP '[0-9]' THEN
                SET numeros = CONCAT(numeros, char_atual);
              END IF;
              SET i = i + 1;
            END WHILE;
            
            -- Se não tem números, retornar vazio
            IF numeros = '' THEN
              RETURN '';
            END IF;
            
            SET len = CHAR_LENGTH(numeros);
            
            -- Normalizar para formato: 55 + DDD + 9 + número
            -- Se começa com 55 e tem 13 dígitos, já está no formato correto
            IF len = 13 AND SUBSTRING(numeros, 1, 2) = '55' THEN
              RETURN numeros;
            END IF;
            
            -- Se começa com 55 mas tem mais de 13 dígitos, pegar os primeiros 13
            IF len > 13 AND SUBSTRING(numeros, 1, 2) = '55' THEN
              RETURN SUBSTRING(numeros, 1, 13);
            END IF;
            
            -- Se tem 11 dígitos (DDD + 9 + número), adicionar 55 no início
            IF len = 11 THEN
              RETURN CONCAT('55', numeros);
            END IF;
            
            -- Se tem 10 dígitos (DDD + número sem 9), adicionar 55 e 9
            IF len = 10 THEN
              RETURN CONCAT('55', numeros);
            END IF;
            
            -- Se tem menos de 10 dígitos, tentar adicionar 55
            IF len < 10 THEN
              RETURN CONCAT('55', numeros);
            END IF;
            
            -- Se tem mais de 11 dígitos mas não começa com 55, assumir que os últimos 11 são DDD + número
            IF len > 11 THEN
              SET numeros = SUBSTRING(numeros, len - 10, 11);
              RETURN CONCAT('55', numeros);
            END IF;
            
            -- Caso padrão: adicionar 55 no início
            RETURN CONCAT('55', numeros);
          END`;
        await conn.query(functionTelefoneSql);
        logger.info('✅ Função normaliza_telefone criada com sucesso');
      } else {
        logger.info('✅ Função normaliza_telefone já existe');
      }
    } catch (error: any) {
      logger.warn('Erro ao verificar/criar função normaliza_telefone: ' + String(error.message));
      // Não falhar a migração por causa disso
    }

    // Executar migration para renomear senha_criptografada para senha
    logger.info('Verificando migration: renomear senha_criptografada para senha...');
    try {
      const renameSenhaPath = path.join(__dirname, '../config/migrations/rename_senha_criptografada_to_senha.sql');
      if (fs.existsSync(renameSenhaPath)) {
        const renameSenhaSql = fs.readFileSync(renameSenhaPath, 'utf-8');
        
        // Executar a migration (pode conter comandos dinâmicos)
        try {
          await conn.query(renameSenhaSql);
          logger.info('✅ Migration de renomeação de coluna executada');
        } catch (error: any) {
          // Ignorar se a coluna já foi renomeada ou não existe
          if (error.message.includes('already exists') || 
              error.message.includes('doesn\'t exist') ||
              error.message.includes('Unknown column')) {
            logger.debug('Coluna já renomeada ou não existe: ' + String(error.message));
          } else {
            // Tentar renomear diretamente se a migration SQL falhou
            try {
              await conn.query('ALTER TABLE vm_lav_credentials CHANGE COLUMN senha_criptografada senha TEXT NOT NULL COMMENT \'Senha em texto plano\'');
              logger.info('✅ Coluna renomeada diretamente');
            } catch (directError: any) {
              if (directError.message.includes('Unknown column') || 
                  directError.message.includes('Duplicate column name')) {
                logger.debug('Coluna já renomeada ou não existe: ' + String(directError.message));
              } else {
                logger.warn('Erro ao renomear coluna (pode já estar renomeada): ' + String(directError.message));
              }
            }
          }
        }
      }
    } catch (error: any) {
      logger.warn('Erro ao executar migration de renomeação: ' + String(error.message));
      // Não falhar a migração por causa disso
    }

    logger.info('✅ Migração VM Lav concluída');
  } catch (error: any) {
    logger.error('Erro na migração VM Lav: ' + String(error.message));
    throw error;
  } finally {
    conn.release();
  }
}

