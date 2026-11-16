import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import mariadb from 'mariadb';

// Configuração
const MAX_ENVIOS = 100; // Limite de envios por execução
const MIN_DELAY_MS = 10000; // 10 segundos
const MAX_DELAY_MS = 20000; // 20 segundos (média de 15s = ~4 msgs/min para segurança)

// Carregar variáveis de ambiente
dotenv.config({ path: path.join(__dirname, '../../.env') });

const secret = process.env.JWT_SECRET || 'default-secret';
const token = jwt.sign({ userId: 1 }, secret, { expiresIn: '1h' });
const API_URL = `http://localhost:${process.env.PORT || 3302}/api`;

// Pool de conexão (similar ao database.ts mas local para garantir fechamento)
const pool = mariadb.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'agente_zap',
    connectionLimit: 5,
});

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
    let conn;
    try {
        console.log('🔌 Conectando ao banco de dados...');
        conn = await pool.getConnection();
        console.log('✅ Conectado.');

        // 1. Executar a query do usuário
        const query = `
      SELECT (SELECT a.id FROM fidelizacao_notificacoes a 
        WHERE a.cpf_cliente = b.cpf_cliente
        ORDER BY a.id DESC LIMIT 1) AS id, c.telefone, 
        (SELECT a.enviado_whatsapp FROM fidelizacao_notificacoes a 
        WHERE a.cpf_cliente = b.cpf_cliente
        ORDER BY a.id DESC LIMIT 1) AS enviado_whatsapp
        
        , b.cpf_cliente ,

      (SELECT a.mensagem_enviada FROM fidelizacao_notificacoes a 
        WHERE a.cpf_cliente = b.cpf_cliente
        ORDER BY a.id DESC LIMIT 1) AS mensagem
      FROM fidelizacao_notificacoes b
      LEFT JOIN vm_lav_clientes c ON b.cpf_cliente = c.cpf
      WHERE b.cpf_cliente NOT IN ('709.608.351-05','709.608.351-05','703.557.531-62')
      GROUP BY b.cpf_cliente ORDER BY id DESC;
    `;

        console.log('🔍 Executando query...');
        const rows = await conn.query(query);
        console.log(`📊 Encontrados ${rows.length} registros.`);

        let enviadosCount = 0;

        for (const row of rows) {
            // Verificar limite de envios
            if (enviadosCount >= MAX_ENVIOS) {
                console.log(`🛑 Limite de envios atingido (${MAX_ENVIOS}). Encerrando.`);
                break;
            }

            // Verificar se já foi enviado
            if (row.enviado_whatsapp === 1) {
                console.log(`⏩ Cliente ${row.cpf_cliente} (ID ${row.id}): Já enviado. Pulando.`);
                continue;
            }

            const telefone = row.telefone;
            if (!telefone) {
                console.log(`⚠️ Cliente ${row.cpf_cliente} (ID ${row.id}): Sem telefone. Pulando.`);
                await conn.query('UPDATE fidelizacao_notificacoes SET erro = ? WHERE id = ?', ['Telefone não encontrado', row.id]);
                continue;
            }

            let mensagem = row.mensagem;
            if (!mensagem) {
                console.log(`⚠️ Cliente ${row.cpf_cliente} (ID ${row.id}): Sem mensagem. Pulando.`);
                continue;
            }

            // Adicionar observação de validade
            mensagem += "\n\n😍 Lavagens e secagens feitas desde 01/02/2026 já estão valendo.";

            // Anti-spam: Adicionar espaços aleatórios no final
            const espacos = Math.floor(Math.random() * 10) + 1;
            mensagem += ' '.repeat(espacos);

            console.log(`📤 Enviando para ${row.cpf_cliente} (${telefone})...`);

            // 1. Criar conversa (se não existir)
            try {
                const createRes = await fetch(`${API_URL}/conversations`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ contactNumber: telefone, contactName: `Cliente ${row.cpf_cliente}` })
                });

                const createData = await createRes.json() as any;
                const conversationId = createData.conversation?.id;

                if (!conversationId) {
                    throw new Error('Falha ao obter ID da conversa: ' + JSON.stringify(createData));
                }

                // 2. Enviar mensagem
                const sendRes = await fetch(`${API_URL}/conversations/send`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ conversationId, content: mensagem })
                });

                const sendData = await sendRes.json() as any;

                if (sendRes.ok) {
                    console.log(`✅ Sucesso!`);
                    await conn.query('UPDATE fidelizacao_notificacoes SET enviado_whatsapp = 1, erro = NULL WHERE id = ?', [row.id]);
                    enviadosCount++;
                } else {
                    console.error(`❌ Erro ao enviar:`, sendData);
                    const errorMsg = sendData.error || sendData.message || 'Erro desconhecido API';
                    await conn.query('UPDATE fidelizacao_notificacoes SET erro = ? WHERE id = ?', [errorMsg, row.id]);
                }

            } catch (error: any) {
                console.error(`❌ Erro de processamento: ${error.message}`);
                await conn.query('UPDATE fidelizacao_notificacoes SET erro = ? WHERE id = ?', [error.message, row.id]);
            }

            // Delay aleatório entre envios
            if (enviadosCount < MAX_ENVIOS) {
                const delay = Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1)) + MIN_DELAY_MS;
                console.log(`⏳ Aguardando ${delay}ms...`);
                await sleep(delay);
            }
        }

        console.log('🏁 Processamento concluído.');

    } catch (error: any) {
        console.error('❌ Erro fatal:', error.message);
    } finally {
        if (conn) conn.release();
        pool.end();
    }
}

run();
