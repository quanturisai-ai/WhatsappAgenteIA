"""
Microserviço de transcrição de áudio com faster-whisper.
Usado pelo backend Node.js (whatsapp) para transcrever áudios do WhatsApp.
"""
import os
import time
import tempfile
import logging
from fastapi import FastAPI, UploadFile, File, HTTPException
from faster_whisper import WhisperModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("whisper-service")

MODEL_SIZE = os.environ.get("WHISPER_MODEL_SIZE", "small")
DEVICE = os.environ.get("WHISPER_DEVICE", "cuda").lower()
_COMPUTE_RAW = os.environ.get("WHISPER_COMPUTE_TYPE", "").lower()
# Em CPU, use int8 por padrão (float16 não é eficiente; evita erro de lib CUDA quando DEVICE=cpu)
COMPUTE_TYPE = _COMPUTE_RAW if _COMPUTE_RAW else ("int8" if DEVICE == "cpu" else "float16")
LANGUAGE = os.environ.get("WHISPER_LANGUAGE", "pt")
MAX_FILE_SIZE_MB = int(os.environ.get("WHISPER_MAX_FILE_SIZE_MB", "25"))

app = FastAPI(title="Whisper Transcription Service")
model: WhisperModel = None


def _load_model(device: str = None, compute_type: str = None):
    """Carrega o modelo. device/compute_type sobrescrevem variáveis de ambiente."""
    global model
    d = device or DEVICE
    ct = compute_type or COMPUTE_TYPE
    logger.info("Carregando modelo faster-whisper '%s' em %s (%s)...", MODEL_SIZE, d, ct)
    start = time.time()
    model = WhisperModel(MODEL_SIZE, device=d, compute_type=ct)
    logger.info("Modelo carregado em %.1fs", time.time() - start)
    return model


@app.on_event("startup")
def load_model():
    global model
    try:
        _load_model()
    except Exception as e:
        if DEVICE == "cuda":
            logger.warning("Falha ao carregar com CUDA (%s). Tentando CPU com int8...", e)
            _load_model(device="cpu", compute_type="int8")
        else:
            raise


def _transcribe_with_model(tmp_path: str):
    """Executa transcrição. Se CUDA falhar (ex.: cublas64_12.dll não encontrada ao encoder),
    recarrega o modelo em CPU e tenta de novo. O erro só ocorre ao iterar o gerador (encode),
    por isso consumimos list(segments) aqui para que o except capture."""
    global model

    def _run():
        segs, inf = model.transcribe(
            tmp_path,
            language=LANGUAGE,
            beam_size=5,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=500),
        )
        return (list(segs), inf)

    try:
        return _run()
    except RuntimeError as e:
        err_msg = str(e).lower()
        if "cublas" in err_msg or "cuda" in err_msg or "dll" in err_msg:
            logger.warning(
                "CUDA/cuBLAS indisponível durante encode (%s). Recarregando em CPU (int8) e repetindo...",
                e,
            )
            _load_model(device="cpu", compute_type="int8")
            return _run()
        raise


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_SIZE, "device": DEVICE}


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    if not model:
        raise HTTPException(status_code=503, detail="Modelo ainda carregando")

    contents = await file.read()
    size_mb = len(contents) / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        raise HTTPException(
            status_code=413,
            detail="Arquivo muito grande (%.1fMB > %dMB)" % (size_mb, MAX_FILE_SIZE_MB),
        )

    suffix = ".ogg"
    if file.content_type:
        if "wav" in file.content_type:
            suffix = ".wav"
        elif "mp3" in file.content_type or "mpeg" in file.content_type:
            suffix = ".mp3"
        elif "mp4" in file.content_type:
            suffix = ".mp4"

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(contents)
            tmp_path = tmp.name
        # Arquivo fechado antes de transcrever (importante no Windows)
        # Nota: Em CUDA, cublas64_12.dll pode ser carregada só no primeiro encode() (áudio com fala).
        # Áudio só silêncio não chama encode(), por isso um teste com silêncio pode passar e o WhatsApp falhar.
        start = time.time()
        segments, info = _transcribe_with_model(tmp_path)

        text_parts = []
        for segment in segments:
            text_parts.append(segment.text.strip())

        text = " ".join(text_parts).strip()
        elapsed = time.time() - start
        audio_duration = getattr(info, "duration", 0.0)
        lang = getattr(info, "language", "pt")
        lang_prob = getattr(info, "language_probability", 0.0)

        logger.info(
            "Transcrito em %.2fs | %.1fs de áudio | lang=%s | %d chars",
            elapsed,
            audio_duration,
            lang,
            len(text),
        )

        return {
            "text": text,
            "language": lang,
            "language_probability": round(lang_prob, 3),
            "audio_duration": round(audio_duration, 2),
            "transcription_time": round(elapsed, 3),
        }
    except Exception as e:
        logger.exception("Erro na transcrição: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if tmp_path and os.path.isfile(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
