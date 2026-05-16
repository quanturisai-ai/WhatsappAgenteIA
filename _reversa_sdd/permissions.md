# Matriz de Permissões — WhatsappAgenteIA (Agente Zap)

> Gerado pelo Detetive (Reversa) em 2026-05-16
> Nível de documentação: Completo

---

## Modelo de Controle de Acesso

🟢 CONFIRMADO — extraído de `middleware/auth.ts`, rotas e queries SQL

O sistema implementa **autenticação JWT sem RBAC** (sem papéis diferenciados). Todo usuário autenticado tem o mesmo nível de acesso, restrito exclusivamente aos seus próprios recursos via `user_id`.

**Não existe:**
- Role de administrador
- Permissões granulares por recurso
- ACL entre usuários
- API pública sem autenticação (exceto `/api/auth/login` e `/api/auth/register`)

---

## Papéis Identificados

| Papel | Descrição | Como existe |
|-------|-----------|-------------|
| **Anônimo** | Usuário não autenticado | Acesso apenas a `/api/auth/login` e `/api/auth/register` |
| **Usuário Autenticado** | Operador da lavanderia com conta ativa | JWT válido no header `Authorization` ou query `?token=` |

> 🔴 **LACUNA**: Não existe papel de `admin` ou `superuser`. Não há como um usuário gerenciar outros usuários. Se o sistema for usado por múltiplos operadores da mesma lavanderia, todos têm acesso independente aos seus próprios dados — não há compartilhamento de recursos entre usuários.

---

## Mecanismo de Autenticação

```
1. POST /api/auth/login → retorna { token: JWT }
2. JWT payload: { userId: number }
3. JWT assinado com JWT_SECRET (env) — fallback inseguro: 'default-secret'
4. Expiração: JWT_EXPIRES_IN (env) — padrão: 7d
5. Middleware authenticateToken: verifica token + busca usuário no banco a cada requisição
```

**Token aceito em:**
- Header `Authorization: Bearer <token>`
- Query string `?token=<token>`

---

## Isolamento de Dados por `user_id`

Cada recurso do sistema pertence a um usuário e o acesso é controlado pelo `user_id` do token JWT:

| Recurso | Coluna de isolamento | Verificação |
|---------|---------------------|-------------|
| `whatsapp_sessions` | `user_id` | Query filtra por `userId` do token |
| `conversations` | `user_id` | Query filtra por `userId` do token |
| `messages` | via `conversation_id` → `user_id` | JOIN implícito |
| `documents` | `user_id` | Query filtra por `userId` do token |
| `medias` | `user_id` | Query filtra por `userId` do token |
| `topics` | `user_id` | Query filtra por `userId` do token |
| `agent_config` | `user_id` (UNIQUE) | Query filtra por `userId` do token |
| `human_attendants` | `user_id` | Query filtra por `userId` do token |
| `vm_lav_credentials` | `user_id` | Query filtra por `userId` do token |
| `vm_lav_clientes` | `user_id` | Query filtra por `userId` do token |
| `vm_lav_pedidos` | `user_id` | Query filtra por `userId` do token |
| `premios` | `user_id` | Query filtra por `userId` do token |
| `fidelizacao_regras` | `user_id` | Query filtra por `userId` do token |
| `ChromaDB collection` | `user_{userId}` | Coleção nomeada com prefixo do userId |

---

## Matriz de Permissões por Endpoint

