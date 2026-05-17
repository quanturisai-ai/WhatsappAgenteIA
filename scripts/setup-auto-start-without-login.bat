@echo off
REM ============================================
REM Agente Zap - Configurar Auto-start SEM Login
REM ============================================
REM Este script configura a inicialização automática para executar
REM mesmo se o usuário não fizer login no Windows (executa como SYSTEM)

setlocal

set "BUILD_ROOT=%~dp0.."
set "SCRIPT_PATH=%BUILD_ROOT%\scripts\start-all.bat"
set "TASK_NAME=Agente Zap - Iniciar Servicos (Sem Login)"

echo ============================================
echo Configurar Auto-start SEM Login
echo ============================================
echo.
echo Este script configurara a inicializacao automatica:
echo - Ao ligar/reiniciar o computador (MESMO SEM LOGIN)
echo - Ao fazer login no Windows
echo.
echo IMPORTANTE: Os servicos iniciarao mesmo se ninguem fizer login!
echo.
pause

REM Verificar se a tarefa já existe
schtasks /Query /TN "%TASK_NAME%" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [AVISO] Tarefa ja existe. Removendo tarefa antiga...
    schtasks /Delete /TN "%TASK_NAME%" /F >nul 2>&1
    timeout /t 2 /nobreak >nul
)

REM Criar tarefa usando PowerShell para executar como SYSTEM
echo [INFO] Criando tarefa no Task Scheduler (executando como SYSTEM)...
echo.

powershell -Command "& {$action = New-ScheduledTaskAction -Execute '%SCRIPT_PATH%' -WorkingDirectory '%BUILD_ROOT%'; $trigger1 = New-ScheduledTaskTrigger -AtStartup; $trigger2 = New-ScheduledTaskTrigger -AtLogOn; $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RunOnlyIfNetworkAvailable:$false; $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest; Register-ScheduledTask -TaskName '%TASK_NAME%' -Action $action -Trigger @($trigger1, $trigger2) -Settings $settings -Principal $principal -Description 'Inicia automaticamente todos os servicos do Agente Zap ao ligar/reiniciar o computador, mesmo sem login do usuario' -Force}"

if %ERRORLEVEL% NEQ 0 (
    echo [AVISO] Falha ao criar tarefa com PowerShell. Tentando metodo alternativo...
    echo.
    
    REM Método alternativo usando schtasks
    echo [INFO] Criando tarefa ao iniciar o computador (como SYSTEM)...
    schtasks /Create /TN "%TASK_NAME%" /TR "\"%SCRIPT_PATH%\"" /SC ONSTART /RU SYSTEM /RL HIGHEST /F /ST 00:00
    
    if %ERRORLEVEL% NEQ 0 (
        echo [ERRO] Falha ao configurar auto-start.
        echo.
        echo Tente executar como Administrador:
        echo 1. Clique com botao direito no script
        echo 2. Selecione "Executar como administrador"
        echo.
        pause
        exit /b 1
    )
    
    echo [AVISO] Tarefa criada apenas para iniciar ao ligar o computador.
    echo Para adicionar trigger de login, configure manualmente no Task Scheduler.
)

echo.
echo [SUCESSO] Auto-start configurado com sucesso!
echo.
echo ============================================
echo Tarefa criada: "%TASK_NAME%"
echo ============================================
echo.
echo A tarefa sera executada:
echo - Ao ligar/reiniciar o computador (MESMO SEM LOGIN)
echo - Ao fazer login no Windows
echo.
echo IMPORTANTE:
echo - Os servicos iniciarao automaticamente mesmo sem login
echo - A tarefa executa como SYSTEM (conta de sistema)
echo - Os servicos ficarao acessiveis em:
echo   - Frontend: http://localhost:3300
echo   - Backend: http://localhost:3302
echo.
echo Para gerenciar a tarefa:
echo 1. Abra o Task Scheduler (Win + R, digite: taskschd.msc)
echo 2. Procure por "%TASK_NAME%"
echo 3. Clique com botao direito para editar propriedades
echo.
echo Para remover a tarefa:
echo scripts\remove-auto-start.bat
echo.
echo Para testar a tarefa:
echo schtasks /Run /TN "%TASK_NAME%"
echo.
pause

