"""
Script para testar transcrição de um arquivo de áudio (uso: python transcribe_file.py <caminho.ogg>).
Usa CPU e modelo small por padrão.
"""
import os
import sys
import time

def main():
    if len(sys.argv) < 2:
        print("Uso: python transcribe_file.py <arquivo.ogg>")
        sys.exit(1)
    path = sys.argv[1]
    if not os.path.isfile(path):
        print("Arquivo não encontrado:", path)
        sys.exit(1)
    print("Arquivo:", path, "| Tamanho:", os.path.getsize(path), "bytes")

    from faster_whisper import WhisperModel

    device = os.environ.get("WHISPER_DEVICE", "cpu")
    compute_type = os.environ.get("WHISPER_COMPUTE_TYPE", "int8" if device == "cpu" else "float16")
    model_size = os.environ.get("WHISPER_MODEL_SIZE", "small")
    language = os.environ.get("WHISPER_LANGUAGE", "pt")

    print("Carregando modelo:", model_size, "| device:", device, "| compute_type:", compute_type)
    t0 = time.time()
    model = WhisperModel(model_size, device=device, compute_type=compute_type)
    print("Modelo carregado em %.1fs" % (time.time() - t0))

    print("Transcrevendo...")
    t0 = time.time()
    segments, info = model.transcribe(
        path,
        language=language,
        beam_size=5,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=500),
    )
    text_parts = []
    for segment in segments:
        text_parts.append(segment.text.strip())
    text = " ".join(text_parts).strip()
    elapsed = time.time() - t0

    duration = getattr(info, "duration", None)
    lang = getattr(info, "language", "?")
    print("Duração do áudio (info):", duration, "s | Idioma:", lang)
    print("Tempo de transcrição: %.2fs" % elapsed)
    print("Texto:", repr(text))
    if text:
        print("OK")
    else:
        print("AVISO: texto vazio")

if __name__ == "__main__":
    main()
