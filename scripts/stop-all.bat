@echo off
REM ============================================
REM Agente Zap - Parar Todos os Serviços
REM ============================================

echo [INFO] Parando servicos...
echo.

REM Parar Backend (porta 3302)
echo [INFO] Parando Backend (porta 3302)...
powershell -Command "$output = netstat -ano | Select-String '3302' | Select-String 'LISTENING'; if ($output) { $processId = ($output -split '\s+')[-1]; Write-Host '[INFO] Encontrado PID:' $processId; Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue; Write-Host '[OK] Backend parado (PID:' $processId ')' } else { Write-Host '[AVISO] Backend nao encontrado na porta 3302' }"
echo.

REM Parar Frontend (porta 3300)
echo [INFO] Parando Frontend (porta 3300)...
powershell -Command "$output = netstat -ano | Select-String '3300' | Select-String 'LISTENING'; if ($output) { $processId = ($output -split '\s+')[-1]; Write-Host '[INFO] Encontrado PID:' $processId; Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue; Write-Host '[OK] Frontend parado (PID:' $processId ')' } else { Write-Host '[AVISO] Frontend nao encontrado na porta 3300' }"
echo.

REM Parar ChromaDB (porta 8000)
echo [INFO] Parando ChromaDB (porta 8000)...
powershell -Command "$output = netstat -ano | Select-String '8000' | Select-String 'LISTENING'; if ($output) { $processId = ($output -split '\s+')[-1]; Write-Host '[INFO] Encontrado PID:' $processId; Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue; Write-Host '[OK] ChromaDB parado (PID:' $processId ')' } else { Write-Host '[AVISO] ChromaDB nao encontrado na porta 8000' }"
echo.

echo [SUCESSO] Processo de parada concluido!
timeout /t 2 /nobreak >nul

