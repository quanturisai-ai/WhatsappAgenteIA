import pool from '../src/config/database';
import logger from '../src/utils/logger';

/**
 * Script para atualizar templates de progresso existentes com emojis e barras
 */
async function updateTemplatesProgresso() {
    const conn = await pool.getConnection();

    try {
        logger.info('Iniciando atualização de templates de progresso...');

        // Template atualizado com emojis e barras
        const novoTemplate = `Olá, {primeiro_nome}! 👋
Veja seu progresso na fidelidade:

Prêmio: {lavagens_proximo_premio}
{lavagens_barra}
• {lavagens_faltam_texto}

Prêmio: {secagens_proximo_premio}
{secagens_barra}
• {secagens_faltam_texto}

Continue assim! 🚀`;

        // Atualizar registros que não têm o novo template
        const updateQuery = `
      UPDATE fidelizacao_config
      SET template_mensagem_progresso = ?
      WHERE template_mensagem_progresso IS NULL 
         OR template_mensagem_progresso NOT LIKE '%{lavagens_barra}%'
    `;

        const result = await conn.query(updateQuery, [novoTemplate]) as any;
        const affectedRows = result?.affectedRows || 0;

        logger.info(`✅ ${affectedRows} registro(s) atualizado(s) com o novo template de progresso`);

        // Verificar status final
        const checkQuery = `
      SELECT 
        COUNT(*) as total_configs,
        SUM(CASE WHEN template_mensagem_progresso LIKE '%{lavagens_barra}%' THEN 1 ELSE 0 END) as com_novo_template,
        SUM(CASE WHEN template_mensagem_progresso NOT LIKE '%{lavagens_barra}%' OR template_mensagem_progresso IS NULL THEN 1 ELSE 0 END) as com_template_antigo
      FROM fidelizacao_config
    `;

        const checkResult = await conn.query(checkQuery) as any;
        const stats = Array.isArray(checkResult) ? checkResult[0] : checkResult;
        const row = Array.isArray(stats) ? stats[0] : stats;

        logger.info('Status dos templates:');
        logger.info(`  Total de configurações: ${row.total_configs}`);
        logger.info(`  Com novo template: ${row.com_novo_template}`);
        logger.info(`  Com template antigo: ${row.com_template_antigo}`);

        if (row.com_template_antigo > 0) {
            logger.warn(`⚠️  Ainda existem ${row.com_template_antigo} configuração(ões) com template antigo`);
        } else {
            logger.info('✅ Todos os templates foram atualizados com sucesso!');
        }

    } catch (error: any) {
        logger.error(`Erro ao atualizar templates: ${error.message}`);
        throw error;
    } finally {
        conn.release();
    }
}

// Executar a migração
updateTemplatesProgresso()
    .then(() => {
        logger.info('Migração concluída com sucesso');
        process.exit(0);
    })
    .catch((error) => {
        logger.error('Erro na migração:', error);
        process.exit(1);
    });
