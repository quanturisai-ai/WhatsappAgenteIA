@echo off
REM ============================================
REM Agente Zap - Iniciar Todos os Servicos (FIXO FINAL)
REM ============================================

setlocal enabledelayedexpansion

REM Configurações de Caminho Absoluto
set "BASE_DIR=C:\WhatsappAgenteIA"
set "BACKEND_DIR=%BASE_DIR%\backend"
set "FRONTEND_DIR=%BASE_DIR%\frontend"
set "WHISPER_DIR=%BASE_DIR%\whisper-service"

echo [INFO] Aguardando estabilizacao do sistema (10s)...
timeout /t 10 /nobreak >nul

REM ============================================
REM LIMPEZA DE PROCESSOS (CHROME)
REM ============================================
echo [INFO] Finalizando instancias travadas do Chrome...
taskkill /F /IM chrome.exe /T >nul 2>&1
timeout /t 2 /nobreak >nul

REM Verificar MariaDB
net start | findstr /i "MariaDB" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [AVISO] MariaDB nao esta rodando. Iniciando...
    net start MariaDB
)

REM ============================================
REM INICIAR WHISPER SERVICE
REM ============================================
echo [INFO] Iniciando Whisper Service...
cd /d "%WHISPER_DIR%"
:: O comando 'call' ou iniciar em nova janela evita travar o script aqui
start "Agente Zap - Whisper" cmd /c "start.bat"
timeout /t 5 /nobreak >nul

REM ============================================
REM INICIAR BACKEND (Com caminho absoluto forçado)
REM ============================================
echo [INFO] Iniciando Backend...
cd /d "%BACKEND_DIR%"
:: Removi o log para você ver o erro se o Chrome não abrir
start "Agente Zap - Backend" cmd /k "npm run dev"
timeout /t 5 /nobreak >nul

REM ============================================
REM INICIAR FRONTEND (Com caminho absoluto forçado)
REM ============================================
echo [INFO] Iniciando Frontend...
cd /d "%FRONTEND_DIR%"
start "Agente Zap - Frontend" cmd /k "npm run dev"

echo.
echo [SUCESSO] Todos os servicos foram disparados! [cite: 16]
echo Verifique se a janela do Chrome apareceu para o Captcha.
pause >nul