import axios from 'axios';
import logger from '../utils/logger';

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
const DEFAULT_TIMEOUT_MS = 60000; // OpenRouter pode levar mais que o serviço local
const RETRY_DELAY_MS = 2000;

export interface TranscriptionResult {
  text: string;
  language: string;
  audio_duration: number;
  transcription_time: number;
}

function mimetypeToFormat(mimetype: string): string {
  if (mimetype.includes('wav')) return 'wav';
  if (mimetype.includes('mp3') || mimetype.includes('mpeg')) return 'mp3';
  if (mimetype.includes('mp4')) return 'mp4';
  if (mimetype.includes('webm')) return 'webm';
  if (mimetype.includes('flac')) return 'flac';
  if (mimetype.includes('aac')) return 'aac';
  return 'ogg'; // padrão para áudios do WhatsApp (ogg/opus)
}

export class AudioTranscriptionService {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private language: string;
  private timeoutMs: number;
  private enabled: boolean;

  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY || '';
    this.baseUrl = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
    this.model = process.env.OPENROUTER_TRANSCRIPTION_MODEL || 'openai/whisper-large-v3-turbo';
    this.language = process.env.WHISPER_LANGUAGE || 'pt';
    this.timeoutMs = parseInt(process.env.AUDIO_TRANSCRIPTION_TIMEOUT_MS || String(DEFAULT_TIMEOUT_MS), 10) || DEFAULT_TIMEOUT_MS;
    this.enabled = process.env.AUDIO_TRANSCRIPTION_ENABLED === 'true';
  }

  /**
   * Transcreve um buffer de áudio usando OpenRouter STT.
   * Retorna null se transcrição desabilitada, falhar ou timeout.
   */
  async transcribe(buffer: Buffer, mimetype: string): Promise<TranscriptionResult | null> {
    if (!this.enabled) {
      logger.info('Transcrição de áudio desabilitada (AUDIO_TRANSCRIPTION_ENABLED != true).');
      return null;
    }

    if (!this.apiKey) {
      logger.warn('OPENROUTER_API_KEY não configurada — transcrição de áudio indisponível.');
      return null;
    }

    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      logger.warn(`Áudio rejeitado: tamanho ${(buffer.length / 1024 / 1024).toFixed(1)}MB > 25MB`);
      return null;
    }

    const format = mimetypeToFormat(mimetype);
    const base64Audio = buffer.toString('base64');

    logger.info(
      'Transcrevendo áudio via OpenRouter (%s) | formato=%s | tamanho=%d bytes',
      this.model,
      format,
      buffer.length,
    );

    const doRequest = async (): Promise<TranscriptionResult | null> => {
      const startMs = Date.now();
      try {
        // Modelos de STT (whisper/transcribe) usam /audio/transcriptions; os demais (ex.: Gemini)
        // recebem o áudio no chat. Teste de 27/10 (n=3): Gemini 2.5 Flash Lite transcreveu certo,
        // o whisper-large-v3-turbo acrescentou um "Obrigado" que não foi dito.
        const viaChat = !/whisper|transcri/i.test(this.model);
        const { data: resposta } = await axios.post<any>(
          viaChat ? `${this.baseUrl}/chat/completions` : `${this.baseUrl}/audio/transcriptions`,
          viaChat
            ? {
                model: this.model,
                temperature: 0,
                max_tokens: 2000,
                messages: [{
                  role: 'user',
                  content: [
                    { type: 'text', text: `Transcreva este áudio (idioma: ${this.language}). Responda só com o texto falado, sem comentários. Se não houver fala, responda vazio.` },
                    { type: 'input_audio', input_audio: { data: base64Audio, format } },
                  ],
                }],
              }
            : {
                model: this.model,
                input_audio: {
                  data: base64Audio,
                  format,
                },
                language: this.language,
              },
          {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://agentezap.local',
              'X-Title': 'AgenteZap',
            },
            timeout: this.timeoutMs,
          },
        );

        const data: { text?: string; usage?: any } = viaChat
          ? { text: resposta?.choices?.[0]?.message?.content?.trim(), usage: resposta?.usage }
          : resposta;
        const transcriptionTime = (Date.now() - startMs) / 1000;

        if (data && typeof data.text === 'string') {
          logger.info(
            'Transcrição concluída em %.2fs | %d chars',
            transcriptionTime,
            data.text.length,
          );
          return {
            text: data.text,
            language: this.language,
            audio_duration: data.usage?.seconds ?? 0,
            transcription_time: transcriptionTime,
          };
        }

        logger.warn('OpenRouter STT retornou resposta sem texto: %s', JSON.stringify(data).slice(0, 200));
        return null;
      } catch (err: any) {
        if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
          logger.warn('Timeout na transcrição de áudio OpenRouter (timeout=%dms)', this.timeoutMs);
        } else {
          const msg = err?.response?.data
            ? JSON.stringify(err.response.data).slice(0, 200)
            : err?.message || String(err);
          logger.warn('Erro ao chamar OpenRouter STT: %s', msg);
        }
        return null;
      }
    };

    let result = await doRequest();
    if (result === null) {
      logger.info('Aguardando %dms antes de nova tentativa...', RETRY_DELAY_MS);
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      result = await doRequest();
    }

    return result;
  }
}
