/**
 * Item 4 do plano de turnos (02/11/2026): prompt montado a partir do agente.yaml.
 *
 * - system FIXO: persona + regras + ferramentas + handoff (agente.yaml) + painel (agent_config) +
 *   base de conhecimento INTEIRA (tópicos e mídias ativos, sempre por id crescente). Nada que mude
 *   por turno entra aqui, para o prefixo ser idêntico entre turnos (cache implícito do provedor).
 * - [contexto do turno]: data/hora até o minuto + cliente (nome, telefone, fidelidade, vouchers),
 *   no início da última mensagem do usuário, depois do histórico.
 * - Tópicos que citam um gatilho de excluir_gatilhos (#contatoia) só entram para o dono/atendente.
 *
 * Funções puras (sem banco), para teste: quem chama busca os dados e passa aqui.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
// js-yaml já vem no node_modules (dependência do cosmiconfig); declarado no package.json.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const yaml = require('js-yaml');

export interface AgenteRegra { id: string; texto: string }
export interface AgenteFerramenta { nome: string; comando: string; descricao: string }
export interface AgentePainelCampo { campo: string; titulo: string }
export interface AgenteYaml {
  versao: number;
  persona: { papel: string; empresa_do_painel?: boolean; empresa?: string };
  regras: AgenteRegra[];
  ferramentas: AgenteFerramenta[];
  handoff: { quando: string[]; pausar_ia: boolean };
  conhecimento: {
    fonte: string;
    painel: AgentePainelCampo[];
    incluir_tipos: string[];
    pular_vazios: boolean;
    excluir_gatilhos: string[];
  };
  contexto_do_turno: any[];
}

export interface PainelDados { business_name?: string | null; [campo: string]: any }
export interface TopicoDados {
  id: number;
  title?: string | null;
  description?: string | null;
  trigger_keywords?: string[] | string | null;
  context?: string | null;
  is_active?: boolean | number | null;
}
export interface MidiaDados {
  id: number;
  title?: string | null;
  description?: string | null;
  file_type?: string | null;
  is_active?: boolean | number | null;
  status?: string | null;
  source?: string | null;
}

export function defaultAgenteYamlPath(): string {
  // src/services -> ../../agente/agente.yaml (vale também para dist/services)
  return process.env.AGENTE_YAML_PATH || path.resolve(__dirname, '..', '..', 'agente', 'agente.yaml');
}

/** Lê e valida o agente.yaml. Erro de formato lança (quem chama cai no prompt antigo). */
export function parseAgenteYaml(text: string): AgenteYaml {
  const doc = yaml.load(text);
  const erro = (m: string) => { throw new Error(`agente.yaml inválido: ${m}`); };
  if (!doc || typeof doc !== 'object') erro('vazio');
  if (typeof doc.versao !== 'number') erro('falta versao');
  const str = (v: any) => typeof v === 'string' && v.trim() !== '';
  const boolOpc = (v: any) => v === undefined || typeof v === 'boolean';
  if (!doc.persona || !str(doc.persona.papel)) erro('falta persona.papel');
  if (!boolOpc(doc.persona.empresa_do_painel)) erro('persona.empresa_do_painel');
  if (doc.persona.empresa !== undefined && typeof doc.persona.empresa !== 'string') erro('persona.empresa');
  if (!Array.isArray(doc.regras) || doc.regras.some((r: any) => !r || !str(r.id) || !str(r.texto))) erro('regras');
  const ids = doc.regras.map((r: any) => r.id);
  if (new Set(ids).size !== ids.length) erro('ids de regra repetidos');
  if (doc.regras.length === 0) erro('regras vazias');
  if (!Array.isArray(doc.ferramentas) || doc.ferramentas.some((f: any) => !f || !str(f.nome) || !str(f.comando) || !str(f.descricao))) erro('ferramentas');
  if (!doc.handoff || !Array.isArray(doc.handoff.quando) || doc.handoff.quando.length === 0 || doc.handoff.quando.some((q: any) => !str(q))) erro('handoff');
  if (typeof doc.handoff.pausar_ia !== 'boolean') erro('handoff.pausar_ia');
  const c = doc.conhecimento;
  if (!c || c.fonte !== 'banco' || !Array.isArray(c.painel) || !Array.isArray(c.incluir_tipos)) erro('conhecimento');
  if (c.painel.some((p: any) => !p || !str(p.campo) || !str(p.titulo))) erro('conhecimento.painel');
  if (c.incluir_tipos.length === 0 || c.incluir_tipos.some((t: any) => t !== 'topic' && t !== 'media')) erro('conhecimento.incluir_tipos');
  if (!boolOpc(c.pular_vazios)) erro('conhecimento.pular_vazios');
  if (doc.contexto_do_turno !== undefined && !Array.isArray(doc.contexto_do_turno)) erro('contexto_do_turno');
  if (c.excluir_gatilhos !== undefined && (!Array.isArray(c.excluir_gatilhos) || c.excluir_gatilhos.some((g: any) => !str(g)))) erro('conhecimento.excluir_gatilhos');
  c.excluir_gatilhos = Array.isArray(c.excluir_gatilhos) ? c.excluir_gatilhos.map(String) : [];
  c.pular_vazios = c.pular_vazios !== false;
  return doc as AgenteYaml;
}

