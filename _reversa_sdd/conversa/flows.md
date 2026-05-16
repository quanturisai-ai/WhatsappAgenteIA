# Conversa — Fluxos Detalhados

> Gerado pelo Writer (Reversa) em 2026-05-16

## Fluxo 1: Pipeline de Processamento de Mensagem Recebida

```
Mensagem WhatsApp recebida
        │
        ▼
[WhatsAppService] debounce acumula mensagens
        │ (timer expira)
        ▼
ConversationService.processIncomingMessage(userId, conversationId, content, wpService)
        │
        ├─► isAutoResponding(conversationId) ──── false ──► ABORT (sem resposta)
        │                   │
        │                  true
        │                   │
        ▼                   ▼
Verifica mídias obrigatórias (AgentConfigService)
        │ (se existirem)
        ▼
Envia mídias obrigatórias via wpService.sendMedia()
        │
        ▼
Verifica flag #contatoia na mensagem do cliente
        │
        ├─── presente ──► contexto sem histórico
        │
        └─── ausente ──► contexto com histórico completo
                 │
                 ▼
RAGService.query(content, userId)
  ├── ChromaDB.query() — busca semântica em documentos/tópicos
  ├── MessageModel.findRecent(conversationId) — histórico
  └── OllamaService.generate(prompt) ──► resposta da IA
        │
        ▼
Parse de comandos especiais na resposta:
  ├── extractAlertCommand() ──► [ALERTA_ATENDENTE:msg] ──► HumanAttendantService.sendAlert()
  ├── extractMediaCommands() ──► [ENVIAR_MIDIA:id] ──► wpService.sendMedia(id)
  └── extractProactiveContactCommand() ──► [CONTATO_PROATIVO:numero] ──► wpService.sendMessage()
        │
        ▼
Texto limpo (sem comandos) enviado ao cliente:
wpService.sendMessage(contact_number, cleanResponse)
        │
        ▼
MessageModel.create() — persiste resposta da IA no banco
        │
        ▼
Socket.IO: message_new emitido ao frontend
```

---

## Fluxo 2: Takeover Humano e Retomada da IA

```
Operador no painel:
POST /api/conversations/:id/takeover
        │
        ▼
auto_responding = false (pausa IA)
conversation.status → (sem mudança explícita, apenas flag) 🟡
        │
        ▼
Socket.IO: conversation_updated emitido
        │
        ▼
Operador responde manualmente:
POST /api/conversations/send  ──► wpService.sendMessage()
        │
        ▼
Operador resolve:
POST /api/conversations/:id/finish
        │
        ▼
status = 'finished'
auto_responding = true (resetado para próxima interação)
        │
        ▼
[próxima mensagem do cliente]
        │
        ▼
processIncomingMessage() reabre conversa automaticamente:
status → 'in_progress'
IA retoma normalmente
```

---

## Fluxo 3: Alerta de Atendente Humano via IA

```
IA gera resposta contendo: "Preciso de ajuda! [ALERTA_ATENDENTE:Cliente precisa de suporte técnico]"
        │
        ▼
extractAlertCommand() extrai:
  command = "Cliente precisa de suporte técnico"
  cleanText = "Preciso de ajuda!"
        │
        ├──► HumanAttendantService.sendAlert(userId, conversationId, "Cliente precisa de suporte técnico")
        │         │
        │         └──► WhatsApp: envia alerta para número do atendente configurado
        │
        └──► wpService.sendMessage(contact_number, "Preciso de ajuda!")
                  (texto limpo sem o comando)
        │
        ▼
needs_intervention = true (marcado no banco)
Socket.IO: conversation_updated com needs_intervention=true
```

---

## Fluxo 4: Finalização Automática por Inatividade

```
Background job (periódico, ex: a cada hora):
finalizeOldConversations()
        │
        ▼
SELECT conversations WHERE
  status = 'in_progress'
  AND last_message_at < NOW() - INTERVAL max_age_hours HOUR
        │
        ▼
Para cada conversa inativa:
  UPDATE status = 'finished'
  UPDATE auto_responding = true
        │
        ▼
Socket.IO: conversation_updated emitido para cada conversa
        │
        ▼
[quando cliente retorna com nova mensagem]
        │
        ▼
processIncomingMessage() recria conversa ou muda status para 'in_progress'
```
