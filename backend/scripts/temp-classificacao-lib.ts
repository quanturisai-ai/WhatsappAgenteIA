/**
 * TEMPORÁRIO — Lib de referência da NOVA lógica de classificação de conversas.
 *
 * Este arquivo é a "especificação executável" das melhorias propostas no
 * PLANO_MELHORIA_CLASSIFICACAO_CONVERSAS.md. Ele NÃO é importado por nenhum
 * código do sistema real — serve apenas para:
 *   1. Ser exercitado pelos testes sintéticos (temp-test-classificacao.ts)
 *   2. Ser aplicado retroativamente aos dados legados (temp-sim-classificacao-legado.ts)
 *
 * Quando a lógica for aprovada, as funções daqui serão portadas para os
 * serviços reais (conversation.service, whatsapp.service, fidelizacao*).
 * Apagar este arquivo após a implementação definitiva.
 */

// ---------------------------------------------------------------------------
// Tipos das novas dimensões
// ---------------------------------------------------------------------------

/** Origem da mensagem — substitui/complementa o booleano is_from_ai */
export type MessageSource = 'client' | 'ai' | 'human' | 'automation';

/**
 * Funil (mapeia para o ENUM existente para não quebrar queries):
 *  - 'new'         → cliente falou e ninguém respondeu ainda ("Aguardando resposta")
 *  - 'in_progress' → atendimento ativo (IA ou humano)  ("active")
 *  - 'finished'    → encerrada (inclui campanha sem retorno)
 *  - 'paused' é aposentado (nunca foi atribuído no sistema atual)
 */
export type FunnelStatus = 'new' | 'in_progress' | 'finished';

/** Quem tem a bola no atendimento */
export type Handler = 'none' | 'ai' | 'human';

/** Como a conversa nasceu */
export type Origin = 'inbound' | 'campaign' | 'outbound';

/** Colunas do novo Kanban */
export type KanbanColumn =
  | 'pendencias'
  | 'aguardando_resposta'
  | 'ia_atendendo'
  | 'humano_atendendo'
  | 'finalizadas';

export interface ConversationState {
  status: FunnelStatus;
  handler: Handler;
  origin: Origin;
  needsIntervention: boolean;
  autoResponding: boolean;
  /** Última mensagem de QUALQUER origem (equivale ao last_message_at atual) */
  lastMessageAt: Date | null;
  /** Última mensagem DO CLIENTE — novo campo, base da auto-finalização */
  lastClientMessageAt: Date | null;
}

export type ConversationEvent =
  | { type: 'client_message'; at: Date }
  | { type: 'ai_reply_sent'; at: Date }        // resposta da IA ENVIADA COM SUCESSO
  | { type: 'ai_reply_failed'; at: Date }      // RAG falhou/timeout — hoje fica mudo
  | { type: 'automation_sent'; at: Date }      // disparo de fidelização/campanha
  | { type: 'ai_proactive_sent'; at: Date }    // CONTATO_PROATIVO da IA
  | { type: 'human_reply'; at: Date; via: 'dashboard' | 'device' }
  | { type: 'takeover'; at: Date }             // atendente clicou "assumir"
  | { type: 'finish'; at: Date }               // encerramento manual
  | { type: 'ai_alert_attendant'; at: Date };  // [ALERTAR_ATENDENTE]

// ---------------------------------------------------------------------------
// 1. Derivação de source (usada no backfill dos dados legados e no runtime)
// ---------------------------------------------------------------------------

export interface LegacyMessageRow {
  direction: 'incoming' | 'outgoing';
  is_from_ai: boolean;
  content: string;
}

/**
 * Deriva o source de uma mensagem legada.
 * `automationContents` = conjunto de conteúdos registrados em
 * fidelizacao_notificacoes.mensagem_enviada (enviado_whatsapp=1) do mesmo user.
 */
export function deriveSource(
  msg: LegacyMessageRow,
  automationContents: Set<string>
): MessageSource {
  if (msg.direction === 'incoming') return 'client';
  if (msg.is_from_ai) return 'ai';
  if (automationContents.has(normalizeContent(msg.content))) return 'automation';
  return 'human';
}

