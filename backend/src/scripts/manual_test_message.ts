import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });
const secret = process.env.JWT_SECRET || 'default-secret';
const token = jwt.sign({ userId: 1 }, secret, { expiresIn: '1h' });
const API_URL = `http://localhost:${process.env.PORT || 3302}/api`;

async function run() {
    try {
        const r1 = await fetch(`${API_URL}/conversations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ contactNumber: '5561981935443', contactName: 'Teste Verificação' })
        });
        const d1 = await r1.json() as any;
        const cid = d1.conversation?.id;
        if (!cid) { console.log('FAIL: No CID'); return; }
        console.log('CID:', cid);

        const r2 = await fetch(`${API_URL}/conversations/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ conversationId: cid, content: 'Teste final fix LID - Sistema Verificado.' })
        });
        const d2 = await r2.json() as any;
        if (r2.ok) console.log('SUCCESS: Message sent');
        else console.log('FAIL: Send error', JSON.stringify(d2));
    } catch (e: any) { console.log('ERR:', e.message); }
}
run();
