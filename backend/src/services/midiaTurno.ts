/**
 * Item 5 do plano (02/11/2026): o modelo vê a foto/vídeo do turno + descrição estruturada.
 *
 * - Turno: as mídias do lote atual (fotos e vídeos do cliente) vão como partes image_url / video_url
 *   (data URL base64) na última mensagem do usuário, depois do texto. Vídeo acima de
 *   MIDIA_VIDEO_MAX_MB, ou que estoure o corpo máximo da requisição, vira "[vídeo recebido]" e o
 *   atendente é chamado. Áudio continua com a transcrição (não passa por aqui).
 * - Chegada: cada foto/vídeo ganha uma descrição curta em JSON (json_schema estrito), gravada na
 *   tabela media_descricoes (campo derivado; a legenda do cliente fica intacta em messages.content).
 * - Histórico: mídia antiga vira 1 linha ("[foto do cliente: … | código de erro: E21 | máquina: 3]").
 *
 * Só é usado com AGENTE_MULTIMODAL ligado (ver agentFlags). Tudo aqui falha "fechado": erro de
 * leitura, banco ou API só tira a mídia do turno/histórico, nunca derruba o turno.
 */
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import pool from '../config/database';
import logger from '../utils/logger';
import { envFloat, envInt, multimodalDataCollection, multimodalModel } from '../utils/agentFlags';
import { capacidadesDe, reasoningPara } from './modelosOpenRouter';

export type ParteConteudo =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'video_url'; video_url: { url: string } };

/** Mídia de uma mensagem do cliente (messages.media_id -> medias). */
export interface MidiaArquivo {
  messageDbId: number;
  mediaId: number;
  filePath: string;
  fileType: string; // image | video | audio | document
  fileSize: number;
}

export interface DescricaoMidia {
  tipo: string;
  descricao: string;
  texto_visivel: string;
  codigo_erro: string;
  numero_maquina: string;
}

// Formatos que o Gemini aceita (GIF e figurinha animada ficam de fora).
const MIME_IMAGEM: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const MIME_VIDEO: Record<string, string> = { '.mp4': 'video/mp4', '.3gp': 'video/3gpp', '.webm': 'video/webm', '.mov': 'video/quicktime' };

export function mimeDaMidia(arq: Pick<MidiaArquivo, 'filePath' | 'fileType'>): string | null {
  const ext = path.extname(arq.filePath || '').toLowerCase();
  if (arq.fileType === 'image') return MIME_IMAGEM[ext] || null;
  if (arq.fileType === 'video') return MIME_VIDEO[ext] || null;
  return null;
}

/** Tamanho do data URL em base64 (bytes no corpo JSON). */
export function tamanhoDataUrl(bytes: number, mime: string): number {
  return `data:${mime};base64,`.length + Math.ceil(bytes / 3) * 4;
}

export interface LimitesMidia {
  imagemMaxBytes: number;
  videoMaxBytes: number;
  maxPorTurno: number;
  /** orçamento para os data URLs no corpo da requisição (já descontado o texto) */
  orcamentoBytes: number;
}

// MB decimal (como o WhatsApp e o limite do Google, em bytes): 14 MB = 14.000.000 bytes -> data URL
// de 18,67 MB, que cabe no corpo de 19.000.000 (o vídeo de 14,16 MB passou no teste de 02/11).
const MB = 1_000_000;

/**
 * Limites do .env. O Google AI Studio recusa corpo acima de 20.000.000 bytes (teste de 02/11: 413
 * com vídeo de 17 MB, que vira 23,5 MB em base64), por isso o vídeo padrão é 14 MB e há orçamento total.
 */
export function limitesDoEnv(bytesTexto: number): LimitesMidia {
  const corpoMax = envInt('MIDIA_MAX_REQUEST_BYTES', 19_000_000, 1_000_000);
  return {
    imagemMaxBytes: Math.round(envFloat('MIDIA_IMAGEM_MAX_MB', 7) * MB),
    videoMaxBytes: Math.round(envFloat('MIDIA_VIDEO_MAX_MB', 14) * MB),
    maxPorTurno: envInt('MIDIA_MAX_POR_TURNO', 4, 1),
    orcamentoBytes: Math.max(0, corpoMax - bytesTexto - 50_000),
  };
}

