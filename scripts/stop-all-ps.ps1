# ============================================
# Agente Zap - Parar Todos os Serviços (PowerShell)
# ============================================

Write-Host "[INFO] Parando servicos..." -ForegroundColor Cyan
Write-Host ""

# Função para parar processo em uma porta
function Stop-ProcessOnPort {
    param(
        [int]$Port,
        [string]$ServiceName
    )
    
    Write-Host "[INFO] Parando $ServiceName (porta $Port)..." -ForegroundColor Yellow
    
    try {
        $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        
        if ($connection) {
            $processId = $connection.OwningProcess
            Write-Host "[INFO] Encontrado PID: $processId" -ForegroundColor Gray
            
            Stop-Process -Id $processId -Force -ErrorAction Stop
            Write-Host "[OK] $ServiceName parado (PID: $processId)" -ForegroundColor Green
            return $true
        } else {
            Write-Host "[AVISO] $ServiceName nao encontrado na porta $Port" -ForegroundColor Yellow
            return $false
        }
    } catch {
        Write-Host "[ERRO] Falha ao parar $ServiceName : $_" -ForegroundColor Red
        return $false
    }
}

# Parar serviços
Stop-ProcessOnPort -Port 3301 -ServiceName "Backend"
Write-Host ""

Stop-ProcessOnPort -Port 3300 -ServiceName "Frontend"
Write-Host ""

Stop-ProcessOnPort -Port 8000 -ServiceName "ChromaDB"
Write-Host ""

Write-Host "[SUCESSO] Processo de parada concluido!" -ForegroundColor Green
Start-Sleep -Seconds 2

