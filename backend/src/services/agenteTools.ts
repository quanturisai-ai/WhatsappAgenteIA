/**
 * Item 6 do plano de turnos (02/11/2026): ferramentas nativas (function calling) com teto de chamadas.
 *
 * - enviar_midia(id): só mídia do catálogo (a mesma lista que vai no system: ativa, de saída, pronta);
 * - chamar_atendente(motivo, resumo): alerta a equipe (e pausa a IA, se a config permitir: quem executa
 *   é o ConversationService);
 * - contato_proativo(numero, mensagem): só oferecida ao dono/atendente autorizado (#contatoia).
 *
 * O loop NÃO executa nada no WhatsApp: ele valida cada chamada, devolve o resultado ao modelo e junta as
 * ações. Quem executa é o ConversationService, depois da conferência do epoch (turno não cancelado), na
 * mesma ordem de antes (alerta, contato proativo, mídias com a resposta como legenda).
 *
 * Funções puras (sem banco nem rede), para teste.
 */

export type AcaoAgente =
  | { tipo: 'enviar_midia'; id: number }
  | { tipo: 'chamar_atendente'; motivo: string; resumo: string; automatico?: boolean }
  | { tipo: 'contato_proativo'; numero: string; mensagem: string };

export interface FerramentaYaml { nome: string; descricao: string }

export const NOMES_FERRAMENTAS = ['enviar_midia', 'chamar_atendente', 'contato_proativo'] as const;

const PARAMETROS: Record<string, any> = {
  enviar_midia: {
    type: 'object',
    properties: { id: { type: 'integer', description: 'ID numérico da mídia, da seção MÍDIAS DISPONÍVEIS.' } },
    required: ['id'],
  },
  chamar_atendente: {
    type: 'object',
    properties: {
      motivo: { type: 'string', description: 'Por que um atendente humano é necessário (curto).' },
      resumo: { type: 'string', description: 'Resumo da conversa até aqui, para o atendente.' },
    },
    required: ['motivo', 'resumo'],
  },
  contato_proativo: {
    type: 'object',
    properties: {
      numero: { type: 'string', description: 'Telefone com DDD (só dígitos) de quem vai receber a mensagem.' },
      mensagem: { type: 'string', description: 'Texto exato da mensagem a enviar.' },
    },
    required: ['numero', 'mensagem'],
  },
};

const DESCRICAO_PADRAO: Record<string, string> = {
  enviar_midia: 'Envia ao cliente uma mídia do catálogo pelo ID. A sua resposta em texto vai como legenda.',
  chamar_atendente: 'Avisa a equipe humana que esta conversa precisa de um atendente.',
  contato_proativo: 'Envia uma mensagem do número da empresa para outro telefone (só a pedido do dono/atendente).',
};

/** Array `tools` do payload (formato OpenAI/OpenRouter). contato_proativo só para quem pode. */
export function definicoesTools(ferramentas: FerramentaYaml[] | undefined, opts: { contatoProativo: boolean }): any[] {
  const desc = new Map((ferramentas || []).map((f) => [f.nome, f.descricao]));
  return NOMES_FERRAMENTAS
    .filter((n) => n !== 'contato_proativo' || opts.contatoProativo)
    .map((nome) => ({
      type: 'function',
      function: { name: nome, description: (desc.get(nome) || DESCRICAO_PADRAO[nome]).trim(), parameters: PARAMETROS[nome] },
    }));
}

/** A mídia está no catálogo que a IA pode enviar? (mesmo filtro do system fixo) */
export function midiaNoCatalogo(
  m: { user_id?: number | null; is_active?: any; status?: string | null; source?: string | null } | null | undefined,
  userId: number
): boolean {
  if (!m) return false;
  const ativa = m.is_active === undefined || m.is_active === null || m.is_active === true || m.is_active === 1 || m.is_active === '1';
  return Number(m.user_id) === Number(userId) && ativa && (!m.status || m.status === 'completed') && (!m.source || m.source === 'outgoing');
}

export interface ContextoFerramentas {
  /** IDs do catálogo (os mesmos do system). */
  midiasCatalogo: Set<number>;
  /** dono/atendente autorizado (#contatoia) */
  contatoProativo: boolean;
}

