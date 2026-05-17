# Plano de Implementação: Query Única + Socket para Lista de Conversas

**Data:** 31/01/2025  
**Objetivo:** Otimizar o carregamento da lista de conversas (query única) e substituir polling por atualizações em tempo real via Socket.IO.

---

## 1. Análise de Impactos

### 1.1 Componentes Afetados

| Componente | Impacto | Risco |
|------------|---------|-------|
| `conversation.model.ts` | Novo método `findListCards()` com query única; `findByUserId` pode ser substituído ou mantido | Médio |
| `conversation.controller.ts` | Remoção do loop de enriquecimento (N+1); uso do novo método | Alto |
| `conversation.service.ts` | Possível novo método para emitir via socket | Baixo |
| `whatsapp.service.ts` | Emissão de `conversation:updated` após mensagens | Médio |
| `conversation.controller.ts` (createConversation, markIntervention) | Emissão de `conversation:new` / `conversation:updated` | Baixo |
| `index.ts` (Socket.IO) | Novo listener `conversation:updated` / `conversation:new` | Baixo |
| `KanbanBoard.tsx` (frontend) | Remoção do `setInterval`; listener de socket | Médio |
| `conversation.service.ts` (frontend) | Sem alteração na API | Nenhum |

### 1.2 Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Query única retornar dados diferentes do formato atual | Média | Alto | Manter contrato de resposta idêntico (camelCase, mesmos campos) |
| Socket não emitir em algum cenário | Média | Médio | Fallback: manter polling com intervalo maior (ex: 30s) ou apenas na reconexão |
| `searchByTerm` quebrar | Baixa | Alto | Manter `searchByTerm` separado; usar query base similar com filtro de busca |
| Filtro de 7 dias esconder conversas ativas antigas | Média | Médio | **Decisão:** Manter lógica atual: `status != 'finished'` OU `(finished AND updated_at >= 7 dias)` |
| `normaliza_telefone()` não existir em algum ambiente | Baixa | Alto | Já existe em `migrateVmLavTables`; verificar em init |

### 1.3 Compatibilidade com Frontend

O `ConversationCard` e o tipo `Conversation` esperam:

```typescript
{
  id, contactNumber, contactName?, status, lastMessageAt?, lastMessage?,
  createdAt, updatedAt, isAutoResponding, messageCount, needsIntervention?,
  interventionResolvedAt?
}
```

A query única e o payload do socket **devem** retornar exatamente esse formato (camelCase).

---

## 2. Estratégia de Implementação

### Fase 1: Query Única (Backend)
### Fase 2: Emissão via Socket (Backend)
### Fase 3: Frontend – Remover Polling e Usar Socket

---

## 3. Detalhamento Passo a Passo

### FASE 1: Query Única

#### Passo 1.1: Criar método `findListCards` no `conversation.model.ts`

**Arquivo:** `backend/src/models/conversation.model.ts`

**Ação:** Adicionar novo método que executa uma única query com:
- `c.user_id = ?`
- JOIN com `vm_lav_clientes` via `normaliza_telefone()`
- Subqueries para `ultima_mensagem_texto` e `total_messages`
- Campos: `id`, `contact_number`, `contact_name` (COALESCE de vm_lav), `status`, `auto_responding`, `last_message_at`, `needs_intervention`, `intervention_resolved_at`, `created_at`, `updated_at`, `lid`
- Filtro: manter lógica atual `(status != 'finished') OR (status = 'finished' AND updated_at >= 7 dias)`
- Ordenação: `needs_intervention DESC`, `FIELD(status, 'in_progress', 'new', 'paused', 'finished')`, `last_message_at DESC`
- `GROUP BY c.id` (evitar duplicatas se múltiplos clientes)

**Query SQL (referência):**

```sql
SELECT 
  c.id,
  c.contact_number,
  COALESCE(
    (SELECT v.nome FROM vm_lav_clientes v 
     WHERE normaliza_telefone(v.telefone) = normaliza_telefone(c.contact_number) 
       AND v.user_id = c.user_id LIMIT 1),
    c.contact_name,
    c.contact_number
  ) AS contact_name,
  c.status,
  c.auto_responding,
  c.last_message_at,
  c.needs_intervention,
  c.intervention_resolved_at,
  c.created_at,
  c.updated_at,
  c.lid,
  (SELECT LEFT(COALESCE(
    (SELECT m.content FROM messages m 
     WHERE m.conversation_id = c.id AND m.content IS NOT NULL AND m.content != ''
       AND m.content NOT IN ('[media]','[location]','[contact]','[system]','[other]')
     ORDER BY m.created_at DESC LIMIT 1),
    (SELECT m.content FROM messages m 
     WHERE m.conversation_id = c.id AND m.content IS NOT NULL AND m.content != ''
     ORDER BY m.created_at DESC LIMIT 1)
  ), 50) AS ultima_mensagem_texto,
  (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS total_messages
FROM conversations c
WHERE c.user_id = ?
  AND (
    c.status != 'finished'
    OR (c.status = 'finished' AND c.updated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY))
  )
ORDER BY c.needs_intervention DESC,
  FIELD(c.status, 'in_progress', 'new', 'paused', 'finished'),
  c.last_message_at DESC;
```

