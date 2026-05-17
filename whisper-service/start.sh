#!/bin/bash
cd "$(dirname "$0")"
if [ ! -d ".venv" ]; then
  echo "Criando ambiente virtual..."
  python3 -m venv .venv
fi
source .venv/bin/activate
pip install -r requirements.txt -q
export WHISPER_MODEL_SIZE=small
export WHISPER_DEVICE=cuda
export WHISPER_COMPUTE_TYPE=float16
export WHISPER_LANGUAGE=pt
echo "Iniciando Whisper Service em http://localhost:8787"
uvicorn main:app --host 0.0.0.0 --port 8787