function argsDe(raw: any): Record<string, any> | null {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string' || raw.trim() === '') return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

const texto = (v: any) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

/** Valida uma chamada de ferramenta: devolve a ação (se válida) e o texto de resultado para o modelo. */
export function avaliarChamada(call: any, ctx: ContextoFerramentas): { acao?: AcaoAgente; resultado: string } {
  const nome = call?.function?.name;
  const args = argsDe(call?.function?.arguments);
  if (!args) return { resultado: 'erro: argumentos inválidos (JSON esperado).' };
  if (nome === 'enviar_midia') {
    const bruto = texto(args.id);
    const id = /^\d+$/.test(bruto) ? Number(bruto) : NaN;
    if (!Number.isSafeInteger(id) || !ctx.midiasCatalogo.has(id)) {
      return { resultado: `erro: a mídia ${texto(args.id) || '?'} não está em MÍDIAS DISPONÍVEIS. Use só IDs dessa lista, ou não envie mídia.` };
    }
    return { acao: { tipo: 'enviar_midia', id }, resultado: `ok: mídia ${id} será enviada ao cliente junto com a sua resposta em texto.` };
  }
  if (nome === 'chamar_atendente') {
    const motivo = texto(args.motivo);
    const resumo = texto(args.resumo);
    if (!motivo) return { resultado: 'erro: informe o motivo.' };
    return {
      acao: { tipo: 'chamar_atendente', motivo: motivo.slice(0, 500), resumo: resumo.slice(0, 2000) },
      resultado: 'ok: a equipe será avisada. Agora escreva a resposta ao cliente (por exemplo, que um atendente vai continuar o atendimento).',
    };
  }
  if (nome === 'contato_proativo') {
    if (!ctx.contatoProativo) return { resultado: 'erro: ferramenta não disponível nesta conversa.' };
    const numero = texto(args.numero).replace(/\D/g, '');
    const mensagem = texto(args.mensagem);
    if (numero.length < 10 || !mensagem) return { resultado: 'erro: informe numero (com DDD) e mensagem.' };
    return {
      acao: { tipo: 'contato_proativo', numero, mensagem },
      resultado: `ok: mensagem para ${numero} registrada (sai depois desta resposta). Para corrigir, chame de novo: vale a última chamada.`,
    };
  }
  return { resultado: `erro: ferramenta desconhecida (${String(nome)}).` };
}

export interface RespostaLLM {
  content: string | null;
  toolCalls: any[];
  /** campos da mensagem assistant que o provedor pede de volta na chamada seguinte (ex.: reasoning_details) */
  extras?: Record<string, any>;
}

/** Teto absoluto de chamadas, qualquer que seja AGENTE_TOOLS_MAX_CHAMADAS. */
export const MAX_CHAMADAS_ABSOLUTO = 5;

export interface ResultadoLoop {
  texto: string;
  acoes: AcaoAgente[];
  chamadas: number;
  /** passou do teto sem texto final: ação chamar_atendente automática incluída */
  estourou: boolean;
  /** nomes das ferramentas pedidas, na ordem (para a métrica) */
  pedidas: string[];
}

/** Texto ao cliente quando a IA não conclui dentro do teto (decisão conservadora; ver implantacao-log). */
export const TEXTO_TETO = 'Vou chamar um atendente para continuar seu atendimento. Só um momento, por favor.';

/**
 * Loop: chama o LLM; se ele pedir ferramentas sem dar texto, devolve os resultados e chama de novo,
 * até `maxChamadas`. Com texto, termina (ferramentas pedidas junto também valem). Passou do teto sem
 * texto: chama um atendente (ação automática) e responde TEXTO_TETO; nesse caso NENHUMA outra ação
 * vale (nem mídia nem contato proativo já aceitos): só o alerta.
 */
export async function loopFerramentas(
  chamarLLM: (messages: any[]) => Promise<RespostaLLM>,
  messages: any[],
  ctx: ContextoFerramentas,
  maxChamadas = 3
): Promise<ResultadoLoop> {
  maxChamadas = Math.max(1, Math.min(MAX_CHAMADAS_ABSOLUTO, Math.floor(maxChamadas) || 1));
  const conversa = [...messages];
  const acoes: AcaoAgente[] = [];
  const pedidas: string[] = [];
  const add = (a: AcaoAgente) => {
    // sem repetição: mesma mídia uma vez; um alerta por turno (o primeiro vale); um contato proativo
    // por turno (o último vale, para o modelo poder corrigir número ou texto)
    if (a.tipo === 'enviar_midia' && acoes.some((x) => x.tipo === 'enviar_midia' && x.id === a.id)) return;
    if (a.tipo === 'chamar_atendente' && acoes.some((x) => x.tipo === a.tipo)) return;
    if (a.tipo === 'contato_proativo') {
      const k = acoes.findIndex((x) => x.tipo === 'contato_proativo');
      if (k >= 0) acoes.splice(k, 1);
    }
    acoes.push(a);
  };
  for (let i = 1; i <= maxChamadas; i++) {
    const r = await chamarLLM(conversa);
    const calls = Array.isArray(r.toolCalls) ? r.toolCalls : [];
    const resultados: Array<{ id: string; resultado: string }> = [];
    calls.forEach((c, k) => {
      pedidas.push(String(c?.function?.name || '?'));
      const v = avaliarChamada(c, ctx);
      if (v.acao) add(v.acao);
      resultados.push({ id: String(c?.id || `call_${i}_${k}`), resultado: v.resultado });
    });
    const txt = typeof r.content === 'string' ? r.content.trim() : '';
    if (txt) return { texto: txt, acoes, chamadas: i, estourou: false, pedidas };
    if (calls.length === 0) throw new Error('Resposta do OpenRouter não contém texto');
    conversa.push({
      ...(r.extras || {}),
      role: 'assistant',
      content: r.content ?? null,
      tool_calls: calls.map((c, k) => ({
        ...c,
        id: resultados[k].id,
        type: c?.type || 'function',
        function: {
          ...(c?.function || {}),
          // a API exige arguments como texto JSON na chamada seguinte
          arguments: typeof c?.function?.arguments === 'string' ? c.function.arguments : JSON.stringify(c?.function?.arguments ?? {}),
        },
      })),
    });
    for (const res of resultados) conversa.push({ role: 'tool', tool_call_id: res.id, content: res.resultado });
  }
  const alerta: AcaoAgente = {
    tipo: 'chamar_atendente',
    motivo: `a IA não concluiu a resposta em ${maxChamadas} chamadas (limite de ferramentas)`,
    resumo: `ferramentas pedidas: ${pedidas.join(', ') || '-'}`,
    automatico: true,
  };
  return { texto: TEXTO_TETO, acoes: [alerta], chamadas: maxChamadas, estourou: true, pedidas };
}
