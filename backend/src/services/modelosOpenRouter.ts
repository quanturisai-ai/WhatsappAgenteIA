/**
 * Etapa 6 (AGENTE_MODELO_PAINEL): o que cada modelo aceita vem do catálogo do OpenRouter
 * (GET /models?output_modalities=all: architecture.input_modalities/output_modalities, supported_parameters
 * e pricing). Nada de lista fixa de modelos no código.
 *
 * - Cache em memória por MODELOS_CACHE_HORAS (padrão 24 h). Venceu: o turno usa o cache velho e atualiza
 *   em segundo plano. Sem cache nenhum: o turno espera no máximo alguns segundos pela 1ª carga.
 * - Salvar o painel força a atualização (o dono acabou de escolher um modelo, talvez novo).
 * - Modelo fora do catálogo (ou catálogo fora do ar) = "desconhecido": quem usa decide pelo lado seguro
 *   (mídia não vai ao modelo; tools são tentadas e, se recusadas, o turno cai no modo por marcador).
 */
import axios from 'axios';
import logger from '../utils/logger';
import { envFloat } from '../utils/agentFlags';

export type Modalidade = 'text' | 'image' | 'video' | 'audio' | 'file' | string;

export interface CapacidadesModelo {
  id: string;
  /** está no catálogo do OpenRouter? false = nada se sabe (tratar pelo lado seguro) */
  conhecido: boolean;
  nome?: string;
  entrada: Modalidade[];
  saida: string[];
  /** supported_parameters inclui "tools"? null = desconhecido */
  tools: boolean | null;
  /** supported_parameters inclui response_format/structured_outputs? null = desconhecido */
  respostaJson: boolean | null;
  /** preço em US$ por token (como o OpenRouter devolve, em texto) */
  preco: Record<string, string> | null;
  contexto?: number;
  /** reasoning do catálogo: obrigatório? quais esforços? (ex.: GLM 5.3 Flash recusa effort "none") */
  raciocinio?: { obrigatorio: boolean; esforcos: string[] } | null;
}

interface Catalogo {
  em: number;
  mapa: Map<string, CapacidadesModelo>;
}

let catalogo: Catalogo | null = null;
let carregando: Promise<boolean> | null = null;
/** Falha recente na carga: não tenta de novo por 60 s (sem cache, cada turno esperaria o timeout). */
let ultimaFalha = 0;

export function cacheMs(): number {
  return envFloat('MODELOS_CACHE_HORAS', 24) * 3600_000;
}

const chave = (id: string | null | undefined) => String(id || '').trim().toLowerCase();

/** Converte um item do /models em capacidades (função pura). */
export function capacidadesDoItem(m: any): CapacidadesModelo | null {
  if (!m || typeof m.id !== 'string' || !m.id.trim()) return null;
  const arq = m.architecture || {};
  const lista = (v: any): string[] => (Array.isArray(v) ? v.map((x) => String(x).toLowerCase()) : []);
  const params = Array.isArray(m.supported_parameters) ? m.supported_parameters.map((x: any) => String(x)) : null;
  const preco: Record<string, string> = {};
  if (m.pricing && typeof m.pricing === 'object') {
    for (const [k, v] of Object.entries(m.pricing)) if (typeof v === 'string' || typeof v === 'number') preco[k] = String(v);
  }
  return {
    id: m.id.trim(),
    conhecido: true,
    nome: typeof m.name === 'string' ? m.name : undefined,
    entrada: lista(arq.input_modalities),
    saida: lista(arq.output_modalities),
    tools: params ? params.includes('tools') : null,
    respostaJson: params ? params.includes('response_format') || params.includes('structured_outputs') : null,
    preco: Object.keys(preco).length ? preco : null,
    contexto: typeof m.context_length === 'number' ? m.context_length : undefined,
    raciocinio: m.reasoning && typeof m.reasoning === 'object'
      ? { obrigatorio: m.reasoning.mandatory === true, esforcos: lista(m.reasoning.supported_efforts) }
      : null,
  };
}

/** Substitui o catálogo (usado pela carga e pelos testes). */
export function definirCatalogo(itens: any[], em = Date.now()): void {
  const mapa = new Map<string, CapacidadesModelo>();
  for (const it of itens || []) {
    const c = capacidadesDoItem(it);
    if (c) mapa.set(chave(c.id), c);
  }
  catalogo = { em, mapa };
}

export function limparCatalogo(): void {
  catalogo = null;
  carregando = null;
  ultimaFalha = 0;
}

export function catalogoCarregadoEm(): number | null {
  return catalogo ? catalogo.em : null;
}

/** Busca o catálogo no OpenRouter (uma carga por vez). true = carregou. Nunca lança. */
export function atualizarCatalogo(): Promise<boolean> {
  if (carregando) return carregando;
  const base = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
  carregando = (async () => {
    const t0 = Date.now();
    try {
      // Catálogo público: não precisa (nem leva) a chave.
      const r = await axios.get(`${base}/models`, { params: { output_modalities: 'all' }, timeout: 20000 });
      const itens = r?.data?.data;
      if (!Array.isArray(itens) || itens.length === 0) throw new Error('catálogo vazio');
      definirCatalogo(itens);
      logger.info(`[modelos] catálogo do OpenRouter: ${itens.length} modelos (${Date.now() - t0} ms)`);
      return true;
    } catch (err: any) {
      ultimaFalha = Date.now();
      logger.warn(`[modelos] catálogo do OpenRouter indisponível (${err?.response?.status ? `HTTP ${err.response.status} ` : ''}${err?.message || err}); ${catalogo ? 'segue com o cache anterior' : 'sem cache'}`);
      return false;
    } finally {
      carregando = null;
    }
  })();
  return carregando;
}