export interface PlanoMidias {
  partes: ParteConteudo[];
  anexadas: Array<{ mediaId: number; tipo: 'foto' | 'video'; bytes: number }>;
  /** vídeos grandes demais (tamanho/corpo máximo): viram "[vídeo recebido]" + atendente */
  videosGrandes: Array<{ mediaId: number; bytes: number }>;
  /** vídeos que o modelo não consegue ver por outro motivo (formato, leitura, limite por turno): + atendente */
  videosNaoVistos: Array<{ mediaId: number; motivo: string }>;
  /** fotos que não vão (formato, tamanho, limite por turno, erro de leitura) */
  fotosNaoVistas: Array<{ mediaId: number; motivo: string }>;
  /** etapa 6: mídias que o modelo principal não entende, descritas por outro modelo (entram como texto) */
  descritas?: Array<{ mediaId: number; tipo: 'foto' | 'video'; descricao: DescricaoMidia; modelo: string }>;
  /** etapa 6: nenhum modelo do painel aceita esta mídia: atendente */
  semModelo?: Array<{ mediaId: number; tipo: 'foto' | 'video' }>;
}

/**
 * Decide o que vai ao modelo (função pura; `ler` é injetado para teste). Ordem do lote preservada.
 */
export function planejarMidias(arquivos: MidiaArquivo[], limites: LimitesMidia, ler: (p: string) => Buffer): PlanoMidias {
  const plano: PlanoMidias = { partes: [], anexadas: [], videosGrandes: [], videosNaoVistos: [], fotosNaoVistas: [] };
  let orcamento = limites.orcamentoBytes;
  for (const arq of arquivos) {
    if (arq.fileType !== 'image' && arq.fileType !== 'video') continue;
    const video = arq.fileType === 'video';
    const naoVai = (motivo: string) => {
      if (video && (motivo === 'tamanho' || motivo === 'corpo_maximo')) plano.videosGrandes.push({ mediaId: arq.mediaId, bytes: arq.fileSize });
      else if (video) plano.videosNaoVistos.push({ mediaId: arq.mediaId, motivo });
      else plano.fotosNaoVistas.push({ mediaId: arq.mediaId, motivo });
    };
    const mime = mimeDaMidia(arq);
    if (!mime) { naoVai('formato'); continue; }
    if (plano.anexadas.length >= limites.maxPorTurno) { naoVai('limite_por_turno'); continue; }
    const max = video ? limites.videoMaxBytes : limites.imagemMaxBytes;
    if (!(arq.fileSize > 0) || arq.fileSize > max) { naoVai('tamanho'); continue; }
    const custo = tamanhoDataUrl(arq.fileSize, mime);
    if (custo > orcamento) { naoVai('corpo_maximo'); continue; }
    let buf: Buffer;
    try {
      if (!caminhoPermitido(arq.filePath)) throw new Error('fora de uploads/incoming');
      buf = ler(arq.filePath);
    } catch {
      naoVai('leitura');
      continue;
    }
    if (buf.length > max) { naoVai('tamanho'); continue; }
    const url = `data:${mime};base64,${buf.toString('base64')}`;
    if (url.length > orcamento) { naoVai('corpo_maximo'); continue; }
    orcamento -= url.length;
    plano.partes.push(video ? { type: 'video_url', video_url: { url } } : { type: 'image_url', image_url: { url } });
    plano.anexadas.push({ mediaId: arq.mediaId, tipo: video ? 'video' : 'foto', bytes: buf.length });
  }
  return plano;
}

