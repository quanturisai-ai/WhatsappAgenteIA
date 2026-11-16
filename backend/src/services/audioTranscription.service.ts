import axios from 'axios';
import FormData from 'form-data';
import logger from '../utils/logger';

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
const DEFAULT_TIMEOUT_MS = 30000;
const RETRY_DELAY_MS = 2000;

export interface TranscriptionResult {
  text: string;
  language: string;
  audio_duration: number;
  transcription_time: number;
}

export class AudioTranscriptionService {
  private baseUrl: string;
  private timeoutMs: number;
  private enabled: boolean;

  constructor() {
    this.baseUrl = (process.env.WHISPER_SERVICE_URL || 'http://localhost:8787').replace(/\/$/, '');
    this.timeoutMs = parseInt(process.env.AUDIO_TRANSCRIPTION_TIMEOUT_MS || String(DEFAULT_TIMEOUT_MS), 10) || DEFAULT_TIMEOUT_MS;
    this.enabled = process.env.AUDIO_TRANSCRIPTION_ENABLED === 'true';
  }

  /**
   * Transcreve um buffer de áudio (ex.: ogg/opus do WhatsApp) para texto.
   * Retorna null se transcrição desabilitada, falhar ou timeout.
   */
  async transcribe(buffer: Buffer, mimetype: string): Promise<TranscriptionResult | null> {
    if (!this.enabled) {
      logger.info('Transcrição de áudio desabilitada (AUDIO_TRANSCRIPTION_ENABLED != true). Configure .env com AUDIO_TRANSCRIPTION_ENABLED=true');
      return null;
    }

    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      logger.warn(`Áudio rejeitado: tamanho ${(buffer.length / 1024 / 1024).toFixed(1)}MB > 25MB`);
      return null;
    }

    const ext = mimetype.includes('wav') ? '.wav' : mimetype.includes('mp3') || mimetype.includes('mpeg') ? '.mp3' : mimetype.includes('mp4') ? '.mp4' : '.ogg';
    const form = new FormData();
    form.append('file', buffer, { filename: `audio${ext}`, contentType: mimetype || 'audio/ogg' });

    logger.info('Chamando Whisper em %s/transcribe (tamanho=%d bytes)', this.baseUrl, buffer.length);

    const doRequest = async (): Promise<TranscriptionResult | null> => {
      try {
        const { data } = await axios.post<{ text?: string; language?: string; audio_duration?: number; transcription_time?: number }>(
          `${this.baseUrl}/transcribe`,
          form,
          {
            headers: form.getHeaders(),
            timeout: this.timeoutMs,
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
          }
        );
        if (data && typeof data.text === 'string') {
          return {
            text: data.text,
            language: data.language || 'pt',
            audio_duration: typeof data.audio_duration === 'number' ? data.audio_duration : 0,
            transcription_time: typeof data.transcription_time === 'number' ? data.transcription_time : 0,
          };
        }
        logger.warn('Whisper retornou resposta sem texto válido: data=%s', JSON.stringify(data).slice(0, 200));
        return null;
      } catch (err: any) {
        if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
          logger.warn('Timeout na transcrição de áudio (URL=%s, timeout=%dms)', this.baseUrl, this.timeoutMs);
        } else {
          const msg = err?.response?.data ? JSON.stringify(err.response.data).slice(0, 150) : (err?.message || err);
          logger.warn('Erro ao chamar Whisper service (URL=%s): %s', this.baseUrl, msg);
        }
        return null;
      }
    };

    let result = await doRequest();
    if (result === null) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      result = await doRequest();
    }

    return result;
  }
}
