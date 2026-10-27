# ---------------------------------------------------------------------------
# Recuperacao manual: destrava a sessao do WhatsApp deste backend.
#
# Escopo restrito de proposito:
#   - Node: apenas o processo que escuta a porta do backend (3302).
#   - Chrome: apenas os processos cujo command line aponta para o perfil
#     session-user_1 desta sessao.
#
# A versao anterior fazia "taskkill /F /IM node.exe /T" e "/IM chrome.exe /T",
# matando TODO Node e TODO Chrome da maquina - incluindo o navegador pessoal do
# usuario e a aplicacao WhatsappCampanha. Nunca volte a filtrar por /IM.
# ---------------------------------------------------------------------------

$backendPort = 3302
$sessionPath = "C:\WhatsappAgenteIA\backend\whatsapp_sessions\user_1\session-user_1"
$sessionFolderName = "session-user_1"

Write-Host "Encerrando o backend (porta $backendPort)..."
$conns = Get-NetTCPConnection -State Listen -LocalPort $backendPort -ErrorAction SilentlyContinue
if ($conns) {
    foreach ($procId in ($conns.OwningProcess | Select-Object -Unique)) {
        Write-Host "  encerrando PID $procId..."
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
} else {
    Write-Host "  nenhum processo escutando na porta $backendPort."
}

Write-Host "Encerrando o Chrome desta sessao ($sessionFolderName)..."
$chromes = Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*$sessionFolderName*" }
if ($chromes) {
    foreach ($proc in $chromes) {
        Write-Host "  encerrando PID $($proc.ProcessId)..."
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
    }
} else {
    Write-Host "  nenhum Chrome usando o perfil desta sessao."
}

Start-Sleep -Seconds 2

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
