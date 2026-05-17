# Whisper Transcription Service

Microserviço de transcrição de áudio com **faster-whisper** (modelo small, GPU). Usado pelo backend Node.js para transcrever áudios recebidos via WhatsApp.

## Requisitos

- Python 3.10+
- CUDA (NVIDIA) para GPU — ou use `WHISPER_DEVICE=cpu`

## Instalação e execução

**Windows:**
```bat
start.bat
```

**Linux/Mac:**
```bash
chmod +x start.sh && ./start.sh
```

Na primeira execução o modelo será baixado (~500 MB). O serviço sobe em **http://localhost:8787**.

## Variáveis de ambiente

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| WHISPER_MODEL_SIZE | small | Tamanho do modelo (tiny, base, small, medium, large-v3) |
| WHISPER_DEVICE | cuda | Dispositivo: `cuda` ou `cpu` |
| WHISPER_COMPUTE_TYPE | float16 | Tipo de computação (float16 para GPU) |
| WHISPER_LANGUAGE | pt | Idioma predominante |
| WHISPER_MAX_FILE_SIZE_MB | 25 | Tamanho máximo do arquivo (MB) |

## Endpoints

- `GET /health` — Status e nome do modelo
- `POST /transcribe` — Envio do arquivo de áudio (multipart, campo `file`). Resposta: `{ "text", "language", "audio_duration", "transcription_time" }`

## Backend (.env)

No projeto Node.js, configure:

```
AUDIO_TRANSCRIPTION_ENABLED=true
WHISPER_SERVICE_URL=http://localhost:8787
AUDIO_TRANSCRIPTION_TIMEOUT_MS=30000
```

Com `AUDIO_TRANSCRIPTION_ENABLED=false` o backend não chama o serviço e áudios são tratados como "[Áudio recebido]".
