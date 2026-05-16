@echo off
REM ============================================
REM Agente Zap - Build de Produção
REM ============================================

setlocal

set "BUILD_ROOT=%~dp0.."
set "BACKEND_DIR=%BUILD_ROOT%\backend"
set "FRONTEND_DIR=%BUILD_ROOT%\frontend"

echo [INFO] Iniciando build de producao...
echo.

REM Build do Backend
echo [INFO] Compilando Backend...
cd /d "%BACKEND_DIR%"
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Falha ao compilar Backend
    pause
    exit /b 1
)
echo [OK] Backend compilado com sucesso!
echo.

REM Build do Frontend
echo [INFO] Compilando Frontend...
cd /d "%FRONTEND_DIR%"
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Falha ao compilar Frontend
    pause
    exit /b 1
)
echo [OK] Frontend compilado com sucesso!
echo.

echo [SUCESSO] Build de producao concluido!
echo.
pause

