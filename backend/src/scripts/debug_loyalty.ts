import pool from '../config/database';
// Removed mysql2 import


async function debugLoyalty() {
    console.log('Iniciando debug...');
    const conn = await pool.getConnection();

    try {
        // 1. Check vm_lav_clientes phone numbers
        console.log('\n--- Verificando telefones de clientes ---');
        const clients = await conn.query('SELECT id, nome, telefone FROM vm_lav_clientes LIMIT 5');
        console.log('Clientes encontrados:', clients);

        // 2. Test MessageModel insertion
        console.log('\n--- Testando inserção de mensagem ---');

        // Create a dummy conversation if needed or use an existing one
        // First, find a user
        const users = await conn.query('SELECT id FROM users LIMIT 1');
        if (!users || users.length === 0) {
            console.log('Nenhum usuário encontrado para teste.');
            return;
        }
        const userId = users[0].id;

        // Create a dummy conversation
        const convResult = await conn.query(
            'INSERT INTO conversations (user_id, contact_number, status, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW()) ON DUPLICATE KEY UPDATE updated_at = NOW()',
            [userId, '5511999999999', 'new']
        ) as any;

        // Get conversation ID
        let conversationId: number;
        if (convResult.insertId) {
            conversationId = Number(convResult.insertId);
        } else {
            // If ON DUPLICATE KEY UPDATE, we need to fetch it
            const conv = await conn.query('SELECT id FROM conversations WHERE user_id = ? AND contact_number = ?', [userId, '5511999999999']);
            conversationId = conv[0].id;
        }
        console.log('Conversation ID:', conversationId);

        // Insert message (Simulation of fix)
        const message = {
            conversation_id: conversationId,
            message_id: 'debug_' + Date.now(),
            content: 'Debug message with fix',
            message_type: 'text',
            direction: 'outgoing',
            is_from_ai: false
        };

        const insertResult = await conn.query(
            `INSERT INTO messages 
       (conversation_id, message_id, content, message_type, direction, is_from_ai, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
            [message.conversation_id, message.message_id, message.content, message.message_type, message.direction, message.is_from_ai]
        ) as any;

        console.log('Insert Result:', insertResult);

        // Simulate what we did in the model: Cast BigInt to Number
        let insertId = insertResult.insertId;
        if (typeof insertId === 'bigint') {
            console.log('Detected BigInt insertId:', insertId);
            insertId = Number(insertId);
            console.log('Converted to Number:', insertId);
        }

        if (insertId) {
            const insertedMsg = await conn.query('SELECT * FROM messages WHERE id = ?', [insertId]);
            console.log('Mensagem recuperada com sucesso:', insertedMsg);
        } else {
            console.error('ERRO: insertId não retornado!');
        }

        // Test Phone Sanitization Logic
        const rawPhones = ['(62) 99927-0024', '62999270024', '11999999999', '5511999999999'];
        console.log('\n--- Testando Sanitização de Telefones ---');

        for (const phone of rawPhones) {
            let chatId = phone.replace(/\D/g, ''); // Remove non-digits
            if (chatId.length === 10 || chatId.length === 11) {
                chatId = '55' + chatId;
            }
            if (!chatId.includes('@')) {
                chatId = `${chatId}@c.us`;
            }
            console.log(`Original: "${phone}" -> Formatado: "${chatId}"`);
        }

    } catch (error) {
        console.error('Erro durante debug:', error);
    } finally {
        conn.release();
        process.exit(0);
    }
}

debugLoyalty();