export function normalizeContent(content: string): string {
  return (content || '').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// 2. Estado inicial ao criar conversa
// ---------------------------------------------------------------------------

export function initialState(
  firstEvent: ConversationEvent
): ConversationState {
  const base: ConversationState = {
    status: 'new',
    handler: 'none',
    origin: 'inbound',
    needsIntervention: false,
    autoResponding: true,
    lastMessageAt: firstEvent.at,
    lastClientMessageAt: null,
  };

  switch (firstEvent.type) {
    case 'client_message':
      // Cliente iniciou: entra no funil como "aguardando resposta"
      return { ...base, lastClientMessageAt: firstEvent.at };
    case 'automation_sent':
      // REGRA NOVA: campanha NÃO cria "Nova Interação".
      // Nasce finalizada com origem campaign; só reabre se o cliente responder.
      return { ...base, status: 'finished', origin: 'campaign' };
    case 'ai_proactive_sent':
      // Contato proativo da IA: também não é interação do cliente
      return { ...base, status: 'finished', origin: 'outbound', handler: 'ai' };
    case 'human_reply':
      // Atendente iniciou conversa manualmente (celular ou dashboard)
      return { ...base, status: 'in_progress', origin: 'outbound', handler: 'human' };
    default:
      return applyEvent(base, firstEvent);
  }
}

// ---------------------------------------------------------------------------
// 3. Máquina de transição de estados
// ---------------------------------------------------------------------------

export function applyEvent(
  state: ConversationState,
  event: ConversationEvent
): ConversationState {
  const s = { ...state };

  switch (event.type) {
    case 'client_message':
      s.lastMessageAt = event.at;
      s.lastClientMessageAt = event.at;
      // Reabertura OU primeira fala do cliente: volta para "aguardando resposta"
      // se ninguém está atendendo ativamente agora.
      if (s.status === 'finished') {
        s.status = 'new';
        s.handler = 'none';
      } else if (s.status === 'new') {
        // permanece aguardando
      }
      // Se está in_progress (IA ou humano atendendo), permanece — a bola já é de alguém.
      return s;

    case 'ai_reply_sent':
      // REGRA NOVA: só vira "em atendimento" DEPOIS do envio bem-sucedido
      s.lastMessageAt = event.at;
      s.status = 'in_progress';
      s.handler = 'ai';
      return s;

    case 'ai_reply_failed':
      // REGRA NOVA: falha do RAG não some — vira pendência
      s.needsIntervention = true;
      return s;

    case 'automation_sent':
      // REGRA NOVA: automação NÃO atualiza lastClientMessageAt, NÃO muda status
      // nem handler. Atualiza apenas lastMessageAt (histórico).
      s.lastMessageAt = event.at;
      return s;

    case 'ai_proactive_sent':
      s.lastMessageAt = event.at;
      return s;

    case 'human_reply':
      s.lastMessageAt = event.at;
      // REGRA NOVA: humano respondeu (pelo dashboard OU pelo celular) → conversa
      // está em atendimento humano; pausa a IA para evitar resposta dupla.
      if (s.status !== 'finished') {
        s.status = 'in_progress';
      } else {
        // Humano mandou mensagem numa conversa finalizada → reabre em atendimento
        s.status = 'in_progress';
      }
      s.handler = 'human';
      s.autoResponding = false;
      return s;

    case 'takeover':
      s.status = 'in_progress';
      s.handler = 'human';
      s.autoResponding = false;
      return s;

    case 'finish':
      s.status = 'finished';
      s.handler = 'none';
      s.autoResponding = true;
      // CORREÇÃO DE BUG: encerrar limpa a pendência (hoje fica presa em "Pendências")
      s.needsIntervention = false;
      return s;

    case 'ai_alert_attendant':
      s.needsIntervention = true;
      return s;
  }
}

// ---------------------------------------------------------------------------
// 4. Auto-finalização por inatividade (job horário)
// ---------------------------------------------------------------------------

/**
 * REGRA NOVA: usa lastClientMessageAt (não lastMessageAt).
 * Disparos de automação deixam de manter a conversa "viva".
 * Conversa sem NENHUMA mensagem de cliente (ex.: só campanha) com status
 * ativo também é elegível — fallback para lastMessageAt nesse caso.
 */
export function shouldAutoFinalize(
  state: ConversationState,
  now: Date,
  maxAgeHours: number
): boolean {
  if (state.status === 'finished') return false;
  const reference = state.lastClientMessageAt ?? state.lastMessageAt;
  if (!reference) return false;
  const ageMs = now.getTime() - reference.getTime();
  return ageMs > maxAgeHours * 60 * 60 * 1000;
}

/** Comportamento ATUAL do job (para comparação nas simulações) */
export function shouldAutoFinalizeLegacy(
  status: string,
  lastMessageAt: Date | null,
  now: Date,
  maxAgeHours: number
): boolean {
  if (status === 'finished' || !lastMessageAt) return false;
  return now.getTime() - lastMessageAt.getTime() > maxAgeHours * 60 * 60 * 1000;
}

// ---------------------------------------------------------------------------
// 5. Mapeamento estado → coluna do Kanban
// ---------------------------------------------------------------------------

export function toKanbanColumn(state: ConversationState): KanbanColumn {
  if (state.needsIntervention) return 'pendencias';
  if (state.status === 'finished') return 'finalizadas';
  if (state.status === 'new') return 'aguardando_resposta';
  // in_progress
  return state.handler === 'human' ? 'humano_atendendo' : 'ia_atendendo';
}

/** Classificação ATUAL do Kanban (KanbanBoard.tsx) — para comparação */
export function toLegacyKanbanColumn(
  status: string,
  needsIntervention: boolean
): 'pendencias' | 'nova_interacao' | 'em_atendimento' | 'finalizado' | 'invisivel' {
  if (needsIntervention) return 'pendencias';
  if (status === 'new') return 'nova_interacao';
  if (status === 'in_progress') return 'em_atendimento';
  if (status === 'finished') return 'finalizado';
  return 'invisivel'; // 'paused' não aparece em nenhuma coluna hoje
}

// ---------------------------------------------------------------------------
// 6. Reconstrução do estado a partir do histórico de mensagens (backfill)
// ---------------------------------------------------------------------------

export interface HistoricMessage {
  source: MessageSource;
  at: Date;
}

/**
 * Reconstrói o estado proposto de uma conversa legada reproduzindo seu
 * histórico de mensagens na máquina de estados. Usado pelo script de
 * simulação e, depois, pelo script de backfill da migração real.
 *
 * `currentNeedsIntervention` é preservado do banco (não derivável do histórico).
 */
export function replayHistory(
  messages: HistoricMessage[],
  currentNeedsIntervention: boolean,
  now: Date,
  maxAgeHours: number
): ConversationState {
  if (messages.length === 0) {
    return {
      status: 'finished',
      handler: 'none',
      origin: 'outbound',
      needsIntervention: currentNeedsIntervention,
      autoResponding: true,
      lastMessageAt: null,
      lastClientMessageAt: null,
    };
  }

  const sorted = [...messages].sort((a, b) => a.at.getTime() - b.at.getTime());

  const toEvent = (m: HistoricMessage): ConversationEvent => {
    switch (m.source) {
      case 'client': return { type: 'client_message', at: m.at };
      case 'ai': return { type: 'ai_reply_sent', at: m.at };
      case 'automation': return { type: 'automation_sent', at: m.at };
      case 'human': return { type: 'human_reply', at: m.at, via: 'device' };
    }
  };

  let state = initialState(toEvent(sorted[0]));
  for (let i = 1; i < sorted.length; i++) {
    state = applyEvent(state, toEvent(sorted[i]));
  }

  state.needsIntervention = currentNeedsIntervention;

  // Aplicar a regra de auto-finalização com o relógio de hoje
  if (shouldAutoFinalize(state, now, maxAgeHours)) {
    state = applyEvent(state, { type: 'finish', at: now });
    // finish limpa needsIntervention por regra; na reconstrução em massa
    // preservamos pendências não resolvidas para revisão humana:
    state.needsIntervention = currentNeedsIntervention;
  }

  return state;
}