| Módulo | Endpoint | Anônimo | Autenticado |
|--------|----------|---------|-------------|
| **Auth** | POST /api/auth/register | ✅ | ✅ |
| **Auth** | POST /api/auth/login | ✅ | ✅ |
| **Auth** | GET /api/auth/profile | ❌ | ✅ |
| **WhatsApp** | POST /api/whatsapp/initialize | ❌ | ✅ (própria sessão) |
| **WhatsApp** | GET /api/whatsapp/status | ❌ | ✅ (própria sessão) |
| **WhatsApp** | GET /api/whatsapp/qrcode | ❌ | ✅ (própria sessão) |
| **WhatsApp** | POST /api/whatsapp/send | ❌ | ✅ (própria sessão) |
| **WhatsApp** | POST /api/whatsapp/disconnect | ❌ | ✅ (própria sessão) |
| **WhatsApp** | POST /api/whatsapp/logout | ❌ | ✅ (própria sessão) |
| **Conversations** | GET /api/conversations | ❌ | ✅ (próprias) |
| **Conversations** | GET /api/conversations/:id | ❌ | ✅ (própria) |
| **Conversations** | POST /api/conversations/:id/pause | ❌ | ✅ (própria) |
| **Conversations** | POST /api/conversations/:id/resume | ❌ | ✅ (própria) |
| **Conversations** | GET /api/conversations/:id/messages | ❌ | ✅ (própria) |
| **Documents** | POST /api/documents/upload | ❌ | ✅ |
| **Documents** | GET /api/documents | ❌ | ✅ (próprios) |
| **Documents** | DELETE /api/documents/:id | ❌ | ✅ (próprio) |
| **Documents** | POST /api/documents/:id/index | ❌ | ✅ (próprio) |
| **AgentConfig** | GET /api/agent-config | ❌ | ✅ (próprio) |
| **AgentConfig** | PUT /api/agent-config | ❌ | ✅ (próprio) |
| **Media** | POST /api/medias/upload | ❌ | ✅ |
| **Media** | GET /api/medias | ❌ | ✅ (próprias) |
| **Media** | PUT /api/medias/:id | ❌ | ✅ (própria) |
| **Media** | DELETE /api/medias/:id | ❌ | ✅ (própria) |
| **Topics** | GET /api/topics | ❌ | ✅ (próprios) |
| **Topics** | POST /api/topics | ❌ | ✅ |
| **Topics** | PUT /api/topics/:id | ❌ | ✅ (próprio) |
| **Topics** | DELETE /api/topics/:id | ❌ | ✅ (próprio) |
| **Indexing** | POST /api/indexing/reindex | ❌ | ✅ (própria coleção) |
| **Indexing** | GET /api/indexing/status | ❌ | ✅ (própria coleção) |
| **Ollama** | GET /api/ollama/models | ❌ | ✅ |
| **Ollama** | POST /api/ollama/generate | ❌ | ✅ |
| **HumanAttendant** | GET /api/human-attendant | ❌ | ✅ (próprios) |
| **HumanAttendant** | POST /api/human-attendant | ❌ | ✅ |
| **HumanAttendant** | PUT /api/human-attendant/:id | ❌ | ✅ (próprio) |
| **HumanAttendant** | DELETE /api/human-attendant/:id | ❌ | ✅ (próprio) |
| **VmLav** | POST /api/vmlav/credentials | ❌ | ✅ (próprias) |
| **VmLav** | GET /api/vmlav/status | ❌ | ✅ (próprio) |
| **VmLav** | POST /api/vmlav/sync | ❌ | ✅ (próprios dados) |
| **VmLav** | GET /api/vmlav/clients | ❌ | ✅ (próprios) |
| **VmLav** | GET /api/vmlav/orders | ❌ | ✅ (próprios) |
| **Fidelizacao** | GET /api/fidelizacao/saldo/:cpf | ❌ | ✅ (próprios clientes) |
| **Fidelizacao** | POST /api/fidelizacao/premios | ❌ | ✅ |
| **Fidelizacao** | GET /api/fidelizacao/regras | ❌ | ✅ (próprias) |
| **Fidelizacao** | POST /api/fidelizacao/regras | ❌ | ✅ |
| **Fidelizacao** | POST /api/fidelizacao/regras/:id/executar | ❌ | ✅ (própria) |
| **TestChat** | POST /api/test-chat/message | ❌ | ✅ |

---

## Riscos de Segurança Identificados

| Risco | Severidade | Descrição |
|-------|-----------|-----------|
| JWT_SECRET fallback | 🔴 CRÍTICO | Se `JWT_SECRET` não estiver configurado no `.env`, usa `'default-secret'` hardcoded. Qualquer pessoa pode forjar tokens. |
| Sem rate limiting | 🔴 ALTO | A API não tem middleware de rate limiting. Vulnerável a brute force em `/api/auth/login` e a abuso de endpoints custosos. |
| Senha VM Lav em texto plano | 🔴 ALTO | A migração `rename_senha_criptografada_to_senha.sql` removeu a criptografia da senha da VM Lav no banco. Comentário: `'Senha em texto plano'`. |
| Token via query string | 🟡 MÉDIO | Aceitar `?token=` em query string expõe o JWT em logs de servidor, histórico de browser e proxies. |
| Sem HTTPS forçado | 🟡 MÉDIO | Não há configuração de HTTPS no código — depende de infraestrutura externa. |
| Autorização por ID sem verificação de dono | 🟡 MÉDIO | Endpoints com `:id` (ex: `DELETE /api/documents/:id`) dependem da query SQL filtrar por `user_id`. Se alguma query esquecer o filtro, há IDOR. |
