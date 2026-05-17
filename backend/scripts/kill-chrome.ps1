
Write-Host "Eliminando processos Node e Chrome..."
taskkill /F /IM node.exe /T 
taskkill /F /IM chrome.exe /T
taskkill /F /IM google-chrome.exe /T

$sessionPath = "c:\WhatsappAgenteIA\backend\whatsapp_sessions\user_1\session-user_1"
$lockFile = "$sessionPath\lockfile"

if (Test-Path $sessionPath) {
    Write-Host "Verificando arquivos de lock..."
    
    if (Test-Path $lockFile) {
        try {
            Remove-Item $lockFile -Force -ErrorAction Stop
            Write-Host "Arquivo lockfile removido com sucesso."
        }
        catch {
            Write-Host "ERRO: Não foi possível deletar o lockfile (bloqueado pelo sistema)."
            Write-Host "Tentando renomear a pasta da sessão inteira..."
            
            $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
            try {
                Rename-Item $sessionPath "session-user_1.bak-$timestamp" -ErrorAction Stop
                Write-Host "SUCESSO: Pasta da sessão renomeada para session-user_1.bak-$timestamp"
                Write-Host "Isso força o sistema a criar uma nova sessão limpa."
            }
            catch {
                Write-Host "FALHA CRÍTICA: Não foi possível renomear a pasta. O bloqueio é total."
                Write-Host "Por favor, REINICIE O COMPUTADOR para liberar os arquivos."
            }
        }
    }
}

Write-Host "Concluído. Tente iniciar o backend agora com: npm run dev"
