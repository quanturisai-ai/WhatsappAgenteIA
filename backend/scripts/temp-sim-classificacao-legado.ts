/**
 * TEMPORÁRIO — Simulação da nova lógica de classificação sobre DADOS LEGADOS.
 *
 * 100% READ-ONLY: executa apenas SELECTs. Nenhum UPDATE/INSERT/DELETE.
 * Nada do sistema real é alterado.
 *
 * O que faz:
 *   1. Carrega todas as conversas + mensagens + notificações de fidelização
 *   2. Deriva retroativamente o source de cada mensagem (client/ai/human/automation)
 *   3. Reconstrói o estado proposto de cada conversa (replayHistory)
 *   4. Compara coluna ATUAL do Kanban vs coluna PROPOSTA
 *   5. Quantifica cada problema do diagnóstico nos dados reais
 *   6. Grava relatório em scripts/temp-sim-classificacao-relatorio.md
 *
 * Uso: npx ts-node --transpile-only scripts/temp-sim-classificacao-legado.ts
 * Apagar após a validação.
 */
import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import pool from '../src/config/database';
import {
  deriveSource,
  normalizeContent,
  replayHistory,
  toKanbanColumn,
  toLegacyKanbanColumn,
  shouldAutoFinalizeLegacy,
  HistoricMessage,
  MessageSource,
} from './temp-classificacao-lib';

const REPORT_PATH = path.join(__dirname, 'temp-sim-classificacao-relatorio.md');
const DEFAULT_MAX_AGE_HOURS = 12;

interface ConvRow {
  id: number;
  user_id: number;
  contact_number: string;
  contact_name: string | null;
  status: string;
  auto_responding: number | boolean | null;
  needs_intervention: number | boolean | null;
  last_message_at: Date | null;
}

interface MsgRow {
  conversation_id: number;
  direction: 'incoming' | 'outgoing';
  is_from_ai: number | boolean;
  content: string;
  created_at: Date;
}

function toBool(v: number | boolean | null | undefined): boolean {
  if (typeof v === 'number') return v === 1;
  return v === true;
}

function mask(phone: string): string {
  if (!phone || phone.length < 6) return phone;
  return phone.substring(0, phone.length - 4).replace(/\d/g, (d, i) => (i < 4 ? d : '*')) + phone.slice(-4);
}

