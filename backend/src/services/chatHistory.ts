/**
 * Item 3 do plano de turnos (02/11/2026): histórico da conversa como mensagens user/assistant.
 *
 * - Mensagens do cliente (incoming) viram `user`; as da empresa (IA, atendente, automação) viram
 *   `assistant`.
 * - Mensagens seguidas do mesmo lado são juntadas numa só (o modelo vê a conversa alternada).
 * - O lote atual (mensagens que este turno vai responder) NÃO entra no histórico: ele vai uma
 *   vez só, na última mensagem `user`. Com os IDs do lote (agendador), o histórico é cortado na
 *   1ª mensagem do lote; sem IDs, retira o último bloco do cliente se for exatamente o fim do texto atual.
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
  media_id?: number | null;
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

const linhas = (t: string) => t.split('\n').map((l) => l.trim()).filter(Boolean);

/**
 * Sem IDs (debounce antigo/teste): retira o último bloco de mensagens do cliente se ele for
 * exatamente o final do texto atual (linha a linha). Pode pular até 3 mídias da empresa no fim
 * (ex.: mídia obrigatória enviada antes da resposta), que saem junto (cronologia).
 */
function withoutTrailingBatch(rows: HistoryRow[], currentText: string): HistoryRow[] {
  const atual = linhas(currentText);
  if (atual.length === 0) return [...rows];
  let end = rows.length;
  let skipped = 0;
  // só pula mídia (ex.: obrigatória, enviada antes da resposta no fluxo antigo); texto da empresa
  // no fim quer dizer que o bloco anterior já foi respondido.
  while (end > 0 && rows[end - 1].direction !== 'incoming' && (rows[end - 1].message_type || 'text') !== 'text' && skipped < 3) { end--; skipped++; }
  let start = end;
  while (start > 0 && rows[start - 1].direction === 'incoming') start--;
  // maior k: as últimas k mensagens do cliente formam exatamente o fim do texto atual
  for (let from = start; from < end; from++) {
    const bloco = rows.slice(from, end).flatMap((r) => linhas(rowText(r)));
    if (bloco.length === 0 || bloco.length > atual.length) continue;
    const fim = atual.slice(atual.length - bloco.length);
    if (bloco.every((l, i) => l === fim[i])) return rows.slice(0, from);
  }
  return [...rows];
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
    // Corta na 1ª mensagem do lote: o que veio depois é o próprio lote ou mensagens ainda na fila
    // (vão no próximo turno). Cortar tudo mantém a cronologia (o lote vai por último).
    kept = first >= 0 ? rows.slice(0, first) : rows.filter((r) => !inBatch(r));
  } else {
    kept = withoutTrailingBatch(rows, currentText);
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
export function renderForLog(messages: Array<{ role: string; content: string | any[] }>): string {
  return messages.map((m) => `[${m.role}]\n${contentForLog(m.content)}`).join('\n\n');
}

/** Item 5: conteúdo multimodal no log só com o texto e um marcador por anexo (nunca o base64). */
function contentForLog(content: string | any[]): string {
  if (!Array.isArray(content)) return String(content ?? '');
  return content
    .map((p: any) => (p?.type === 'text' ? String(p.text ?? '') : p?.type === 'video_url' ? '[vídeo anexado]' : p?.type === 'image_url' ? '[foto anexada]' : '[anexo]'))
    .join('\n');
}
