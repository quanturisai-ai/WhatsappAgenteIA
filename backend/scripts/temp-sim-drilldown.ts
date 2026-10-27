/**
 * TEMPORÁRIO — Drill-down read-only complementar à simulação.
 * Apenas SELECTs. Apagar após validação.
 *
 * D1. As 10 conversas 'new' antigas: por que o job atual não finalizou?
 * D2. Conteúdos outgoing is_from_ai=0 mais repetidos: quanto do "human" é
 *     na verdade automação não registrada em fidelizacao_notificacoes?
 * D3. As 2 conversas finished com humano atendendo recentemente.
 *
 * Uso: npx ts-node --transpile-only scripts/temp-sim-drilldown.ts
 */
import dotenv from 'dotenv';
dotenv.config();
import pool from '../src/config/database';

async function main() {
  const conn = await pool.getConnection();
  try {
    console.log('D1 — Conversas com status=new hoje:');
    const news = (await conn.query(
      `SELECT id, contact_name, status, auto_responding, last_message_at, created_at
       FROM conversations WHERE status = 'new' ORDER BY last_message_at`
    )) as any[];
    for (const c of news) {
      console.log(
        `  conv ${c.id} | auto_resp=${c.auto_responding} | last_message_at=${
          c.last_message_at ? new Date(c.last_message_at).toISOString() : 'NULL'
        } | created=${new Date(c.created_at).toISOString()}`
      );
    }

    console.log('\nD1b — Dessas, quantas o job atual pegaria (last_message_at IS NOT NULL)?');
    const nullLast = news.filter((c) => !c.last_message_at).length;
    console.log(`  ${news.length} new no total; ${nullLast} com last_message_at NULL (job ignora essas)`);

    console.log('\nD2 — Top 15 conteúdos outgoing is_from_ai=0 repetidos (prefixo de 70 chars):');
    const tpl = (await conn.query(
      `SELECT LEFT(content, 70) AS prefixo, COUNT(*) AS qtd
       FROM messages WHERE direction='outgoing' AND is_from_ai=0
       GROUP BY prefixo HAVING qtd >= 5 ORDER BY qtd DESC LIMIT 15`
    )) as any[];
    for (const t of tpl) {
      console.log(`  ${String(t.qtd).padStart(5)}x | ${t.prefixo.replace(/\n/g, ' ')}`);
    }
    const totalRepetidos = tpl.reduce((s: number, t: any) => s + Number(t.qtd), 0);
    console.log(`  (soma dos top repetidos: ${totalRepetidos})`);

    console.log('\nD3 — Conversas finished cuja última mensagem é outgoing não-IA recente (<48h):');
    const d3 = (await conn.query(
      `SELECT c.id, c.contact_name, c.status, c.needs_intervention, m.content, m.created_at
       FROM conversations c
       JOIN messages m ON m.conversation_id = c.id
       WHERE c.status='finished'
         AND m.created_at = (SELECT MAX(m2.created_at) FROM messages m2 WHERE m2.conversation_id = c.id)
         AND m.direction='outgoing' AND m.is_from_ai=0
         AND m.created_at > NOW() - INTERVAL 48 HOUR
       LIMIT 10`
    )) as any[];
    for (const r of d3) {
      console.log(
        `  conv ${r.id} | ${r.contact_name} | última msg (outgoing humano/automação) ${new Date(
          r.created_at
        ).toISOString()} | "${String(r.content).substring(0, 60).replace(/\n/g, ' ')}"`
      );
    }
    if (!d3.length) console.log('  (nenhuma nas últimas 48h)');
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
