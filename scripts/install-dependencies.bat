@echo off
REM ============================================
REM Agente Zap - Instalar Dependências
REM ============================================

setlocal

set "BUILD_ROOT=%~dp0.."
set "BACKEND_DIR=%BUILD_ROOT%\backend"
set "FRONTEND_DIR=%BUILD_ROOT%\frontend"

echo [INFO] Instalando dependencias...
echo.

REM Verificar Node.js
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Node.js nao encontrado. Instale Node.js primeiro.
    pause
    exit /b 1
)
echo [OK] Node.js encontrado

REM Verificar Python
where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Python nao encontrado. Instale Python primeiro.
    pause
    exit /b 1
)
echo [OK] Python encontrado

REM Instalar dependências do Backend
echo [INFO] Instalando dependencias do Backend...
cd /d "%BACKEND_DIR%"
call npm install --legacy-peer-deps
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Falha ao instalar dependencias do Backend
    pause
    exit /b 1
)
echo [OK] Dependencias do Backend instaladas!
echo.

REM Instalar dependências do Frontend
echo [INFO] Instalando dependencias do Frontend...
cd /d "%FRONTEND_DIR%"
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Falha ao instalar dependencias do Frontend
    pause
    exit /b 1
)
echo [OK] Dependencias do Frontend instaladas!
echo.

REM Verificar ChromaDB
echo [INFO] Verificando ChromaDB...
python -m pip show chromadb >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [AVISO] ChromaDB nao encontrado. Instalando...
    python -m pip install chromadb
    if %ERRORLEVEL% NEQ 0 (
        echo [ERRO] Falha ao instalar ChromaDB
        pause
        exit /b 1
    )
    echo [OK] ChromaDB instalado!
) else (
    echo [OK] ChromaDB ja esta instalado
)
echo.

REM Verificar Ollama
echo [INFO] Verificando Ollama...
where ollama >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [AVISO] Ollama nao encontrado no PATH
    echo [AVISO] Instale Ollama manualmente: https://ollama.ai/
) else (
    echo [OK] Ollama encontrado
)
echo.

echo [SUCESSO] Todas as dependencias foram instaladas/verificadas!
echo.
pause