/**
 * Garante um catálogo: vencido = atualiza em segundo plano e segue com o velho; vazio = espera até
 * esperaMs pela carga. forcar = espera a atualização (salvar o painel).
 */
export async function garantirCatalogo(opts: { esperaMs?: number; forcar?: boolean } = {}): Promise<void> {
  const espera = opts.esperaMs ?? 5000;
  const vencido = !catalogo || Date.now() - catalogo.em > cacheMs();
  if (!opts.forcar && !vencido) return;
  if (!opts.forcar && Date.now() - ultimaFalha < 60_000) return;
  const p = atualizarCatalogo();
  if (catalogo && !opts.forcar) return; // usa o velho; a carga termina sozinha
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([p, new Promise((r) => { timer = setTimeout(r, espera); })]);
  if (timer) clearTimeout(timer);
}

/** Capacidades pelo cache atual (síncrono). Fora do catálogo = desconhecido. */
export function capacidadesDe(id: string | null | undefined): CapacidadesModelo {
  const c = catalogo?.mapa.get(chave(id));
  if (c) return c;
  return { id: String(id || '').trim(), conhecido: false, entrada: [], saida: [], tools: null, respostaJson: null, preco: null };
}

export async function capacidades(id: string | null | undefined, esperaMs = 5000): Promise<CapacidadesModelo> {
  await garantirCatalogo({ esperaMs });
  return capacidadesDe(id);
}

/** O modelo aceita essa entrada? true/false pelo catálogo; null = desconhecido. */
export function aceita(c: CapacidadesModelo, tipo: 'image' | 'video' | 'audio'): boolean | null {
  if (!c.conhecido) return null;
  return c.entrada.includes(tipo);
}

/** Modelo de transcrição pura (output "transcription", endpoint /audio/transcriptions)? null = desconhecido. */
export function ehTranscricao(c: CapacidadesModelo): boolean | null {
  if (!c.conhecido) return null;
  return c.saida.includes('transcription');
}

/** Lista para o painel (todos os modelos do cache). */
export function listarCatalogo(): CapacidadesModelo[] {
  return catalogo ? [...catalogo.mapa.values()] : [];
}

/** Preço legível (US$ por milhão de tokens). */
export function precoPorMilhao(c: CapacidadesModelo): { entrada?: number; saida?: number } {
  const f = (v?: string) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 1e6 * 10000) / 10000 : undefined;
  };
  return { entrada: f(c.preco?.prompt), saida: f(c.preco?.completion) };
}

const ORDEM_ESFORCO = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

/**
 * reasoning do payload. Padrão de sempre: { effort: 'none', exclude: true } (respostas rápidas).
 * Modelo que o catálogo diz ter raciocínio obrigatório: o menor esforço aceito (sem "none"), exclude.
 * Desconhecido: o padrão de sempre.
 */
export function reasoningPara(c: CapacidadesModelo | null | undefined): { effort: string; exclude: true } {
  const r = c?.raciocinio;
  if (!r || !r.obrigatorio) return { effort: 'none', exclude: true };
  const aceitos = r.esforcos.filter((e) => e !== 'none');
  const menor = aceitos.sort((a, b) => {
    const ia = ORDEM_ESFORCO.indexOf(a), ib = ORDEM_ESFORCO.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  })[0];
  return { effort: menor || 'low', exclude: true };
}

/**
 * reasoning só quando o catálogo diz que o raciocínio é obrigatório (o payload padrão manda effort "none",
 * que esse modelo recusa com 400). Fora disso: undefined (o payload fica como sempre). Síncrono (cache).
 */
export function reasoningObrigatorio(id: string | null | undefined): { effort: string; exclude: true } | undefined {
  const c = capacidadesDe(id);
  return c.raciocinio?.obrigatorio ? reasoningPara(c) : undefined;
}

// ------------------------------------------------------------------ modelo sem tools

/**
 * O provedor recusou as ferramentas? OpenRouter devolve 404 "No endpoints found that support tool use"
 * (filtro de compatibilidade); alguns provedores devolvem 400 citando tools.
 */
export function erroSemSuporteTools(err: any): boolean {
  if (!err) return false;
  if (err.semSuporteTools === true) return true;
  const st = err.response?.status ?? err.status;
  if (st !== 404 && st !== 400) return false;
  const txt = JSON.stringify(err.response?.data ?? '') + ' ' + String(err.message || '');
  return /support tool use|tool compatibility|does not support (function|tool)|tools? (is|are) not supported/i.test(txt);
}

/** Modelos que recusaram tools: os turnos seguintes já vão no modo por marcador (expira em 1 h). */
const semTools = new Map<string, number>();
const SEM_TOOLS_MS = 60 * 60 * 1000;
export function marcarModeloSemTools(model: string, agora = Date.now()): void {
  semTools.set(chave(model), agora);
}
export function modeloSemTools(model: string | null | undefined, agora = Date.now()): boolean {
  const k = chave(model);
  const t = semTools.get(k);
  if (t === undefined) return false;
  if (agora - t > SEM_TOOLS_MS) {
    semTools.delete(k);
    return false;
  }
  return true;
}
export function limparModelosSemTools(): void {
  semTools.clear();
}
