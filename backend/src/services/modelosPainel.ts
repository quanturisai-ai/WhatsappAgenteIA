/**
 * Etapa 6 (AGENTE_MODELO_PAINEL): os três modelos do agente vêm do painel (agent_config, por usuário):
 * - generation_model: responde ao cliente (já existia);
 * - vision_model (novo): descreve a foto/vídeo que o modelo principal não entende;
 * - transcription_model (novo): transcreve o áudio.
 * Campo vazio = padrão do .env (OPENROUTER_GENERATION_MODEL; MIDIA_DESCRICAO_MODELO, senão
 * OPENROUTER_GENERATION_MODEL; OPENROUTER_TRANSCRIPTION_MODEL). Nenhum modelo fixo aqui.
 *
 * As colunas novas são aditivas (SQL_COLUNAS_MODELOS, aplicado à mão com backup). Sem elas, a leitura
 * cai no padrão do .env e a gravação avisa, sem derrubar nada.
 */
import pool from '../config/database';
import logger from '../utils/logger';
import { aceita, capacidades, CapacidadesModelo } from './modelosOpenRouter';
import { modeloPainelAppliesTo } from '../utils/agentFlags';

export const SQL_COLUNAS_MODELOS = [
  'ALTER TABLE agent_config ADD COLUMN IF NOT EXISTS vision_model VARCHAR(100) NULL DEFAULT NULL',
  'ALTER TABLE agent_config ADD COLUMN IF NOT EXISTS transcription_model VARCHAR(100) NULL DEFAULT NULL',
];

export interface ModelosExtras {
  vision_model: string | null;
  transcription_model: string | null;
}

const limpo = (v: any): string => String(v ?? '').trim();

export function padraoGeracao(): string {
  return limpo(process.env.OPENROUTER_GENERATION_MODEL);
}
export function padraoVisao(): string {
  return limpo(process.env.MIDIA_DESCRICAO_MODELO) || padraoGeracao();
}
export function padraoTranscricao(): string {
  return limpo(process.env.OPENROUTER_TRANSCRIPTION_MODEL);
}

export interface ModelosResolvidos {
  geracao: string;
  visao: string;
  transcricao: string;
}

/** Painel > .env (função pura). Vazio nos dois = '' (quem usa trata). */
export function resolverModelos(painel: { generation_model?: any; vision_model?: any; transcription_model?: any } | null | undefined): ModelosResolvidos {
  return {
    geracao: limpo(painel?.generation_model) || padraoGeracao(),
    visao: limpo(painel?.vision_model) || padraoVisao(),
    transcricao: limpo(painel?.transcription_model) || padraoTranscricao(),
  };
}

function linhasDe(r: any): any[] {
  if (!r) return [];
  if (Array.isArray(r)) return Array.isArray(r[0]) ? r[0] : Array.from(r);
  return [];
}

let avisouSemColunas = false;

/** Colunas novas do painel. Sem colunas/banco: nulos (= padrão do .env). Nunca lança. */
export async function lerModelosExtras(userId: number): Promise<ModelosExtras> {
  const vazio: ModelosExtras = { vision_model: null, transcription_model: null };
  if (!(userId > 0)) return vazio;
  let conn: any;
  try {
    conn = await pool.getConnection();
    const rows = linhasDe(await conn.query('SELECT vision_model, transcription_model FROM agent_config WHERE user_id = ?', [userId]));
    const r = rows[0];
    if (!r) return vazio;
    return { vision_model: limpo(r.vision_model) || null, transcription_model: limpo(r.transcription_model) || null };
  } catch (err: any) {
    if (!avisouSemColunas) logger.warn(`[modelos] colunas vision_model/transcription_model indisponíveis (${err?.message || err}); usando o .env`);
    avisouSemColunas = true;
    return vazio;
  } finally {
    try { conn?.release(); } catch { /* */ }
  }
}

/** Grava as colunas novas (só as enviadas). false = colunas ausentes ou erro (logado). */
export async function salvarModelosExtras(userId: number, v: Partial<ModelosExtras>): Promise<boolean> {
  const campos: string[] = [];
  const valores: any[] = [];
  for (const k of ['vision_model', 'transcription_model'] as const) {
    if (v[k] === undefined) continue;
    campos.push(`${k} = ?`);
    valores.push(limpo(v[k]).slice(0, 100) || null);
  }
  if (!campos.length) return true;
  let conn: any;
  try {
    conn = await pool.getConnection();
    await conn.query(`UPDATE agent_config SET ${campos.join(', ')} WHERE user_id = ?`, [...valores, userId]);
    return true;
  } catch (err: any) {
    logger.warn(`[modelos] não deu para gravar vision_model/transcription_model (${err?.message || err})`);
    return false;
  } finally {
    try { conn?.release(); } catch { /* */ }
  }
}

/** generation_model do painel (a coluna antiga, sempre existe). */
async function lerGeracao(userId: number): Promise<string | null> {
  let conn: any;
  try {
    conn = await pool.getConnection();
    const rows = linhasDe(await conn.query('SELECT generation_model FROM agent_config WHERE user_id = ?', [userId]));
    return limpo(rows[0]?.generation_model) || null;
  } catch {
    return null;
  } finally {
    try { conn?.release(); } catch { /* */ }
  }
}

/** Os três modelos do usuário (painel > .env). */
export async function modelosDoUsuario(userId: number): Promise<ModelosResolvidos> {
  const [geracao, extras] = await Promise.all([lerGeracao(userId), lerModelosExtras(userId)]);
  return resolverModelos({ generation_model: geracao, ...extras });
}

export type TipoMidia = 'image' | 'video';

/**
 * Quem descreve uma foto/vídeo: o modelo de foto/vídeo do painel se ele aceitar o tipo; senão o principal
 * se aceitar; senão ninguém (null). Modelo desconhecido do catálogo: só o de foto/vídeo é tentado (o dono
 * o escolheu para isso; se falhar, a mídia fica "não vista").
 */
export function escolherDescritor(
  tipo: TipoMidia,
  m: { geracao: string; visao: string },
  cap: (id: string) => CapacidadesModelo
): string | null {
  const cands = [m.visao, m.geracao].filter((x, i, a) => !!x && a.indexOf(x) === i);
  for (const id of cands) if (aceita(cap(id), tipo) === true) return id;
  if (m.visao && aceita(cap(m.visao), tipo) === null) return m.visao;
  return null;
}

/** Versão assíncrona (garante o catálogo). */
export async function descritorPara(tipo: TipoMidia, m: { geracao: string; visao: string }): Promise<string | null> {
  const caps = new Map<string, CapacidadesModelo>();
  for (const id of [m.visao, m.geracao]) if (id && !caps.has(id)) caps.set(id, await capacidades(id));
  return escolherDescritor(tipo, m, (id) => caps.get(id)!);
}

/**
 * Opções da descrição na chegada (midiaTurno.descreverMidiaRecebida). Com AGENTE_MODELO_PAINEL para este
 * contato, o modelo vem do painel do dono da conversa (descritorPara); senão {} (etapa 4, .env).
 */
export function opcoesDescricaoChegada(
  userId: number | null | undefined,
  contato: string | null | undefined
): { modeloPara?: (tipo: TipoMidia) => Promise<string | null> } {
  if (!(Number(userId) > 0) || !modeloPainelAppliesTo(contato)) return {};
  return { modeloPara: async (tipo) => descritorPara(tipo, await modelosDoUsuario(Number(userId))) };
}
