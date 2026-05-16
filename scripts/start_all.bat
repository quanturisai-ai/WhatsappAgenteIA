@echo off
REM ============================================
REM Agente Zap - Iniciar Todos os Serviços
REM ============================================

setlocal enabledelayedexpansion

REM Configurações
set "BUILD_ROOT=%~dp0.."
set "BACKEND_DIR=%BUILD_ROOT%\backend"
set "FRONTEND_DIR=%BUILD_ROOT%\frontend"
set "CHROMA_DIR=%BUILD_ROOT%\backend\chroma_db"
set "LOGS_DIR=%BUILD_ROOT%\logs"
set "SCRIPTS_DIR=%~dp0"

REM Criar diretório de logs se não existir
if not exist "%LOGS_DIR%" mkdir "%LOGS_DIR%"

timeout /t 30 /nobreak >nul

REM Verificar Node.js
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Node.js nao encontrado. Instale Node.js primeiro.
    pause
    exit /b 1
)

REM Verificar Python
where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Python nao encontrado. Instale Python primeiro.
    pause
    exit /b 1
)

REM Iniciar Backend
echo [INFO] Iniciando Backend...
cd /d "%BACKEND_DIR%"
start "Agente Zap - Backend" cmd /k "npm run dev > ..\logs\backend.log 2>&1"
timeout /t 4 /nobreak >nul

REM Iniciar Frontend
echo [INFO] Iniciando Frontend...
cd /d "%FRONTEND_DIR%"
start "Agente Zap - Frontend" cmd /k "npm run dev > ..\logs\frontend.log 2>&1"


REM Verificar MariaDB
net start | findstr /i "MariaDB" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [AVISO] MariaDB nao esta rodando. Tentando iniciar...
    net start MariaDB
    timeout /t 5 /nobreak >nul
)

REM Verificar Ollama
curl -s http://localhost:11434/api/tags >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [AVISO] Ollama nao esta rodando. Iniciando...
    start /min "" "ollama serve"
    timeout /t 5 /nobreak >nul
)


echo.
echo [SUCESSO] Todos os servicos foram iniciados!
echo.
echo Backend: http://localhost:3301
echo Frontend: http://localhost:3300
echo Pressione qualquer tecla para sair...
pause >nul

