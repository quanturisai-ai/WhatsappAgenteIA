# Plano de Implementação: Recebimento e Transcrição de Áudios do WhatsApp

## Contexto

- **WhatsApp:** whatsapp-web.js.
- **Transcrição:** faster-whisper (small, quantizado) em Python (FastAPI), chamado via HTTP pelo Node.js.
- **Fluxo:** Áudio recebido → download → POST para microserviço → texto → mesmo fluxo de IA (RAG/Ollama) que mensagens de texto.

## Arquitetura

```
Cliente envia áudio → whatsapp.service (download + transcribe) → messageBody = texto
  → conversation.service.processIncomingMessage(messageBody)
  → rag.service → ollama → resposta → sendMessage()
```

- **Microserviço:** `whisper-service/` (FastAPI, porta 8787).
- **Backend:** `audioTranscription.service.ts` chama POST /transcribe.

## Etapas Implementadas

1. **Microserviço Python** — `whisper-service/main.py`, `requirements.txt`, `start.bat`
2. **Serviço Node** — `backend/src/services/audioTranscription.service.ts`
3. **Tipos** — `'audio'` em backend e frontend types
4. **whatsapp.service.ts** — detectMessageType retorna `'audio'` para ptt/audio; handleIncomingMessage transcreve e usa messageBody; processIncomingMessage recebe messageBody
5. **Frontend** — MessageList exibe ícone "Áudio transcrito" para messageType === 'audio'

## Variáveis de ambiente

**Backend (`backend/.env`):**
- `AUDIO_TRANSCRIPTION_ENABLED=true` — ativa transcrição (false = áudios viram "[Áudio recebido]")
- `WHISPER_SERVICE_URL=http://localhost:8787` — URL do microserviço Python
- `AUDIO_TRANSCRIPTION_TIMEOUT_MS=30000` — timeout da requisição (ms)

**Whisper-service (definidas em `start.bat` / `start.sh`):**
- `WHISPER_MODEL_SIZE=small`
- `WHISPER_DEVICE=cuda` (ou `cpu`)
- `WHISPER_COMPUTE_TYPE=float16`
- `WHISPER_LANGUAGE=pt`

## Proteções

- Feature flag desliga transcrição sem alterar resto do fluxo.
- Timeout 30s e retry 1x no cliente Node.
- Try/catch no handleIncomingMessage; fallback `[Áudio recebido - ...]`.
- Limite 25MB no serviço de transcrição.
- conversation.service e rag.service não foram alterados.