**Tratamento de resultado:** Mapear para camelCase e converter `auto_responding`/`needs_intervention` (0/1 → boolean).

---

#### Passo 1.2: Criar método `getConversationCardById` no `conversation.model.ts`

**Objetivo:** Retornar o mesmo formato de um único card para emissão via socket.

**Ação:** Reutilizar a mesma query do `findListCards` com `AND c.id = ?` para uma conversa específica. Ou criar subquery/CTE que retorne 1 linha.

---

#### Passo 1.3: Simplificar `listConversations` no controller

**Arquivo:** `backend/src/controllers/conversation.controller.ts`

**Ação:**
1. Remover o `Promise.all` com `messageModel.countByConversation` e as queries manuais de `lastMessage`.
2. Chamar `conversationModel.findListCards(userId)` quando não houver busca.
3. Manter `conversationModel.searchByTerm` quando `search` estiver presente.
4. Para busca: enriquecer o resultado de `searchByTerm` com `lastMessage` e `messageCount` – ou estender `searchByTerm` para incluir esses campos na query (evitar N+1).
5. Manter `finalizeOldConversations()` antes da listagem (quando não há busca).
6. Manter filtro por `status` em memória se fornecido.
7. Garantir que o formato de resposta seja idêntico ao atual (`conversations: enrichedConversations`).

**Mapeamento do resultado para o frontend:**
- `contact_name` → `contactName` (trim, null se vazio)
- `auto_responding` → `isAutoResponding` (boolean)
- `needs_intervention` → `needsIntervention` (boolean)
- `last_message_at` → `lastMessageAt`
- `ultima_mensagem_texto` → `lastMessage` (truncar 50 chars, undefined se null)
- `total_messages` → `messageCount`
- `intervention_resolved_at` → `interventionResolvedAt`

---

#### Passo 1.4: Estender `searchByTerm` para incluir lastMessage e total_messages

**Arquivo:** `backend/src/models/conversation.model.ts`

**Ação:** Adicionar subqueries de `ultima_mensagem_texto` e `total_messages` na query de `searchByTerm` para evitar N+1 na busca. Manter a mesma estrutura de filtros (nome, telefone, conteúdo, etc.).

---

### FASE 2: Emissão via Socket

#### Passo 2.1: Criar utilitário de emissão Socket para conversas

**Arquivo:** `backend/src/utils/conversationSocketEmitter.ts` (novo)

**Objetivo:** Centralizar a emissão de eventos de conversa para evitar dependência circular com `index.ts`.

**Conteúdo:**
```typescript
// conversationSocketEmitter.ts
import type { Server } from 'socket.io';

let io: Server | null = null;

export function setConversationSocketIo(server: Server) {
  io = server;
}

async function emitToUser(userId: number, event: string, data: object) {
  if (!io) return;
  const sockets = await io.fetchSockets();
  const userSockets = sockets.filter(s => (s as any).userId === userId);
  userSockets.forEach(s => s.emit(event, data));
}

export function emitConversationUpdated(userId: number, conversation: object) {
  emitToUser(userId, 'conversation:updated', { conversation }).catch(err =>
    console.error('Erro ao emitir conversation:updated:', err)
  );
}

export function emitConversationNew(userId: number, conversation: object) {
  emitToUser(userId, 'conversation:new', { conversation }).catch(err =>
    console.error('Erro ao emitir conversation:new:', err)
  );
}
```

**Nota:** Usa o mesmo padrão de `emitToUserSockets` do `index.ts` (buscar sockets por `userId`), evitando dependência de rooms. O `userId` é definido no socket pelo middleware de autenticação JWT.

---

#### Passo 2.2: Inicializar o emitter no `index.ts`

**Arquivo:** `backend/src/index.ts`

**Ação:** Após criar o `io`, chamar:
```typescript
import { setConversationSocketIo } from './utils/conversationSocketEmitter';
setConversationSocketIo(io);
```

---

#### Passo 2.3: Emitir `conversation:updated` no `whatsapp.service.ts`

**Arquivos:** `backend/src/services/whatsapp.service.ts`

**Pontos de emissão:**
1. **handleIncomingMessage** – Após criar/atualizar conversa e salvar mensagem:
   - Buscar o card da conversa via `conversationModel.getConversationCardById(conversation.id)` (ou método equivalente).
   - Chamar `emitConversationUpdated(this.userId, card)`.
2. **handleOutgoingMessage** – Após salvar mensagem e atualizar `last_message_at`:
   - Buscar o card e chamar `emitConversationUpdated(this.userId, card)`.

**Cuidado:** O `getConversationCardById` precisa receber `userId` para garantir multi-tenant. A assinatura pode ser `getConversationCardById(userId: number, conversationId: number)`.

