@echo off
REM ============================================
REM Agente Zap - Preparar Ambiente
REM ============================================
REM Este script copia backend/ e frontend/ da raiz do projeto para buid/

setlocal

set "BUILD_ROOT=%~dp0.."
set "PROJECT_ROOT=%BUILD_ROOT%\.."
set "BACKEND_SOURCE=%PROJECT_ROOT%\backend"
set "FRONTEND_SOURCE=%PROJECT_ROOT%\frontend"
set "BACKEND_TARGET=%BUILD_ROOT%\backend"
set "FRONTEND_TARGET=%BUILD_ROOT%\frontend"

echo [INFO] Preparando ambiente de implantacao...
echo.

REM Verificar se backend/ existe na raiz
if not exist "%BACKEND_SOURCE%" (
    echo [ERRO] Pasta backend nao encontrada em: %BACKEND_SOURCE%
    echo [ERRO] Certifique-se de que o projeto esta na estrutura correta.
    pause
    exit /b 1
)

REM Verificar se frontend/ existe na raiz
if not exist "%FRONTEND_SOURCE%" (
    echo [ERRO] Pasta frontend nao encontrada em: %FRONTEND_SOURCE%
    echo [ERRO] Certifique-se de que o projeto esta na estrutura correta.
    pause
    exit /b 1
)

REM Copiar backend/
echo [INFO] Copiando backend/...
if exist "%BACKEND_TARGET%" (
    echo [AVISO] Pasta backend/ ja existe em buid/
    set /p OVERWRITE="Deseja sobrescrever? (S/N): "
    if /i not "%OVERWRITE%"=="S" (
        echo [INFO] Copia de backend/ cancelada
        goto :copy_frontend
    )
    rmdir /s /q "%BACKEND_TARGET%"
)
xcopy /E /I /Y "%BACKEND_SOURCE%" "%BACKEND_TARGET%" >nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Falha ao copiar backend/
    pause
    exit /b 1
)
echo [OK] Backend copiado com sucesso!
echo.

:copy_frontend
REM Copiar frontend/
echo [INFO] Copiando frontend/...
if exist "%FRONTEND_TARGET%" (
    echo [AVISO] Pasta frontend/ ja existe em buid/
    set /p OVERWRITE="Deseja sobrescrever? (S/N): "
    if /i not "%OVERWRITE%"=="S" (
        echo [INFO] Copia de frontend/ cancelada
        goto :done
    )
    rmdir /s /q "%FRONTEND_TARGET%"
)
xcopy /E /I /Y "%FRONTEND_SOURCE%" "%FRONTEND_TARGET%" >nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Falha ao copiar frontend/
    pause
    exit /b 1
)
echo [OK] Frontend copiado com sucesso!
echo.

:done
echo [SUCESSO] Ambiente preparado com sucesso!
echo.
echo Proximos passos:
echo 1. Configure os arquivos .env em backend/.env e frontend/.env
echo 2. Execute install-dependencies.bat para instalar dependencias
echo 3. Execute start-all.bat para iniciar os servicos
echo.
pause

