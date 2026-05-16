@echo off
REM ============================================
REM Agente Zap - Status dos Serviços
REM ============================================

echo Verificando status dos servicos...
echo.

REM Verificar Backend
netstat -ano | findstr ":3301" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] Backend rodando na porta 3301
) else (
    echo [ERRO] Backend nao esta rodando
)

REM Verificar Frontend
netstat -ano | findstr ":3300" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] Frontend rodando na porta 3300
) else (
    echo [ERRO] Frontend nao esta rodando
)

REM Verificar ChromaDB
netstat -ano | findstr ":8000" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] ChromaDB rodando na porta 8000
) else (
    echo [ERRO] ChromaDB nao esta rodando
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
    echo [OK] MariaDB rodando na porta 3306
) else (
    echo [ERRO] MariaDB nao esta rodando
)

echo.
pause

