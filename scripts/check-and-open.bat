@echo off
REM ============================================
REM Agente Zap - Verificar Serviços e Abrir Chrome
REM ============================================

setlocal enabledelayedexpansion

set "BUILD_ROOT=%~dp0.."
set "BACKEND_DIR=%BUILD_ROOT%\backend"
set "FRONTEND_DIR=%BUILD_ROOT%\frontend"
set "LOGS_DIR=%BUILD_ROOT%\logs"
set "CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe"
set "FRONTEND_URL=http://localhost:3300"
set "BACKEND_PORT=3301"
set "FRONTEND_PORT=3300"

REM Criar diretório de logs se não existir
if not exist "%LOGS_DIR%" mkdir "%LOGS_DIR%"

echo [INFO] Verificando servicos...
echo.

REM Verificar se Backend está rodando
netstat -ano | findstr ":%BACKEND_PORT%" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [AVISO] Backend nao esta rodando. Iniciando...
    cd /d "%BACKEND_DIR%"
    start "Agente Zap - Backend" cmd /k "npm run dev > ..\logs\backend.log 2>&1"
    echo [INFO] Aguardando Backend iniciar...
    timeout /t 5 /nobreak >nul
    
    REM Verificar novamente
    netstat -ano | findstr ":%BACKEND_PORT%" >nul 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo [ERRO] Falha ao iniciar Backend. Verifique os logs em logs\backend.log
        pause
        exit /b 1
    )
    echo [OK] Backend iniciado com sucesso!
) else (
    echo [OK] Backend ja esta rodando na porta %BACKEND_PORT%
)
echo.

REM Verificar se Frontend está rodando
netstat -ano | findstr ":%FRONTEND_PORT%" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [AVISO] Frontend nao esta rodando. Iniciando...
    cd /d "%FRONTEND_DIR%"
    start "Agente Zap - Frontend" cmd /k "npm run dev > ..\logs\frontend.log 2>&1"
    echo [INFO] Aguardando Frontend iniciar...
    timeout /t 5 /nobreak >nul
    
    REM Verificar novamente
    netstat -ano | findstr ":%FRONTEND_PORT%" >nul 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo [ERRO] Falha ao iniciar Frontend. Verifique os logs em logs\frontend.log
        pause
        exit /b 1
    )
    echo [OK] Frontend iniciado com sucesso!
) else (
    echo [OK] Frontend ja esta rodando na porta %FRONTEND_PORT%
)
echo.

REM Verificar se Chrome está instalado
if not exist "%CHROME_PATH%" (
    echo [AVISO] Chrome nao encontrado em: %CHROME_PATH%
    echo [INFO] Tentando abrir no navegador padrao...
    start "" "%FRONTEND_URL%"
    echo.
    echo Servicos verificados e navegador aberto!
    echo.
    echo Fechando terminal em 2 segundos...
    timeout /t 2 /nobreak >nul
    exit /b 0
)

REM Aguardar um pouco mais para garantir que os serviços estão prontos
echo [INFO] Aguardando servicos ficarem prontos...
timeout /t 3 /nobreak >nul

REM Abrir Chrome na URL do frontend
echo [INFO] Abrindo Chrome em %FRONTEND_URL%...
start "" "%CHROME_PATH%" "%FRONTEND_URL%"

if %ERRORLEVEL% EQU 0 (
    echo [SUCESSO] Chrome aberto com sucesso!
    echo.
    echo Servicos verificados e Chrome aberto!
    echo.
    echo Backend: http://localhost:%BACKEND_PORT%
    echo Frontend: %FRONTEND_URL%
    echo.
    echo Fechando terminal em 2 segundos...
    timeout /t 2 /nobreak >nul
    exit /b 0
) else (
    echo [ERRO] Falha ao abrir Chrome. Tente abrir manualmente: %FRONTEND_URL%
    echo.
    pause
    exit /b 1
)

