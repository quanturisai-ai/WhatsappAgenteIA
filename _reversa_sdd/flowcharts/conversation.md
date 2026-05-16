# Flowchart — Módulo `conversation`

> Gerado pelo Arqueólogo (Reversa) em 2026-05-16

## Fluxo: processIncomingMessage — Pipeline Principal da IA

```mermaid
flowchart TD
    A[processIncomingMessage\nuserId, conversationId, content] --> B{auto_responding\n= true?}
    B -- não --> C[Log e retornar\n mensagem ignorada]
    B -- sim --> D[Atualizar status\n→ in_progress]
    D --> E[sendMandatoryMedias\nEnviar mídias obrigatórias]
    E --> F{Mensagem contém\n#contatoia?}
    F -- sim --> G[includeHistory = false]
    F -- não --> H[includeHistory = true]
    G --> I
    H --> I[RAGService.processMessageAndRespond\nTimeout: 60s]
    I --> J{Resposta contém\nALERTA_ATENDENTE?}
    J -- sim --> K[HumanAttendantService.sendAlert\nEnviar alerta por WhatsApp]
    K --> L[Marcar needs_intervention=true]
    J --> M{Resposta contém\nENVIAR_MIDIA?}
    M -- sim --> N[Enviar mídias\nvia WhatsAppService]
    M --> O{Resposta contém\nCONTATO_PROATIVO?}
    O -- sim --> P[Iniciar contato\ncom número externo]
    O --> Q[Remover todos os comandos\ndo texto de resposta]
    Q --> R{Resposta limpa\né vazia?}
    R -- sim --> S[Não enviar mensagem]
    R -- não --> T[WhatsAppService.sendMessage\nEnviar resposta ao cliente]
    T --> U[Salvar Message\ndirection=outgoing, is_from_ai=true]
```

## Fluxo: Finalização Automática de Conversas

```mermaid
flowchart TD
    A[Job periódico\n1 hora] --> B[Buscar conversas ativas\nstatus IN new, in_progress, paused]
    B --> C{Para cada conversa}
    C --> D[Calcular tempo desde\nlast_message_at]
    D --> E{Inatividade >\nmax_age_hours?}
    E -- não --> F[Manter conversa ativa]
    E -- sim --> G[Atualizar status\n→ finished]
    G --> H[emitConversationUpdated\nvia Socket.IO]
```

## Fluxo: Extração de Comandos da Resposta da IA

```mermaid
flowchart TD
    A[Resposta bruta da IA] --> B[extractAlertCommand\nRegex: ALERTA_ATENDENTE:texto]
    B --> C[removeAlertCommand\nRemove da string]
    C --> D[extractProactiveContactCommand\nRegex: CONTATO_PROATIVO:numero]
    D --> E[removeProactiveContactCommand]
    E --> F[extractMediaCommands\nRegex: ENVIAR_MIDIA:id]
    F --> G[removeMediaCommands]
    G --> H[cleanedResponse enviado\nao WhatsApp]
```
