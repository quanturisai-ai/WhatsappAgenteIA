@echo off
REM ============================================
REM Agente Zap - Reiniciar Todos os Serviços
REM ============================================

echo [INFO] Reiniciando servicos...

call "%~dp0stop-all.bat"
timeout /t 5 /nobreak >nul
call "%~dp0start-all.bat"

