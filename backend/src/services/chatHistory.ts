/**
 * Item 3 do plano de turnos (02/11/2026): histórico da conversa como mensagens user/assistant.
 *
 * - Mensagens do cliente (incoming) viram `user`; as da empresa (IA, atendente, automação) viram
 *   `assistant`.
 * - Mensagens seguidas do mesmo lado são juntadas numa só (o modelo vê a conversa alternada).
 * - O lote atual (mensagens que este turno vai responder) NÃO entra no histórico: ele vai uma
 *   vez só, na última mensagem `user`. Com os IDs do lote (agendador), o histórico é cortado na
 *   1ª mensagem do lote; sem IDs, retira as últimas mensagens do cliente que já estão no texto atual.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface HistoryRow {
  id?: number;
  message_id?: string | null;
  content?: string | null;
  message_type?: string | null;
  direction: 'incoming' | 'outgoing' | string;
}

export interface BatchIds {
  batchDbIds?: number[];
  batchMessageIds?: string[];
}

function rowText(row: HistoryRow): string {
  const text = (row.content || '').trim();
  if (text) return text;
  return row.message_type ? `[${row.message_type}]` : '';
}

/** Linhas do banco (ordem cronológica) que entram no histórico, sem o lote atual. */
export function historyRowsBeforeBatch(rows: HistoryRow[], currentText: string, batch: BatchIds = {}, maxMessages = 30): HistoryRow[] {
  const dbIds = new Set((batch.batchDbIds || []).filter((v) => typeof v === 'number'));
  const msgIds = new Set((batch.batchMessageIds || []).filter(Boolean));
  const inBatch = (r: HistoryRow) =>
    (typeof r.id === 'number' && dbIds.has(r.id)) || (!!r.message_id && msgIds.has(r.message_id));

  let kept: HistoryRow[];
  if (dbIds.size > 0 || msgIds.size > 0) {
    const first = rows.findIndex(inBatch);
    // Corta na 1ª mensagem do lote: o que veio depois dela é o próprio lote ou mensagem que
    // ainda está na fila (vai no próximo turno).
    kept = first >= 0 ? rows.slice(0, first) : rows.filter((r) => !inBatch(r));
  } else {
    // Sem IDs (chamada antiga/teste): retira as últimas mensagens do cliente já contidas no texto atual.
    kept = [...rows];
    const atual = currentText.trim();
    while (kept.length > 0) {
      const last = kept[kept.length - 1];
      const t = rowText(last);
      if (last.direction === 'incoming' && t && atual.includes(t)) kept.pop();
      else break;
    }
  }
  return maxMessages > 0 ? kept.slice(-maxMessages) : kept;
}

/** Junta mensagens seguidas do mesmo lado. */
export function mergeConsecutive(messages: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of messages) {
    const content = (m.content || '').trim();
    if (!content) continue;
    const prev = out[out.length - 1];
    if (prev && prev.role === m.role) prev.content = `${prev.content}\n${content}`;
    else out.push({ role: m.role, content });
  }
  return out;
}

/**
 * Monta [system?, ...histórico, user(lote atual)]. Se o histórico terminar com mensagem do cliente
 * sem resposta (ex.: IA pausada), ela é juntada à mensagem atual para manter a alternância.
 */
export function buildChatMessages(system: string | null, history: ChatMessage[], currentText: string): ChatMessage[] {
  const merged = mergeConsecutive([...history, { role: 'user', content: currentText }]);
  return system && system.trim() ? [{ role: 'system', content: system }, ...merged] : merged;
}

/** Linhas do banco -> mensagens user/assistant (sem o lote atual). */
export function rowsToChat(rows: HistoryRow[]): ChatMessage[] {
  return rows.map((r) => ({ role: r.direction === 'incoming' ? 'user' : 'assistant', content: rowText(r) } as ChatMessage));
}

/** Histórico do chat de teste do painel ({role:'Cliente'|'Agente'}), sem a mensagem atual. */
export function customHistoryToChat(custom: Array<{ role: string; content: string }>, currentText: string): ChatMessage[] {
  const list = [...custom];
  const last = list[list.length - 1];
  if (last && last.role === 'Cliente' && (last.content || '').trim() === currentText.trim()) list.pop();
  return list
    .filter((m) => m.role === 'Cliente' || m.role === 'Agente')
    .map((m) => ({ role: m.role === 'Cliente' ? 'user' : 'assistant', content: m.content } as ChatMessage));
}

/** Texto legível das mensagens para o log de curadoria (whatsapp-conversations.log). */
export function renderForLog(messages: ChatMessage[]): string {
  return messages.map((m) => `[${m.role}]\n${m.content}`).join('\n\n');
}
