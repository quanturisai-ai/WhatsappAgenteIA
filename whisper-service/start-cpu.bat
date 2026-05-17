@echo off
cd /d "%~dp0"
if not exist ".venv" (
  echo Criando ambiente virtual...
  python -m venv .venv
)
call .venv\Scripts\activate.bat
pip install -r requirements.txt -q
set WHISPER_MODEL_SIZE=small
set WHISPER_DEVICE=cpu
set WHISPER_COMPUTE_TYPE=int8
set WHISPER_LANGUAGE=pt
echo Iniciando Whisper Service (CPU) em http://localhost:8787
echo Aguarde o carregamento do modelo na primeira vez...
echo.
uvicorn main:app --host 0.0.0.0 --port 8787
if errorlevel 1 (
  echo.
  echo Erro ao iniciar o servidor. Verifique a mensagem acima.
)
pause