let cache: { file: string; mtimeMs: number; cfg: AgenteYaml } | null = null;

/** Carrega o agente.yaml (relê só se o arquivo mudar). */
export function loadAgenteYaml(file = defaultAgenteYamlPath()): AgenteYaml {
  const st = fs.statSync(file);
  if (cache && cache.file === file && cache.mtimeMs === st.mtimeMs) return cache.cfg;
  const cfg = parseAgenteYaml(fs.readFileSync(file, 'utf8'));
  cache = { file, mtimeMs: st.mtimeMs, cfg };
  return cfg;
}

const ativo = (v: any) => v === undefined || v === null || v === true || v === 1 || v === '1';
const limpa = (t: any) => String(t ?? '').replace(/\r\n/g, '\n').trim();

function keywords(t: TopicoDados): string[] {
  let kw: any = t.trigger_keywords;
  if (typeof kw === 'string') {
    try { kw = JSON.parse(kw); } catch { kw = kw.split(','); }
  }
  return Array.isArray(kw) ? kw.map((k) => String(k).trim()).filter(Boolean) : [];
}

function vazio(texto: string): boolean {
  return texto.replace(/[.\s\-_]/g, '').length === 0;
}

/** O tópico cita algum gatilho reservado (ex.: #contatoia)? */
export function topicoReservado(t: TopicoDados, gatilhos: string[]): boolean {
  if (gatilhos.length === 0) return false;
  const alvo = [t.title, t.description, ...keywords(t)].map((x) => String(x ?? '').toLowerCase()).join('\n');
  return gatilhos.some((g) => g && alvo.includes(g.toLowerCase()));
}

export interface SystemOpts {
  /** Dono/atendente: inclui os tópicos reservados (#contatoia). */
  incluirReservados?: boolean;
}

export interface SystemFixo {
  text: string;
  hash: string;
  topicos: number[];
  midias: number[];
  reservadosIncluidos: number[];
  vaziosPulados: number[];
}

// Mesmos rótulos do prompt antigo (rag.service formatTopicForPrompt).
const CONTEXTO_TOPICO: Record<string, string> = {
  greeting: 'Saudação', farewell: 'Despedida', absence: 'Ausência', special_date: 'Data Especial', custom: 'Personalizado',
};

const TIPO_MIDIA: Record<string, string> = { image: 'imagem', video: 'vídeo', document: 'documento', audio: 'áudio' };

/**
 * Monta o system fixo. Mesmos dados de entrada = mesmo texto (byte a byte), independentemente da
 * ordem em que o banco devolveu as linhas.
 */