/** Bloco de texto que explica ao modelo as mídias do turno (vai depois da mensagem do cliente). */
export function blocoMidiasDoTurno(plano: PlanoMidias): string {
  const linhas: string[] = [];
  const fotos = plano.anexadas.filter((a) => a.tipo === 'foto').length;
  const videos = plano.anexadas.filter((a) => a.tipo === 'video').length;
  if (fotos || videos) {
    const partes = [fotos ? `${fotos} foto(s)` : '', videos ? `${videos} vídeo(s)` : ''].filter(Boolean).join(' e ');
    linhas.push(`[o cliente enviou ${partes}, anexo(s) abaixo: olhe com atenção (número da máquina, código de erro, texto do painel) antes de responder; não invente o que não estiver visível]`);
  }
  for (const v of plano.videosGrandes) {
    linhas.push(`[vídeo recebido] (${(v.bytes / MB).toFixed(1)} MB, grande demais para você ver: diga ao cliente que um atendente vai analisar o vídeo)`);
  }
  if (plano.videosNaoVistos.length) {
    linhas.push(`[vídeo recebido] (${plano.videosNaoVistos.length} vídeo(s) que você não consegue abrir: diga ao cliente que um atendente vai ver o vídeo)`);
  }
  if (plano.fotosNaoVistas.length) {
    linhas.push(`[foto recebida] (${plano.fotosNaoVistas.length} foto(s) que você não consegue ver: se precisar, peça ao cliente para descrever)`);
  }
  if (plano.descritas?.length) {
    linhas.push('[o cliente enviou mídia que você não consegue abrir; abaixo a descrição feita por outro modelo. Use apenas o que estiver descrito; não invente o que não estiver aqui]');
    for (const d of plano.descritas) linhas.push(linhaMidia(d.tipo === 'video' ? 'video' : 'image', d.descricao));
  }
  if (plano.semModelo?.length) {
    const n = plano.semModelo.length;
    linhas.push(`[mídia recebida] (${n} foto(s)/vídeo(s) que nenhum modelo configurado consegue ver: diga ao cliente que um atendente vai analisar)`);
  }
  return linhas.join('\n');
}

/** Comando de alerta para vídeo grande (anexado à resposta se o modelo não chamou o atendente). */
export function alertaVideoGrande(plano: PlanoMidias): string | null {
  const motivos: string[] = [];
  if (plano.videosGrandes.length) {
    motivos.push(`vídeo grande demais para a IA analisar (${plano.videosGrandes.map((v) => `${(v.bytes / MB).toFixed(1)} MB`).join(', ')})`);
  }
  if (plano.videosNaoVistos.length) motivos.push(`${plano.videosNaoVistos.length} vídeo(s) que a IA não conseguiu abrir`);
  if (plano.semModelo?.length) motivos.push(`${plano.semModelo.length} foto(s)/vídeo(s) que nenhum modelo configurado no painel consegue ver`);
  if (motivos.length === 0) return null;
  return `[ALERTAR_ATENDENTE: Cliente enviou ${motivos.join(' e ')}. Resumo: veja o vídeo na conversa.]`;
}

/**
 * Só arquivos recebidos de clientes (uploads/incoming) vão ao provedor. MIDIA_DIR_INCOMING troca a pasta
 * (testes). No Windows a comparação ignora maiúsculas.
 */
export function caminhoPermitido(filePath: string): boolean {
  if (!filePath) return false;
  const base = path.resolve(process.env.MIDIA_DIR_INCOMING || path.join(process.cwd(), 'uploads', 'incoming'));
  const alvo = path.resolve(filePath);
  const norm = (p: string) => (process.platform === 'win32' ? p.toLowerCase() : p);
  return norm(alvo).startsWith(norm(base) + path.sep);
}

// ------------------------------------------------------------------ banco

function linhasDe(r: any): any[] {
  if (!r) return [];
  if (Array.isArray(r)) return Array.isArray(r[0]) ? r[0] : Array.from(r);
  return [];
}

/** Fotos/vídeos/documentos das mensagens do lote atual (só do cliente), na ordem das mensagens. */
export async function carregarMidiasDoLote(conversationId: number, batchDbIds: number[] | undefined): Promise<MidiaArquivo[]> {
  const ids = (batchDbIds || []).filter((v) => Number.isInteger(v) && v > 0);
  if (ids.length === 0 || !(conversationId > 0)) return [];
  const conn = await pool.getConnection();
  try {
    const r = await conn.query(
      `SELECT m.id AS message_db_id, md.id AS media_id, md.file_path, md.file_type, md.file_size
         FROM messages m JOIN medias md ON md.id = m.media_id
        WHERE m.id IN (${ids.map(() => '?').join(',')}) AND m.direction = 'incoming'
          AND m.conversation_id = ? AND md.source = 'incoming'`,
      [...ids, conversationId]
    );
    // Ordem do lote (hora de chegada do agendador), não a do id: o download pode inverter os ids.
    const ordem = new Map(ids.map((id, i) => [id, i] as [number, number]));
    return linhasDe(r).sort((a: any, b: any) => (ordem.get(Number(a.message_db_id)) ?? 0) - (ordem.get(Number(b.message_db_id)) ?? 0)).map((x: any) => ({
      messageDbId: Number(x.message_db_id),
      mediaId: Number(x.media_id),
      filePath: String(x.file_path || ''),
      fileType: String(x.file_type || ''),
      fileSize: Number(x.file_size || 0),
    }));
  } finally {
    conn.release();
  }
}