---

#### Passo 2.4: Emitir `conversation:new` no `createConversation`

**Arquivo:** `backend/src/controllers/conversation.controller.ts`

**Ação:** Após `conversationModel.create()`, buscar o card da conversa criada e chamar `emitConversationNew(userId, card)`.

---

#### Passo 2.5: Emitir `conversation:updated` em alterações de status

**Arquivos:**
- `conversation.service.ts` – `finishConversation`, `takeOverConversation`, `pauseAutoResponding`, `resumeAutoResponding`
- `conversation.controller.ts` – `markIntervention`
- `humanAttendant.controller.ts` – ao resolver intervenção

**Ação:** Após cada `conversationModel.update()`, buscar o card e chamar `emitConversationUpdated(userId, card)`.

**Nota:** O `conversation.service` não tem `userId` em todos os métodos. Será necessário passar `userId` ou obter da conversa (`conversation.user_id`).

---

### FASE 3: Frontend

#### Passo 3.1: Obter instância do socket no `KanbanBoard`

**Arquivo:** `frontend/src/components/KanbanBoard.tsx`

**Ação:** Usar o contexto/hook de Socket (ex: `useSocket` ou `socket` do `SocketContext`). Verificar como o `ConversationPanel` obtém o socket.

---

#### Passo 3.2: Remover `setInterval` e adicionar listeners de socket

**Arquivo:** `frontend/src/components/KanbanBoard.tsx`

**Ação:**
1. Remover o `setInterval` de 5 segundos.
2. Adicionar `useEffect` que:
   - Escuta `conversation:updated`: atualiza a conversa correspondente no estado (`setConversations`).
   - Escuta `conversation:new`: adiciona a nova conversa ao estado (no início da lista ou na posição correta).
3. Na reconexão do socket (`connect`), opcionalmente fazer um `loadConversations(undefined, true)` para sincronizar.

**Lógica de merge:**
```typescript
// conversation:updated
setConversations(prev => 
  prev.map(c => c.id === data.conversation.id ? data.conversation : c)
);

// conversation:new
setConversations(prev => {
  if (prev.some(c => c.id === data.conversation.id)) return prev;
  return [data.conversation, ...prev];
});
```

---

#### Passo 3.3: Fallback de polling na reconexão (opcional)

**Ação:** Quando o socket emitir `disconnect` e depois `connect`, fazer um `loadConversations(undefined, true)` para garantir que a lista esteja sincronizada após reconexão.

---

## 4. Ordem de Execução Recomendada

1. **Passo 1.1** – Criar `findListCards` no model.
2. **Passo 1.2** – Criar `getConversationCardById` no model.
3. **Passo 1.3** – Simplificar `listConversations` no controller (sem socket ainda).
4. **Passo 1.4** – Estender `searchByTerm` com lastMessage e total_messages.
5. **Testar** – Garantir que a listagem funcione igual ao atual.
6. **Passo 2.1** – Criar `conversationSocketEmitter.ts`.
7. **Passo 2.2** – Inicializar emitter no `index.ts`.
8. **Passo 2.3** – Emitir no `whatsapp.service.ts`.
9. **Passo 2.4** – Emitir no `createConversation`.
10. **Passo 2.5** – Emitir nas alterações de status.
11. **Passo 3.1, 3.2, 3.3** – Ajustes no frontend.

---

## 5. Checklist de Validação

- [ ] Listagem inicial retorna os mesmos dados que antes.
- [ ] Busca por termo funciona e retorna lastMessage/messageCount.
- [ ] Filtro por status funciona.
- [ ] Nova mensagem recebida atualiza o card em tempo real.
- [ ] Nova mensagem enviada atualiza o card em tempo real.
- [ ] Nova conversa criada aparece na lista em tempo real.
- [ ] Finalizar conversa atualiza o card.
- [ ] Marcar intervenção atualiza o card.
- [ ] Reconexão do socket sincroniza a lista (se implementado).
- [ ] Multi-tenant: usuário A não vê atualizações de usuário B.

---

## 6. Rollback

Se houver problemas:
1. Reverter o controller para usar `findByUserId` + enriquecimento.
2. Remover os listeners de socket no frontend e restaurar o `setInterval` de 5s.
3. Comentar as chamadas a `emitConversationUpdated` e `emitConversationNew` no backend.

---

## 7. Observações Técnicas

### Emissão para o usuário
O `conversationSocketEmitter` usa o mesmo padrão do `index.ts`: `io.fetchSockets()` + filtro por `(s as any).userId === userId`. Não depende de rooms (`socket.join`).

### Formato de datas
Garantir que `lastMessageAt`, `createdAt`, `updatedAt` e `interventionResolvedAt` sejam strings ISO ou compatíveis com o frontend.

### Performance
A query única com subqueries correlatas pode ser mais lenta que o N+1 em cenários com poucas conversas. Em cenários com muitas conversas (50+), a query única tende a ser mais eficiente. Monitorar em produção.
