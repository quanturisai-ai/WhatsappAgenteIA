/**
 * Backfill das colunas novas da Fase 2 (add_conversation_classification.sql):
 *   - messages.source: 'client' | 'ai' | 'human' | 'automation'
 *   - conversations.handler: quem está atendendo agora ('none' | 'ai' | 'human')
 *   - conversations.origin: como a conversa nasceu ('inbound' | 'campaign' | 'outbound')
 *   - conversations.last_client_message_at: última mensagem recebida do cliente
 *
 * IMPORTANTE: este script NÃO altera conversations.status nem needs_intervention —
 * esses campos continuam sob controle exclusivo do runtime (já corrigido na Fase 1).
 * Só preenche as colunas novas, que hoje nenhum código lê.
 *
 * Regras de classificação de messages.source (outgoing, is_from_ai=0):
 *   1. Se o conteúdo (normalizado) bate com algum fidelizacao_notificacoes.mensagem_enviada
 *      (enviado_whatsapp=1) do mesmo usuário → 'automation'.
 *   2. Senão, se o mesmo conteúdo normalizado aparece em >=5 conversas DISTINTAS do mesmo
 *      usuário → 'automation' (heurística validada no drill-down: blasts de promoção em
 *      massa que não passam por fidelizacao_notificacoes, ex. "PROMOÇÃO RELÂMPAGO" 678x).
 *   3. Senão → 'human'.
 *
 * Modo padrão: DRY-RUN (só imprime o que faria). Passe --apply para gravar de verdade.
 *
 * Uso:
 *   npx ts-node --transpile-only src/scripts/backfill-classificacao.ts            (dry-run)
 *   npx ts-node --transpile-only src/scripts/backfill-classificacao.ts --apply    (grava)
 */
import dotenv from 'dotenv';
dotenv.config();
import pool from '../config/database';

const APPLY = process.argv.includes('--apply');
const REPEATED_CONTENT_THRESHOLD = 5;
const CHUNK_SIZE = 500;

type MessageSource = 'client' | 'ai' | 'human' | 'automation';

interface MsgRow {
  id: number;
  conversation_id: number;
  direction: 'incoming' | 'outgoing';
  is_from_ai: number | boolean;
  content: string;
  created_at: Date;
}

interface ConvRow {
  id: number;
  user_id: number;
  status: string;
}

function normalizeContent(content: string): string {
  return (content || '').replace(/\s+/g, ' ').trim();
}

