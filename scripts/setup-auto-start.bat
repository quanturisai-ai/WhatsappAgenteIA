@echo off
REM ============================================
REM Agente Zap - Configurar Auto-start
REM ============================================

setlocal

set "BUILD_ROOT=%~dp0.."
set "SCRIPT_PATH=%BUILD_ROOT%\scripts\start-all.bat"

echo Configurando auto-start do Agente Zap...
echo.

REM Criar tarefa no Task Scheduler usando schtasks
schtasks /Create /TN "Agente Zap - Iniciar Servicos" /TR "\"%SCRIPT_PATH%\"" /SC ONSTART /RL HIGHEST /F

if %ERRORLEVEL% EQU 0 (
    echo [SUCESSO] Auto-start configurado com sucesso!
    echo.
    echo A tarefa foi criada no Task Scheduler:
    echo Nome: "Agente Zap - Iniciar Servicos"
    echo.
    echo Para gerenciar a tarefa:
    echo 1. Abra o Task Scheduler (taskschd.msc)
    echo 2. Procure por "Agente Zap - Iniciar Servicos"
    echo.
) else (
    echo [ERRO] Falha ao configurar auto-start.
    echo.
    echo Tente executar como Administrador:
    echo 1. Clique com botao direito no script
    echo 2. Selecione "Executar como administrador"
    echo.
)

pause