async function main() {
  const conn = await pool.getConnection();
  const lines: string[] = [];
  const out = (s: string) => { console.log(s); lines.push(s); };

  try {
    out('# Relatório de simulação — nova classificação sobre dados legados');
    out('');
    out(`Gerado em: ${new Date().toISOString()} — script READ-ONLY (apenas SELECT)`);
    out('');

    // -----------------------------------------------------------------
    // 1. Carregar dados
    // -----------------------------------------------------------------
    const conversations = (await conn.query(
      `SELECT id, user_id, contact_number, contact_name, status, auto_responding,
              needs_intervention, last_message_at
       FROM conversations`
    )) as ConvRow[];

    const msgCountRow = (await conn.query(`SELECT COUNT(*) AS c FROM messages`)) as any[];
    const totalMessages = Number(msgCountRow[0].c);

    out(`## Volumetria`);
    out('');
    out(`- Conversas: **${conversations.length}**`);
    out(`- Mensagens: **${totalMessages}**`);

    const messages = (await conn.query(
      `SELECT conversation_id, direction, is_from_ai, content, created_at
       FROM messages ORDER BY conversation_id, created_at`
    )) as MsgRow[];

    // Notificações de fidelização efetivamente ENVIADAS via WhatsApp
    let notifRows: Array<{ user_id: number; mensagem_enviada: string }> = [];
    try {
      notifRows = (await conn.query(
        `SELECT user_id, mensagem_enviada FROM fidelizacao_notificacoes WHERE enviado_whatsapp = 1`
      )) as any[];
    } catch (e: any) {
      out(`- ⚠️ fidelizacao_notificacoes indisponível: ${e.message}`);
    }
    out(`- Notificações de fidelização enviadas (enviado_whatsapp=1): **${notifRows.length}**`);

    // max_age_hours por usuário
    const maxAgeByUser = new Map<number, number>();
    try {
      const cfgRows = (await conn.query(`SELECT user_id, max_age_hours FROM agent_config`)) as any[];
      for (const r of cfgRows) {
        maxAgeByUser.set(Number(r.user_id), Number(r.max_age_hours ?? DEFAULT_MAX_AGE_HOURS));
      }
    } catch {
      out(`- ⚠️ agent_config.max_age_hours indisponível — usando padrão ${DEFAULT_MAX_AGE_HOURS}h`);
    }
    out('');

    // -----------------------------------------------------------------
    // 2. Índices auxiliares
    // -----------------------------------------------------------------
    const automationByUser = new Map<number, Set<string>>();
    for (const n of notifRows) {
      const uid = Number(n.user_id);
      if (!automationByUser.has(uid)) automationByUser.set(uid, new Set());
      automationByUser.get(uid)!.add(normalizeContent(n.mensagem_enviada));
    }

    const msgsByConv = new Map<number, MsgRow[]>();
    for (const m of messages) {
      const cid = Number(m.conversation_id);
      if (!msgsByConv.has(cid)) msgsByConv.set(cid, []);
      msgsByConv.get(cid)!.push(m);
    }

    // -----------------------------------------------------------------
    // 3. Reconstruir e comparar
    // -----------------------------------------------------------------
    const now = new Date();
    const currentDist = new Map<string, number>();
    const proposedDist = new Map<string, number>();
    const migrationMatrix = new Map<string, number>(); // "atual→proposta" → count
    const sourceDist: Record<MessageSource, number> = { client: 0, ai: 0, human: 0, automation: 0 };

    // Detecções de problemas
    const p1_newSemIncoming: ConvRow[] = [];        // 'new' criada só por outgoing (disparo)
    const p2_finishedComPendencia: ConvRow[] = [];  // presa em Pendências
    const p3_vivaPorAutomacao: ConvRow[] = [];      // job atual nunca finaliza
    const p4_inProgressSemResposta: ConvRow[] = []; // falso "Em Atendimento" (RAG mudo)
    const p6_humanoInvisivel: ConvRow[] = [];       // humano atendendo sem status refletir
    const pausedCount = conversations.filter((c) => c.status === 'paused').length;

    const changes: Array<{ conv: ConvRow; from: string; to: string }> = [];

    for (const conv of conversations) {
      const convMsgs = msgsByConv.get(Number(conv.id)) || [];
      const autoSet = automationByUser.get(Number(conv.user_id)) || new Set<string>();
      const maxAge = maxAgeByUser.get(Number(conv.user_id)) ?? DEFAULT_MAX_AGE_HOURS;
      const needsInt = toBool(conv.needs_intervention);

      const hist: HistoricMessage[] = convMsgs.map((m) => {
        const source = deriveSource(
          { direction: m.direction, is_from_ai: toBool(m.is_from_ai), content: m.content },
          autoSet
        );
        sourceDist[source]++;
        return { source, at: new Date(m.created_at) };
      });

      const currentCol = toLegacyKanbanColumn(conv.status, needsInt);
      const proposedState = replayHistory(hist, needsInt, now, maxAge);
      const proposedCol = toKanbanColumn(proposedState);

      currentDist.set(currentCol, (currentDist.get(currentCol) || 0) + 1);
      proposedDist.set(proposedCol, (proposedDist.get(proposedCol) || 0) + 1);
      const key = `${currentCol} → ${proposedCol}`;
      migrationMatrix.set(key, (migrationMatrix.get(key) || 0) + 1);
      if (currentCol !== proposedCol) changes.push({ conv, from: currentCol, to: proposedCol });

      // --- Detecções ---
      const incoming = hist.filter((m) => m.source === 'client');
      const lastClient = incoming.length ? incoming[incoming.length - 1].at : null;
      const attendAfterLastClient = lastClient
        ? hist.some((m) => (m.source === 'ai' || m.source === 'human') && m.at > lastClient)
        : false;

      // P1: conversa 'new' sem NENHUMA mensagem do cliente (nasceu de disparo/outbound)
      if (conv.status === 'new' && convMsgs.length > 0 && incoming.length === 0) {
        p1_newSemIncoming.push(conv);
      }

      // P2: finalizada mas com pendência ativa → presa na coluna Pendências
      if (conv.status === 'finished' && needsInt) {
        p2_finishedComPendencia.push(conv);
      }

      // P3: ativa, cliente inativo além do maxAge, mas job atual NÃO finalizaria
      // porque last_message_at foi renovado por mensagem que não é do cliente
      if (conv.status === 'new' || conv.status === 'in_progress') {
        const clientInactive =
          lastClient !== null && now.getTime() - lastClient.getTime() > maxAge * 3600 * 1000;
        const legacyWouldFinalize = shouldAutoFinalizeLegacy(
          conv.status,
          conv.last_message_at ? new Date(conv.last_message_at) : null,
          now,
          maxAge
        );
        if (clientInactive && !legacyWouldFinalize) {
          p3_vivaPorAutomacao.push(conv);
        }
      }

      // P4: in_progress mas a última mensagem do cliente nunca foi respondida
      if (conv.status === 'in_progress' && lastClient && !attendAfterLastClient) {
        p4_inProgressSemResposta.push(conv);
      }

      // P6: humano é o último a atender mas status não é in_progress
      const lastAttend = [...hist].reverse().find((m) => m.source === 'ai' || m.source === 'human');
      if (lastAttend?.source === 'human' && conv.status === 'new') {
        p6_humanoInvisivel.push(conv);
      }
    }

    // -----------------------------------------------------------------
    // 4. Relatório
    // -----------------------------------------------------------------
    out('## 1. Distribuição de sources derivados (backfill proposto para messages)');
    out('');
    out('| Source | Mensagens |');
    out('|---|---|');
    (Object.keys(sourceDist) as MessageSource[]).forEach((k) =>
      out(`| ${k} | ${sourceDist[k]} |`)
    );
    out('');
    out(
      `> ${sourceDist.automation} mensagens de automação estão hoje gravadas como se fossem ` +
      `de um humano (is_from_ai=0). O backfill as reclassificaria como 'automation'.`
    );
    out('');

    out('## 2. Kanban ATUAL vs PROPOSTO');
    out('');
    out('| Coluna atual | Conversas |');
    out('|---|---|');
    for (const [k, v] of [...currentDist.entries()].sort((a, b) => b[1] - a[1])) out(`| ${k} | ${v} |`);
    out('');
    out('| Coluna proposta | Conversas |');
    out('|---|---|');
    for (const [k, v] of [...proposedDist.entries()].sort((a, b) => b[1] - a[1])) out(`| ${k} | ${v} |`);
    out('');
    out('### Matriz de migração (para onde cada card iria)');
    out('');
    out('| Transição | Conversas |');
    out('|---|---|');
    for (const [k, v] of [...migrationMatrix.entries()].sort((a, b) => b[1] - a[1])) out(`| ${k} | ${v} |`);
    out('');
    out(`Total de conversas que mudariam de coluna: **${changes.length}** de ${conversations.length}`);
    out('');

    out('## 3. Problemas do diagnóstico quantificados nos dados reais');
    out('');
    const problema = (
      id: string,
      titulo: string,
      list: ConvRow[],
      max = 10
    ) => {
      out(`### ${id} — ${titulo}: **${list.length}** conversa(s)`);
      out('');
      if (list.length) {
        out('| Conv | Contato | Status atual | Última msg |');
        out('|---|---|---|---|');
        list.slice(0, max).forEach((c) =>
          out(
            `| ${c.id} | ${c.contact_name || '?'} (${mask(c.contact_number)}) | ${c.status} | ${
              c.last_message_at ? new Date(c.last_message_at).toISOString() : '-'
            } |`
          )
        );
        if (list.length > max) out(`| ... | +${list.length - max} conversas | | |`);
        out('');
      }
    };

    problema('P1', `Conversas 'new' criadas só por disparo (cliente nunca falou) — poluem "Nova Interação"`, p1_newSemIncoming);
    problema('P2', `Finalizadas com needs_intervention=1 — presas em "Pendências" para sempre`, p2_finishedComPendencia);
    problema('P3', `Ativas com cliente inativo além do limite, mantidas "vivas" por mensagens não-cliente (job atual nunca finaliza)`, p3_vivaPorAutomacao);
    problema('P4', `'in_progress' com última mensagem do cliente SEM resposta (falha silenciosa / falso "Em Atendimento")`, p4_inProgressSemResposta);
    problema('P6', `Humano atendendo (última resposta humana) mas card parado em "Nova Interação"`, p6_humanoInvisivel);
    out(`### P5 — Status 'paused' (estado morto no ENUM): **${pausedCount}** conversa(s)`);
    out('');

    out('## 4. Amostra de mudanças de coluna (primeiras 20)');
    out('');
    out('| Conv | Contato | De | Para |');
    out('|---|---|---|---|');
    changes.slice(0, 20).forEach(({ conv, from, to }) =>
      out(`| ${conv.id} | ${conv.contact_name || '?'} (${mask(conv.contact_number)}) | ${from} | ${to} |`)
    );
    out('');
    out('---');
    out('Relatório gerado por scripts/temp-sim-classificacao-legado.ts (temporário, read-only).');

    fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf-8');
    console.log(`\n📄 Relatório salvo em: ${REPORT_PATH}`);
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Erro na simulação:', err);
  process.exit(1);
});