function toBool(v: number | boolean | null | undefined): boolean {
  return typeof v === 'number' ? v === 1 : v === true;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const conn = await pool.getConnection();
  try {
    console.log(`Modo: ${APPLY ? 'APLICAR (grava no banco)' : 'DRY-RUN (nada é gravado)'}`);
    console.log('');

    // -----------------------------------------------------------------
    // 1. Carregar dados-base
    // -----------------------------------------------------------------
    const conversations = (await conn.query(
      `SELECT id, user_id, status FROM conversations`
    )) as ConvRow[];

    const messages = (await conn.query(
      `SELECT id, conversation_id, direction, is_from_ai, content, created_at
       FROM messages ORDER BY conversation_id, created_at`
    )) as MsgRow[];

    let notifRows: Array<{ user_id: number; mensagem_enviada: string }> = [];
    try {
      notifRows = (await conn.query(
        `SELECT user_id, mensagem_enviada FROM fidelizacao_notificacoes WHERE enviado_whatsapp = 1`
      )) as any[];
    } catch (e: any) {
      console.warn(`⚠️ fidelizacao_notificacoes indisponível: ${e.message}`);
    }

    console.log(`Conversas: ${conversations.length}`);
    console.log(`Mensagens: ${messages.length}`);
    console.log(`Notificações de fidelização enviadas: ${notifRows.length}`);
    console.log('');

    // -----------------------------------------------------------------
    // 2. Índices auxiliares
    // -----------------------------------------------------------------
    const automationByUser = new Map<number, Set<string>>();
    for (const n of notifRows) {
      const uid = Number(n.user_id);
      if (!automationByUser.has(uid)) automationByUser.set(uid, new Set());
      automationByUser.get(uid)!.add(normalizeContent(n.mensagem_enviada));
    }

    const convById = new Map<number, ConvRow>();
    for (const c of conversations) convById.set(Number(c.id), c);

    // Heurística de conteúdo repetido: candidatos = outgoing, is_from_ai=0, que NÃO
    // batem já com fidelizacao_notificacoes (regra 1). Agrupar por (user_id, conteúdo
    // normalizado) e contar em quantas conversas DISTINTAS aparece.
    const repeatedCandidateConvs = new Map<string, Set<number>>(); // key=user_id|content -> Set<conversation_id>
    for (const m of messages) {
      if (m.direction !== 'outgoing' || toBool(m.is_from_ai)) continue;
      const conv = convById.get(Number(m.conversation_id));
      if (!conv) continue;
      const norm = normalizeContent(m.content);
      const autoSet = automationByUser.get(Number(conv.user_id));
      if (autoSet?.has(norm)) continue; // já classificado pela regra 1
      const key = `${conv.user_id}|${norm}`;
      if (!repeatedCandidateConvs.has(key)) repeatedCandidateConvs.set(key, new Set());
      repeatedCandidateConvs.get(key)!.add(Number(conv.id));
    }
    const repeatedAutomationKeys = new Set<string>();
    for (const [key, convSet] of repeatedCandidateConvs) {
      if (convSet.size >= REPEATED_CONTENT_THRESHOLD) repeatedAutomationKeys.add(key);
    }

    // -----------------------------------------------------------------
    // 3. Derivar source de cada mensagem + agregados por conversa
    // -----------------------------------------------------------------
    const sourceUpdates = new Map<MessageSource, number[]>([
      ['client', []],
      ['ai', []],
      ['human', []],
      ['automation', []],
    ]);

    interface ConvAgg {
      lastClientMessageAt: Date | null;
      lastAttendSource: MessageSource | null; // última 'ai' ou 'human' (para handler)
      firstSource: MessageSource | null; // para origin
    }
    const aggByConv = new Map<number, ConvAgg>();

    for (const m of messages) {
      const conv = convById.get(Number(m.conversation_id));
      if (!conv) continue;

      let source: MessageSource;
      if (m.direction === 'incoming') {
        source = 'client';
      } else if (toBool(m.is_from_ai)) {
        source = 'ai';
      } else {
        const norm = normalizeContent(m.content);
        const autoSet = automationByUser.get(Number(conv.user_id));
        const key = `${conv.user_id}|${norm}`;
        source = autoSet?.has(norm) || repeatedAutomationKeys.has(key) ? 'automation' : 'human';
      }

      sourceUpdates.get(source)!.push(m.id);

      let agg = aggByConv.get(conv.id);
      if (!agg) {
        agg = { lastClientMessageAt: null, lastAttendSource: null, firstSource: null };
        aggByConv.set(conv.id, agg);
      }
      if (agg.firstSource === null) agg.firstSource = source;
      if (source === 'client') {
        const at = new Date(m.created_at);
        if (!agg.lastClientMessageAt || at > agg.lastClientMessageAt) agg.lastClientMessageAt = at;
      }
      if (source === 'ai' || source === 'human') {
        agg.lastAttendSource = source; // mensagens já vêm ordenadas por created_at
      }
    }

    // -----------------------------------------------------------------
    // 4. Montar updates de conversations (handler, origin, last_client_message_at)
    // -----------------------------------------------------------------
    interface ConvUpdate {
      id: number;
      handler: 'none' | 'ai' | 'human';
      origin: 'inbound' | 'campaign' | 'outbound';
      lastClientMessageAt: Date | null;
    }
    const convUpdates: ConvUpdate[] = [];

    for (const conv of conversations) {
      const agg = aggByConv.get(Number(conv.id));

      const handler: 'none' | 'ai' | 'human' =
        conv.status === 'in_progress' && (agg?.lastAttendSource === 'ai' || agg?.lastAttendSource === 'human')
          ? agg.lastAttendSource
          : 'none';

      let origin: 'inbound' | 'campaign' | 'outbound' = 'inbound';
      if (agg?.firstSource === 'automation') origin = 'campaign';
      else if (agg?.firstSource === 'ai' || agg?.firstSource === 'human') origin = 'outbound';
      // firstSource === 'client' ou sem mensagens -> mantém 'inbound' (default)

      convUpdates.push({
        id: conv.id,
        handler,
        origin,
        lastClientMessageAt: agg?.lastClientMessageAt ?? null,
      });
    }

    // -----------------------------------------------------------------
    // 5. Relatório (sempre impresso, dry-run ou não)
    // -----------------------------------------------------------------
    console.log('── messages.source ──');
    for (const [source, ids] of sourceUpdates) {
      console.log(`  ${source.padEnd(11)}: ${ids.length}`);
    }
    console.log('');

    const handlerDist = new Map<string, number>();
    const originDist = new Map<string, number>();
    let withLastClientMsg = 0;
    for (const u of convUpdates) {
      handlerDist.set(u.handler, (handlerDist.get(u.handler) || 0) + 1);
      originDist.set(u.origin, (originDist.get(u.origin) || 0) + 1);
      if (u.lastClientMessageAt) withLastClientMsg++;
    }
    console.log('── conversations.handler ──');
    for (const [k, v] of handlerDist) console.log(`  ${k.padEnd(11)}: ${v}`);
    console.log('');
    console.log('── conversations.origin ──');
    for (const [k, v] of originDist) console.log(`  ${k.padEnd(11)}: ${v}`);
    console.log('');
    console.log(`── conversations.last_client_message_at preenchido: ${withLastClientMsg} / ${convUpdates.length} ──`);
    console.log('');

    if (!APPLY) {
      console.log('DRY-RUN concluído. Nenhuma linha foi gravada. Rode com --apply para persistir.');
      return;
    }

    // -----------------------------------------------------------------
    // 6. Gravação (--apply)
    // -----------------------------------------------------------------
    console.log('Gravando messages.source em lotes...');
    for (const [source, ids] of sourceUpdates) {
      for (const batch of chunk(ids, CHUNK_SIZE)) {
        if (batch.length === 0) continue;
        const placeholders = batch.map(() => '?').join(',');
        await conn.query(
          `UPDATE messages SET source = ? WHERE id IN (${placeholders})`,
          [source, ...batch]
        );
      }
      console.log(`  ✅ ${source}: ${ids.length} mensagens`);
    }

    console.log('\nGravando conversations.handler/origin/last_client_message_at...');
    let done = 0;
    for (const u of convUpdates) {
      await conn.query(
        `UPDATE conversations SET handler = ?, origin = ?, last_client_message_at = ? WHERE id = ?`,
        [u.handler, u.origin, u.lastClientMessageAt, u.id]
      );
      done++;
      if (done % 200 === 0) console.log(`  ... ${done}/${convUpdates.length}`);
    }
    console.log(`  ✅ ${done} conversas atualizadas`);

    console.log('\n✅ Backfill aplicado com sucesso.');
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('❌ Erro no backfill:', err);
  process.exit(1);
});