export function buildSystemFixo(
  cfg: AgenteYaml,
  painel: PainelDados | null,
  topicos: TopicoDados[],
  midias: MidiaDados[],
  opts: SystemOpts = {}
): SystemFixo {
  const partes: string[] = [];
  const empresa = limpa(cfg.persona.empresa || (cfg.persona.empresa_do_painel !== false ? painel?.business_name : '') || '');
  partes.push(`Você é ${cfg.persona.papel}${empresa ? ` da empresa ${empresa}` : ''}. (agente.yaml versão ${cfg.versao})`);

  partes.push(['# REGRAS', ...cfg.regras.map((r) => `${r.id}. ${limpa(r.texto)}`)].join('\n'));

  partes.push([
    '# COMANDOS (ferramentas)',
    ...cfg.ferramentas.map((f) => `- ${f.nome}: ${limpa(f.comando)}\n  ${limpa(f.descricao)}`),
  ].join('\n'));

  partes.push([
    '# QUANDO CHAMAR UM ATENDENTE',
    ...cfg.handoff.quando.map((q) => `- ${limpa(q)}`),
  ].join('\n'));

  for (const campo of cfg.conhecimento.painel) {
    const texto = limpa(painel?.[campo.campo]);
    if (texto) partes.push(`# ${campo.titulo}\n${texto}`);
  }

  const tipos = new Set(cfg.conhecimento.incluir_tipos);
  const gatilhos = cfg.conhecimento.excluir_gatilhos;
  const usados: number[] = [];
  const reservadosIncluidos: number[] = [];
  const vaziosPulados: number[] = [];
  if (tipos.has('topic')) {
    const linhas: string[] = [];
    for (const t of [...topicos].filter((x) => ativo(x.is_active)).sort((a, b) => a.id - b.id)) {
      const desc = limpa(t.description);
      if (cfg.conhecimento.pular_vazios && vazio(desc)) { vaziosPulados.push(t.id); continue; }
      if (topicoReservado(t, gatilhos)) {
        if (!opts.incluirReservados) continue;
        reservadosIncluidos.push(t.id);
      }
      const kw = keywords(t);
      let bloco = `## Tópico ${t.id}: ${limpa(t.title)}`;
      bloco += `\nContexto: ${CONTEXTO_TOPICO[t.context || ''] || limpa(t.context) || 'Personalizado'}`;
      if (kw.length) bloco += `\nSe o cliente disser: ${kw.map((k) => `"${k}"`).join(', ')} ou sinônimos.`;
      bloco += `\n${desc}`;
      linhas.push(bloco);
      usados.push(t.id);
    }
    if (linhas.length) partes.push(['# BASE DE CONHECIMENTO (tópicos)', ...linhas].join('\n\n'));
  }

  const midiasUsadas: number[] = [];
  if (tipos.has('media')) {
    const linhas: string[] = [];
    for (const m of [...midias]
      .filter((x) => ativo(x.is_active) && (!x.status || x.status === 'completed') && (!x.source || x.source === 'outgoing'))
      .sort((a, b) => a.id - b.id)) {
      const tipo = TIPO_MIDIA[m.file_type || ''] || m.file_type || 'mídia';
      linhas.push(`- ID ${m.id} (${tipo}): ${limpa(m.title)}\n  Quando usar: ${limpa(m.description) || '-'}`);
      midiasUsadas.push(m.id);
    }
    if (linhas.length) {
      partes.push(['# MÍDIAS DISPONÍVEIS (envie com [ENVIAR_MIDIA:ID])', ...linhas].join('\n'));
    }
  }

  const text = partes.join('\n\n');
  return {
    text,
    hash: crypto.createHash('sha256').update(text).digest('hex').slice(0, 12),
    topicos: usados,
    midias: midiasUsadas,
    reservadosIncluidos,
    vaziosPulados,
  };
}

const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

/** "segunda-feira, 02/11/2026 05:40" no fuso de Brasília (até o minuto, sem segundos). */
export function dataHoraMinuto(now: Date = new Date(), timeZone = 'America/Sao_Paulo'): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    weekday: 'short', hour12: false,
  }).formatToParts(now);
  const p = (t: string) => parts.find((x) => x.type === t)?.value || '';
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p('weekday'));
  const hora = p('hour') === '24' ? '00' : p('hour');
  return `${DIAS[wd] ?? ''}, ${p('day')}/${p('month')}/${p('year')} ${hora}:${p('minute')}`;
}

export interface ContextoTurno {
  agora: string;
  nome?: string | null;
  telefone?: string | null;
  /** Linhas já formatadas (fidelidade, vouchers), mesmas do prompt antigo. */
  extras?: string;
}

export function buildContextoTurno(c: ContextoTurno): string {
  const linhas = ['[contexto do turno]', `agora: ${c.agora} (horário de Brasília)`];
  const nome = limpa(c.nome);
  const tel = limpa(c.telefone);
  if (nome || tel) linhas.push(`cliente: ${nome ? `${nome}${tel ? ` (${tel})` : ''}` : tel}`);
  else linhas.push('cliente: desconhecido');
  const extras = limpa(c.extras);
  if (extras) linhas.push(extras);
  linhas.push('[fim do contexto do turno]');
  return linhas.join('\n');
}

/** Texto da última mensagem do usuário: contexto do turno + mensagem atual do cliente. */
export function mensagemFinal(contexto: string, mensagemCliente: string): string {
  return `${contexto}\n\n${mensagemCliente}`;
}