/** Tabela nova (aditiva). Criada à mão com backup antes; o código só lê/grava e tolera ausência. */
export const SQL_CRIAR_MEDIA_DESCRICOES = `CREATE TABLE IF NOT EXISTS media_descricoes (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  message_id INT NOT NULL,
  media_id INT NULL,
  tipo VARCHAR(20) NULL,
  descricao VARCHAR(500) NULL,
  texto_visivel VARCHAR(500) NULL,
  codigo_erro VARCHAR(64) NULL,
  numero_maquina VARCHAR(32) NULL,
  modelo VARCHAR(100) NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_media_descricoes_message (message_id),
  KEY idx_media_descricoes_media (media_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

export interface InfoMidiaHistorico {
  fileType: string;
  descricao?: DescricaoMidia;
}

let avisouSemTabela = false;

/** Tipo e descrição das mídias das mensagens do histórico (por messages.id). */
export async function infoMidiasHistorico(messageIds: number[]): Promise<Map<number, InfoMidiaHistorico>> {
  const out = new Map<number, InfoMidiaHistorico>();
  const ids = messageIds.filter((v) => Number.isInteger(v) && v > 0);
  if (ids.length === 0) return out;
  const marcas = ids.map(() => '?').join(',');
  const conn = await pool.getConnection();
  try {
    let rows: any[];
    try {
      rows = linhasDe(await conn.query(
        `SELECT m.id AS message_db_id, md.file_type, d.tipo, d.descricao, d.texto_visivel, d.codigo_erro, d.numero_maquina
           FROM messages m JOIN medias md ON md.id = m.media_id
           LEFT JOIN media_descricoes d ON d.message_id = m.id
          WHERE m.id IN (${marcas})`, ids));
    } catch (err: any) {
      if (!avisouSemTabela) logger.warn(`[midia] descrições indisponíveis (tabela media_descricoes?): ${err?.message || err}`);
      avisouSemTabela = true;
      rows = linhasDe(await conn.query(
        `SELECT m.id AS message_db_id, md.file_type FROM messages m JOIN medias md ON md.id = m.media_id WHERE m.id IN (${marcas})`, ids));
    }
    for (const x of rows) {
      const info: InfoMidiaHistorico = { fileType: String(x.file_type || '') };
      if (x.descricao !== undefined && x.descricao !== null) {
        info.descricao = {
          tipo: String(x.tipo || ''), descricao: String(x.descricao || ''), texto_visivel: String(x.texto_visivel || ''),
          codigo_erro: String(x.codigo_erro || ''), numero_maquina: String(x.numero_maquina || ''),
        };
      }
      out.set(Number(x.message_db_id), info);
    }
    return out;
  } finally {
    conn.release();
  }
}

const umaLinha = (t: any, max: number) => String(t ?? '').replace(/[\r\n\t]+/g, ' ').replace(/[\[\]]/g, '').replace(/\s{2,}/g, ' ').trim().slice(0, max);

/** 1 linha para a mídia antiga no histórico. */
export function linhaMidia(fileType: string, d?: DescricaoMidia | null): string {
  const rotulo = fileType === 'video' ? 'vídeo' : fileType === 'image' ? 'foto' : fileType === 'document' ? 'documento' : 'mídia';
  if (!d || !umaLinha(d.descricao, 10)) {
    return fileType === 'video' ? '[vídeo recebido]' : fileType === 'image' ? '[foto recebida]' : `[${rotulo} recebido]`;
  }
  const partes = [umaLinha(d.descricao, 160)];
  if (umaLinha(d.codigo_erro, 40)) partes.push(`código de erro: ${umaLinha(d.codigo_erro, 40)}`);
  if (umaLinha(d.numero_maquina, 20)) partes.push(`máquina: ${umaLinha(d.numero_maquina, 20)}`);
  const tv = umaLinha(d.texto_visivel, 80);
  if (tv && tv.toLowerCase() !== umaLinha(d.codigo_erro, 40).toLowerCase()) partes.push(`texto: ${tv}`);
  return `[${rotulo} do cliente: ${partes.join(' | ')}]`;
}

/** Conteúdo da mensagem do histórico com mídia: 1 linha da mídia + legenda do cliente (se houver). */
export function conteudoComMidia(content: string | null | undefined, info: InfoMidiaHistorico): string {
  // Áudio (e tipos desconhecidos) ficam como estão: o conteúdo já é a transcrição.
  if (info.fileType !== 'image' && info.fileType !== 'video' && info.fileType !== 'document') return String(content ?? '');
  const legenda = String(content || '').trim();
  const semLegenda = !legenda || /^\[(media|mídia|image|video|document)\]$/i.test(legenda);
  const linha = linhaMidia(info.fileType, info.descricao);
  return semLegenda ? linha : `${linha}\n${legenda}`;
}

// ------------------------------------------------------------------ descrição na chegada

const ESQUEMA_DESCRICAO = {
  type: 'object',
  additionalProperties: false,
  required: ['tipo', 'descricao', 'texto_visivel', 'codigo_erro', 'numero_maquina'],
  properties: {
    tipo: { type: 'string', enum: ['painel', 'maquina', 'roupa', 'comprovante', 'documento', 'pessoa', 'outro'] },
    descricao: { type: 'string', description: 'uma frase curta em português' },
    texto_visivel: { type: 'string', description: 'texto legível na mídia, ou vazio' },
    codigo_erro: { type: 'string', description: 'código de erro do painel (ex.: E21), ou vazio' },
    numero_maquina: { type: 'string', description: 'número da máquina visível, ou vazio' },
  },
};

const PROMPT_DESCRICAO = 'Descreva a mídia enviada por um cliente de lavanderia self-service, em português. '
  + 'Se for painel/máquina, leia o número da máquina e o código de erro exatamente como aparecem. '
  + 'Campos sem informação visível ficam vazios (""). Não invente.';

export function normalizarDescricao(obj: any): DescricaoMidia | null {
  if (!obj || typeof obj !== 'object') return null;
  const d: DescricaoMidia = {
    tipo: umaLinha(obj.tipo, 20) || 'outro',
    descricao: umaLinha(obj.descricao, 500),
    texto_visivel: umaLinha(obj.texto_visivel, 500),
    codigo_erro: umaLinha(obj.codigo_erro, 64),
    numero_maquina: umaLinha(obj.numero_maquina, 32),
  };
  return d.descricao ? d : null;
}

/**
 * Chama o modelo multimodal com json_schema estrito. Lança em erro (quem chama trata).
 * Etapa 6: `modeloEscolhido` (vindo do painel) troca o modelo; o raciocínio e o json_schema seguem o
 * catálogo do OpenRouter (modelo sem response_format: o JSON é lido do texto).
 */
export async function descreverArquivo(arq: MidiaArquivo, modeloEscolhido?: string): Promise<{ descricao: DescricaoMidia; modelo: string; custo?: number; ms: number }> {
  const mime = mimeDaMidia(arq);
  if (!mime) throw new Error('formato não suportado');
  const limites = limitesDoEnv(10_000);
  const max = arq.fileType === 'video' ? limites.videoMaxBytes : limites.imagemMaxBytes;
  if (!caminhoPermitido(arq.filePath)) throw new Error('arquivo fora de uploads/incoming');
  const tam = fs.statSync(arq.filePath).size;
  if (tam > max || tamanhoDataUrl(tam, mime) > limites.orcamentoBytes) throw new Error('grande demais');
  const buf = fs.readFileSync(arq.filePath);
  if (buf.length > max) throw new Error('grande demais');
  const url = `data:${mime};base64,${buf.toString('base64')}`;
  const parte: ParteConteudo = arq.fileType === 'video' ? { type: 'video_url', video_url: { url } } : { type: 'image_url', image_url: { url } };
  const painel = (modeloEscolhido || '').trim();
  const modelo = painel || (process.env.MIDIA_DESCRICAO_MODELO || '').trim() || multimodalModel();
  if (!modelo) throw new Error('nenhum modelo de foto/vídeo configurado');
  const cap = painel ? capacidadesDe(painel) : null;
  const semJson = !!cap && cap.conhecido && cap.respostaJson === false;
  const body: Record<string, any> = {
    model: modelo,
    messages: [{ role: 'user', content: [{ type: 'text', text: semJson ? `${PROMPT_DESCRICAO} Responda só com um objeto JSON com os campos tipo, descricao, texto_visivel, codigo_erro, numero_maquina.` : PROMPT_DESCRICAO }, parte] }],
    max_tokens: 400,
    temperature: 0,
    reasoning: painel ? reasoningPara(cap) : { effort: 'none', exclude: true },
    provider: { data_collection: multimodalDataCollection() },
  };
  if (!semJson) body.response_format = { type: 'json_schema', json_schema: { name: 'descricao_midia', strict: true, schema: ESQUEMA_DESCRICAO } };
  // Modelo com raciocínio obrigatório gasta tokens pensando: folga para o JSON caber.
  if (painel && body.reasoning?.effort !== 'none') body.max_tokens = 2000;
  const t0 = Date.now();
  const res = await axios.post(`${(process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '')}/chat/completions`, body, {
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY || ''}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://agentezap.local', 'X-Title': 'AgenteZap' },
    timeout: envInt('MIDIA_DESCRICAO_TIMEOUT_MS', 45000, 1000),
    maxBodyLength: Infinity,
    maxContentLength: 5 * MB,
  });
  const txt = res.data?.choices?.[0]?.message?.content;
  let obj: any = null;
  try {
    obj = JSON.parse(String(txt || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    // Sem json_schema o modelo pode cercar o JSON de texto: pega o primeiro objeto.
    const m = /\{[\s\S]*\}/.exec(String(txt || ''));
    try { obj = m ? JSON.parse(m[0]) : null; } catch { obj = null; }
  }
  const descricao = normalizarDescricao(obj);
  if (!descricao) throw new Error('descrição vazia ou inválida');
  return { descricao, modelo: res.data?.model || modelo, custo: res.data?.usage?.cost, ms: Date.now() - t0 };
}

export async function gravarDescricao(messageDbId: number, mediaId: number | null, d: DescricaoMidia, modelo: string): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.query(
      `INSERT INTO media_descricoes (message_id, media_id, tipo, descricao, texto_visivel, codigo_erro, numero_maquina, modelo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE tipo = VALUES(tipo), descricao = VALUES(descricao), texto_visivel = VALUES(texto_visivel),
         codigo_erro = VALUES(codigo_erro), numero_maquina = VALUES(numero_maquina), modelo = VALUES(modelo)`,
      [messageDbId, mediaId, d.tipo, d.descricao, d.texto_visivel, d.codigo_erro, d.numero_maquina, modelo.slice(0, 100)]
    );
  } finally {
    conn.release();
  }
}

/**
 * Na chegada (durante o debounce): descreve e grava. Nunca lança; uma nova tentativa em 429/5xx.
 * Sem texto do cliente nem telefone no log.
 */
/** Esperas entre tentativas da descrição (429 do Google é passageiro; a descrição não tem pressa). */
export const ESPERAS_DESCRICAO_MS = [3000, 10000];

/** Repete fn em 429/5xx/sem resposta, esperando esperas[i] antes da tentativa i+2. Outros erros sobem na hora. */
export async function comRetentativa<T>(fn: () => Promise<T>, esperas: number[], dormir: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err: any) {
      const st = err?.response?.status;
      const passageiro = st === 429 || st >= 500 || (!st && err?.code === 'ECONNRESET');
      if (!passageiro || i >= esperas.length) throw err;
      await dormir(esperas[i]);
    }
  }
}

/** Descrições em andamento (por messages.id): o turno espera a da chegada em vez de pagar duas vezes. */
const descricoesEmAndamento = new Map<number, Promise<DescricaoMidia | null>>();

export function descricaoEmAndamento(messageDbId: number): Promise<DescricaoMidia | null> | undefined {
  return descricoesEmAndamento.get(messageDbId);
}

/**
 * opts.modelo (etapa 6): modelo de foto/vídeo do painel; sem ele, o da etapa 4 (MIDIA_DESCRICAO_MODELO
 * ou o do .env). opts.modeloPara: escolhe o modelo pelo tipo da mídia (null = ninguém aceita: não descreve).
 */
export function descreverMidiaRecebida(
  messageDbId: number,
  mediaId: number,
  opts: { modelo?: string; modeloPara?: (tipo: 'image' | 'video') => Promise<string | null> } = {}
): Promise<DescricaoMidia | null> {
  const atual = descricoesEmAndamento.get(messageDbId);
  if (atual) return atual;
  const p = descreverMidiaRecebidaAgora(messageDbId, mediaId, opts).finally(() => descricoesEmAndamento.delete(messageDbId));
  descricoesEmAndamento.set(messageDbId, p);
  return p;
}

async function descreverMidiaRecebidaAgora(
  messageDbId: number,
  mediaId: number,
  opts: { modelo?: string; modeloPara?: (tipo: 'image' | 'video') => Promise<string | null> }
): Promise<DescricaoMidia | null> {
  try {
    const conn = await pool.getConnection();
    let arq: MidiaArquivo | null = null;
    try {
      const r = linhasDe(await conn.query("SELECT id, file_path, file_type, file_size FROM medias WHERE id = ? AND source = 'incoming'", [mediaId]));
      if (r[0]) arq = { messageDbId, mediaId, filePath: String(r[0].file_path || ''), fileType: String(r[0].file_type || ''), fileSize: Number(r[0].file_size || 0) };
    } finally {
      conn.release();
    }
    if (!arq || !mimeDaMidia(arq)) return null;
    const alvo = arq;
    let modelo = opts.modelo;
    if (!modelo && opts.modeloPara) {
      modelo = (await opts.modeloPara(alvo.fileType === 'video' ? 'video' : 'image')) || undefined;
      if (!modelo) {
        logger.info(`[midia] mensagem ${messageDbId}: nenhum modelo do painel aceita ${alvo.fileType}; sem descrição`);
        return null;
      }
    }
    const out = await comRetentativa(() => descreverArquivo(alvo, modelo), ESPERAS_DESCRICAO_MS);
    await gravarDescricao(messageDbId, mediaId, out.descricao, out.modelo);
    logger.info(`[midia] descrição gravada: mensagem ${messageDbId}, mídia ${mediaId}, tipo ${out.descricao.tipo}, ${out.ms} ms, US$ ${out.custo ?? '?'}`);
    return out.descricao;
  } catch (err: any) {
    const st = err?.response?.status;
    logger.warn(`[midia] sem descrição para a mensagem ${messageDbId} (mídia ${mediaId}): ${st ? `HTTP ${st} ` : ''}${err?.message || err}`);
    return null;
  }
}

export { semBase64 } from '../utils/semBase64';

// ------------------------------------------------------------------ montagem do turno (puras)

/** Última mensagem do usuário: só texto (sem mídia anexada) ou [texto, ...partes]. */
export function conteudoDoTurno(textoFinal: string, plano: PlanoMidias): string | ParteConteudo[] {
  const bloco = blocoMidiasDoTurno(plano);
  const texto = bloco ? `${textoFinal}\n\n${bloco}` : textoFinal;
  if (plano.partes.length === 0) return texto;
  return [{ type: 'text', text: texto }, ...plano.partes];
}

/** Mensagens do histórico com mídia viram "1 linha da mídia (+ legenda)". As demais ficam iguais. */
export function aplicarMidiasNoHistorico<T extends { id?: number; content?: string | null; media_id?: number | null }>(
  rows: T[],
  infos: Map<number, InfoMidiaHistorico>
): T[] {
  return rows.map((r) => {
    const info = r.id !== undefined ? infos.get(Number(r.id)) : undefined;
    return info ? { ...r, content: conteudoComMidia(r.content, info) } : r;
  });
}

/** Vídeo grande: se o modelo não chamou o atendente, o alerta é acrescentado à resposta. */
export function garantirAlertaVideo(resposta: string, plano: PlanoMidias): string {
  const alerta = alertaVideoGrande(plano);
  if (!alerta || /\[ALERTAR_ATENDENTE:/i.test(resposta)) return resposta;
  return `${resposta.trim()}\n${alerta}`;
}

/** Resumo para o turnos.jsonl (sem nome de arquivo nem conteúdo). */
export function metaMultimodal(plano: PlanoMidias, modelo: string): Record<string, any> {
  return {
    modelo,
    fotos: plano.anexadas.filter((a) => a.tipo === 'foto').length,
    videos: plano.anexadas.filter((a) => a.tipo === 'video').length,
    bytes: plano.anexadas.reduce((s, a) => s + a.bytes, 0),
    videos_grandes: plano.videosGrandes.length,
    videos_nao_vistos: plano.videosNaoVistos.length,
    fotos_nao_vistas: plano.fotosNaoVistas.length,
    ...(plano.descritas ? { descritas: plano.descritas.length, visao: [...new Set(plano.descritas.map((d) => d.modelo))].join(',') } : {}),
    ...(plano.semModelo ? { sem_modelo: plano.semModelo.length } : {}),
  };
}

// ------------------------------------------------------------------ etapa 6: modelo do painel

/**
 * Plano do turno com o modelo do painel (AGENTE_MODELO_PAINEL). Para cada foto/vídeo do lote:
 * - o modelo principal aceita o tipo (catálogo) -> vai inline, como na etapa 4 (planejarMidias);
 * - não aceita -> `descritor(tipo)` escolhe o modelo de foto/vídeo; a descrição entra como texto;
 * - ninguém aceita -> semModelo (atendente). Vídeo grande demais continua indo ao atendente.
 * Falha na descrição: vídeo -> videosNaoVistos (atendente); foto -> fotosNaoVistas.
 * `descrever` é injetado (testes); na produção é descricaoParaTurno.
 */
export async function planejarTurnoPainel(
  arquivos: MidiaArquivo[],
  limites: LimitesMidia,
  ler: (p: string) => Buffer,
  principalAceita: (tipo: 'image' | 'video') => boolean,
  descritor: (tipo: 'image' | 'video') => Promise<string | null> | string | null,
  descrever: (arq: MidiaArquivo, modelo: string) => Promise<DescricaoMidia | null>
): Promise<PlanoMidias> {
  const inline: MidiaArquivo[] = [];
  const outros: MidiaArquivo[] = [];
  for (const a of arquivos) {
    if (a.fileType !== 'image' && a.fileType !== 'video') continue;
    (principalAceita(a.fileType) ? inline : outros).push(a);
  }
  const plano = planejarMidias(inline, limites, ler);
  plano.descritas = [];
  plano.semModelo = [];
  let usados = plano.anexadas.length;
  for (const arq of outros) {
    const video = arq.fileType === 'video';
    const tipo: 'image' | 'video' = video ? 'video' : 'image';
    const naoVista = (motivo: string) => (video ? plano.videosNaoVistos : plano.fotosNaoVistas).push({ mediaId: arq.mediaId, motivo });
    if (!mimeDaMidia(arq)) { naoVista('formato'); continue; }
    const max = video ? limites.videoMaxBytes : limites.imagemMaxBytes;
    if (video && arq.fileSize > max) { plano.videosGrandes.push({ mediaId: arq.mediaId, bytes: arq.fileSize }); continue; }
    if (!video && arq.fileSize > max) { naoVista('tamanho'); continue; }
    if (usados >= limites.maxPorTurno) { naoVista('limite_por_turno'); continue; }
    const modelo = await descritor(tipo);
    if (!modelo) { plano.semModelo.push({ mediaId: arq.mediaId, tipo: video ? 'video' : 'foto' }); continue; }
    let d: DescricaoMidia | null = null;
    try { d = await descrever(arq, modelo); } catch { d = null; }
    if (!d) { naoVista('descricao'); continue; }
    usados++;
    plano.descritas.push({ mediaId: arq.mediaId, tipo: video ? 'video' : 'foto', descricao: d, modelo });
  }
  return plano;
}

function comPrazo<T>(p: Promise<T>, ms: number, valor: T): Promise<T> {
  let t: NodeJS.Timeout | undefined;
  const prazo = new Promise<T>((r) => { t = setTimeout(() => r(valor), ms); });
  return Promise.race([p, prazo]).finally(() => { if (t) clearTimeout(t); });
}

/**
 * Descrição para o turno: a da chegada (em andamento ou gravada) ou uma nova, agora, com o modelo
 * escolhido. Prazo: AGENTE_VISAO_TIMEOUT_MS (padrão 25 s). Nunca lança.
 */
export async function descricaoParaTurno(arq: MidiaArquivo, modelo: string): Promise<DescricaoMidia | null> {
  const prazo = envInt('AGENTE_VISAO_TIMEOUT_MS', 25000, 1000);
  try {
    const andamento = descricaoEmAndamento(arq.messageDbId);
    if (andamento) {
      const d = await comPrazo(andamento, prazo, null);
      if (d) return d;
    }
    const gravada = (await infoMidiasHistorico([arq.messageDbId])).get(arq.messageDbId)?.descricao;
    if (gravada && gravada.descricao) return gravada;
    return await comPrazo(descreverMidiaRecebida(arq.messageDbId, arq.mediaId, { modelo }), prazo, null);
  } catch (err: any) {
    logger.warn(`[midia] descrição para o turno falhou (mensagem ${arq.messageDbId}): ${err?.message || err}`);
    return null;
  }
}
