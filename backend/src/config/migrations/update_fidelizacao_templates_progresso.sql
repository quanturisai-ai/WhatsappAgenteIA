-- Migração para atualizar templates de mensagem de progresso com emojis e barras
-- Data: 2026-02-08

-- Atualizar template de progresso para incluir emojis e barras de progresso
UPDATE fidelizacao_config
SET template_mensagem_progresso = 'Olá, {primeiro_nome}! 👋
Veja seu progresso na fidelidade:

Prêmio: {lavagens_proximo_premio}
{lavagens_barra}
• {lavagens_faltam_texto}

Prêmio: {secagens_proximo_premio}
{secagens_barra}
• {secagens_faltam_texto}

Continue assim! 🚀'
WHERE template_mensagem_progresso IS NULL 
   OR template_mensagem_progresso NOT LIKE '%{lavagens_barra}%';

-- Verificar quantos registros foram atualizados
SELECT 
    COUNT(*) as total_configs,
    SUM(CASE WHEN template_mensagem_progresso LIKE '%{lavagens_barra}%' THEN 1 ELSE 0 END) as com_novo_template,
    SUM(CASE WHEN template_mensagem_progresso NOT LIKE '%{lavagens_barra}%' OR template_mensagem_progresso IS NULL THEN 1 ELSE 0 END) as com_template_antigo
FROM fidelizacao_config;
