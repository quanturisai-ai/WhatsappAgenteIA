# Como testar o Whisper (transcrição de áudio)

## 1. Subir o serviço Whisper

**Windows (PowerShell ou CMD):**
```bat
cd whisper-service
start.bat
```

**Linux/Mac:**
```bash
cd whisper-service
chmod +x start.sh && ./start.sh
```

Aguarde até aparecer algo como: `Uvicorn running on http://0.0.0.0:8787`.  
Na primeira vez o modelo será baixado (~500 MB para `small`).

---

## 2. Testar o endpoint de saúde

```bash
curl http://localhost:8787/health
```

Resposta esperada:
```json
{"status":"ok","model":"small","device":"cuda"}
```
(ou `"device":"cpu"` se não tiver GPU)

---

## 3. Testar transcrição com um arquivo de áudio

Você precisa de um arquivo de áudio (por exemplo `teste.ogg`, `teste.mp3` ou `teste.wav`).

**PowerShell (Windows):**
```powershell
curl.exe -X POST http://localhost:8787/transcribe -F "file=@C:\caminho\para\seu\audio.ogg"
```

**Linux/Mac / Git Bash:**
```bash
curl -X POST http://localhost:8787/transcribe -F "file=@/caminho/para/seu/audio.ogg"
```

Exemplo com um arquivo na pasta atual:
```bash
curl -X POST http://localhost:8787/transcribe -F "file=@teste.ogg"
```

Resposta esperada (exemplo):
```json
{
  "text": "Olá, gostaria de saber o horário de funcionamento.",
  "language": "pt",
  "language_probability": 0.99,
  "audio_duration": 3.5,
  "transcription_time": 0.82
}
```

---

## 4. Testar pelo backend (WhatsApp)

1. No **backend**, crie/edite o `.env`:
   ```
   AUDIO_TRANSCRIPTION_ENABLED=true
   WHISPER_SERVICE_URL=http://localhost:8787
   AUDIO_TRANSCRIPTION_TIMEOUT_MS=30000
   ```

2. Inicie o **Whisper** (passo 1) e depois o **backend** (npm run dev).

3. Conecte o WhatsApp (QR no dashboard) e envie um **áudio** de outro número para o número conectado.

4. No dashboard, na conversa, você deve ver:
   - O áudio salvo com player para ouvir.
   - O texto transcrito abaixo (e a IA respondendo com base nesse texto).

Se o Whisper não estiver rodando, o backend grava a mensagem com conteúdo `[Áudio recebido - transcrição indisponível]` e o áudio continua sendo salvo para ouvir.

---

## 5. Sem GPU (apenas CPU)

No **whisper-service**, antes de rodar `start.bat` ou `start.sh`, defina:

**Windows (CMD):**
```bat
set WHISPER_DEVICE=cpu
start.bat
```

**Windows (PowerShell):**
```powershell
$env:WHISPER_DEVICE="cpu"; .\start.bat
```

**Linux/Mac:**
```bash
WHISPER_DEVICE=cpu ./start.sh
```

O modelo `small` em CPU é mais lento, mas funciona.

---

## Resumo rápido

| O que testar      | Como |
|-------------------|------|
| Serviço no ar      | `curl http://localhost:8787/health` |
| Transcrição       | `curl -X POST http://localhost:8787/transcribe -F "file=@audio.ogg"` |
| Fluxo completo    | Backend com `AUDIO_TRANSCRIPTION_ENABLED=true` + enviar áudio no WhatsApp |
