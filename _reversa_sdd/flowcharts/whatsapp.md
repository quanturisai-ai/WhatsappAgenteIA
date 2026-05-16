# Flowchart — Módulo `whatsapp`

> Gerado pelo Arqueólogo (Reversa) em 2026-05-16

## Fluxo: Recebimento de Mensagem WhatsApp

```mermaid
flowchart TD
    A[Mensagem recebida\nwhatsapp-web.js] --> B{É mensagem\nde grupo?}
    B -- sim --> C[Ignorar]
    B -- não --> D{WhatsApp Business\nenvio próprio?}
    D -- sim --> C
    D -- não --> E[Registrar mensagem bruta\nWhatsAppRawMessageLogger]
    E --> F[Buscar ou criar Conversation\npor contact_number]
    F --> G[Salvar Message\ndirection=incoming, is_from_ai=false]
    G --> H{Conversa tem\nauto_responding=true?}
    H -- não --> I[Pausado: apenas registra,\nnão chama IA]
    H -- sim --> J[Adicionar ao debounce\npendingMessages Map]
    J --> K[Aguardar debounce\nTimer por conversationId]
    K --> L[Concatenar mensagens\nacumuladas]
    L --> M[ConversationService.processIncomingMessage]
```

## Fluxo: Inicialização da Sessão WhatsApp

```mermaid
flowchart TD
    A[initializeService userId] --> B{Já está\ninicializando?}
    B -- sim --> C[Aguardar Promise\nexistente]
    B -- não --> D{isReady?}
    D -- sim --> E[Retornar serviço\nexistente]
    D -- não --> F[Verificar status\nno banco]
    F --> G{status = connected?}
    G -- sim --> H{isReady local?}
    H -- sim --> E
    H -- não --> I[service.initialize]
    G -- não --> I
    I --> J[Criar Client whatsapp-web.js\ncom LocalAuth]
    J --> K[Puppeteer inicia Chrome\nno caminho da sessão]
    K --> L{Sessão salva\nexiste?}
    L -- sim --> M[Reconectar sem QR]
    L -- não --> N[Gerar QR Code]
    N --> O[Emitir whatsapp:qr\nvia Socket.IO]
    O --> P{Usuário escaneia?}
    P -- sim --> Q[authenticated → connected]
    P -- não --> R[QR expira após timeout\nEmitir whatsapp:qr_expired]
```

## Fluxo: Keep-Alive e Health Check

```mermaid
flowchart TD
    A[Keep-alive interval\n15 min] --> B{Cliente.getState}
    B -- OK --> C[Resetar keepAliveErrorCount]
    B -- erro --> D[keepAliveErrorCount++]
    D --> E{Erros >= 4?}
    E -- não --> F[Log warning, aguardar]
    E -- sim --> G[Marcar status=connection_failed\nno banco]
    
    H[Health check\n30 min] --> I[Buscar todas as sessões\ndo banco]
    I --> J{Para cada sessão}
    J --> K{Banco=connected\nmas cliente local não ativo?}
    K -- sim --> L[Corrigir banco\n→ connection_failed]
    K --> M{Cliente ativo\nmas banco != connected?}
    M -- sim --> N[Corrigir banco\n→ connected]
```
