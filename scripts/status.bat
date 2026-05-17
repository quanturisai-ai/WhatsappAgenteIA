@echo off
REM ============================================
REM Agente Zap - Status dos Serviços Atualizado
REM ============================================

echo Verificando status dos servicos...
echo.

REM Verificar Backend
netstat -ano | findstr ":3302" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] Backend rodando na porta 3302 [cite: 6]
) else (
    echo [ERRO] Backend nao esta rodando [cite: 6]
)

REM Verificar Frontend
netstat -ano | findstr ":3300" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] Frontend rodando na porta 3300 [cite: 7]
) else (
    echo [ERRO] Frontend nao esta rodando [cite: 7]
)

REM Verificar ChromaDB
netstat -ano | findstr ":8000" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] ChromaDB rodando na porta 8000 [cite: 8]
) else (
    echo [ERRO] ChromaDB nao esta rodando [cite: 8]
)

REM Verificar Ollama
curl -s http://localhost:11434/api/tags >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] Ollama rodando na porta 11434
) else (
    echo [ERRO] Ollama nao esta rodando
)

REM Verificar MariaDB
netstat -ano | findstr ":3306" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] MariaDB rodando na porta 3306 [cite: 9]
) else (
    echo [ERRO] MariaDB nao esta rodando [cite: 9]
)

REM Verificar Transcrição Whisper (Novo)
netstat -ano | findstr ":8787" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] Whisper rodando na porta 8787
) else (
    echo [ERRO] Whisper nao esta rodando
)

echo.
echo Verificacao concluida.
pause [cite: 10]