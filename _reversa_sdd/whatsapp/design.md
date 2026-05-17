# WhatsApp — Design Técnico

> Gerado pelo Writer (Reversa) em 2026-05-16
> Rastreabilidade: `backend/src/services/whatsapp.service.ts`, `backend/src/services/whatsapp.manager.ts`, `backend/src/controllers/whatsapp.controller.ts`

## Interface

| Método | Caminho | Entrada | Saída | Status codes |
|--------|---------|---------|-------|--------------|
| POST | `/api/whatsapp/initialize` | — (userId via token JWT) | `{ message, status }` | 200, 401, 500 |
| GET | `/api/whatsapp/status` | — | `{ status: SessionStatus }` | 200, 401, 404, 500 |
| GET | `/api/whatsapp/qr` | — | `{ qrCode: string \| null }` | 200, 401, 500 |
| POST | `/api/whatsapp/send` | `{ number: string, message: string }` | `{ message }` | 200, 400, 401, 500 |
| POST | `/api/whatsapp/disconnect` | — | `{ message }` | 200, 401, 500 |
| POST | `/api/whatsapp/logout` | — | `{ message }` | 200, 401, 500 |

**SessionStatus ENUM:** `'disconnected' | 'connecting' | 'authenticated' | 'connected' | 'connection_failed'`

## Fluxo Principal — Inicialização de Sessão

1. Controller extrai `userId` de `req.userId` (populado pelo middleware JWT) (`whatsapp.controller.ts`)
2. `WhatsAppManager.getInstance().initializeService(userId)` é chamado (`whatsapp.manager.ts`)
3. Manager verifica se já existe sessão em `Map<userId, WhatsAppService>`; se sim, retorna instância existente (`manager.ts`)
4. Se não existe, verifica se já há inicialização em andamento via `Map<userId, Promise>`; se sim, aguarda a Promise existente (`manager.ts`)
5. `WhatsAppService` é criado; `initialize()` é chamado internamente (`whatsapp.service.ts`)
6. `setupPuppeteerCache()` e `detectChrome()` são executados antes da criação do `Client` (`puppeteer.util.ts`)
7. `Client` é criado com `LocalAuth({ clientId: 'user_<userId>', dataPath: './whatsapp_sessions/user_<userId>' })` (`service.ts`)
8. Eventos são registrados: `qr`, `authenticated`, `ready`, `disconnected`, `message`, etc.
9. `client.initialize()` dispara o Puppeteer/Chromium headless

## Fluxo Principal — Recepção de Mensagem

1. Evento `message` dispara quando mensagem chega do WhatsApp
2. Debounce acumula mensagens do mesmo `conversationId` em `pendingMessages` por alguns segundos (`service.ts:47-48`)
3. Após o debounce expirar, `ConversationService.processIncomingMessage()` é chamado com todas as mensagens acumuladas
4. A resposta volta via `sendMessage()` ao número do contato

## Fluxo Principal — QR Code

1. Evento `qr` (de `whatsapp-web.js`) dispara ao iniciar sem sessão salva
2. `lastQRCode` é atualizado em memória; timeout de expiração é (re)configurado
3. `GET /api/whatsapp/qr` retorna `lastQRCode` diretamente da memória
4. Se QR expirar: `lastQRCode = null`, evento `qr_expired` emitido via Socket.IO
5. Após scan bem-sucedido: evento `authenticated` dispara, status → `authenticated`
6. Evento `ready` dispara em seguida: status → `connected`, `lastQRCode` limpo

## Fluxo Principal — Logout Completo

1. `WhatsAppService.logout()` chamado pelo controller
2. `killBrowserProcessesForSession()` mata processos Chrome via PowerShell (Windows) (`service.ts:82-107`)
3. `closeBrowserSafely()` fecha o `pupBrowser` com timeout de 10s (`service.ts:113-130`)
4. `client.destroy()` destrui o cliente whatsapp-web.js
5. Arquivos de sessão em `./whatsapp_sessions/user_<userId>/` são deletados do disco
6. Registro de sessão no banco tem status atualizado para `disconnected`
7. Instância removida do `Map` no `WhatsAppManager`

## Dependências

- `whatsapp-web.js` — biblioteca de automação WhatsApp via Puppeteer
- `Puppeteer` (via whatsapp-web.js) — automação de browser Chromium
- `LocalAuth` — estratégia de persistência de sessão via arquivos locais
- `Socket.IO` — emissão de eventos real-time para o frontend (QR, status changes)
- `ConversationService` — pipeline de processamento de mensagens recebidas
- `WhatsAppSessionModel` — persistência de estado da sessão no MariaDB
- `ConversationModel`, `MessageModel`, `ReactionModel` — modelos de dados de conversa
- `puppeteer.util.ts` — `setupPuppeteerCache()`, `detectChrome()`

## Decisões de Design Identificadas

| Decisão | Evidência no código | Confiança |
|---------|---------------------|-----------|
| Singleton `WhatsAppManager` com Map por userId | `whatsapp.manager.ts:getInstance()` | 🟢 |
| Double-init prevention via Promise lock | `whatsapp.manager.ts` (segundo Map) | 🟢 |
| QR code armazenado em memória (`lastQRCode`) — não no banco | `whatsapp.service.ts:32` | 🟢 |
| Debounce de mensagens via `responseTimers` Map | `whatsapp.service.ts:47-48` | 🟢 |
| Kill de processos Chrome via PowerShell no Windows | `whatsapp.service.ts:87-105` | 🟢 |
| Keep-alive: MAX_KEEPALIVE_ERRORS=4 × 15min = 1h antes de connection_failed | `whatsapp.service.ts:52` | 🟢 |
| `setupPuppeteerCache()` chamado antes do `Client` para evitar conflito de cache | `whatsapp.service.ts:19` | 🟢 |

## Estado Interno

`WhatsAppService` mantém estado rico em memória por instância:

| Campo | Tipo | Significado |
|-------|------|-------------|
| `client` | `Client \| null` | Instância do cliente whatsapp-web.js |
| `isInitialized` | `boolean` | Se `initialize()` foi chamado |
| `isClientReady` | `boolean` | Se evento `ready` disparou |
| `lastQRCode` | `string \| null` | QR code atual em memória |
| `qrCodeTimeout` | `Timeout \| null` | Handle do timeout de expiração do QR |
| `keepAliveInterval` | `Timeout \| null` | Handle do interval de keep-alive |
| `keepAliveErrorCount` | `number` | Contador de erros consecutivos (max: 4) |
| `pendingAIMessages` | `Map<string, boolean>` | Mensagens enviadas pela IA aguardando confirmação |
| `pendingMediaIds` | `Map<string, number>` | Media IDs aguardando confirmação de envio |
| `responseTimers` | `Map<number, Timeout>` | Timers de debounce por conversationId |
| `pendingMessages` | `Map<number, string[]>` | Mensagens acumuladas no debounce por conversationId |

**Estado persistido no banco** (`whatsapp_sessions`): `status`, `last_connected_at`, `last_ready_at`, `session_files_path`, `session_files_hash`

## Observabilidade

| Evento | Nível | Local |
|--------|-------|-------|
| Chrome detectado/não detectado | INFO | `puppeteer.util.ts` via `setupPuppeteerCache` |
| QR code gerado | INFO/DEBUG | `whatsapp.service.ts` evento `qr` |
| Sessão autenticada | INFO | evento `authenticated` |
| Sessão pronta (connected) | INFO | evento `ready` |
| Keep-alive check erro | WARN/ERROR | keep-alive interval |
| Kill de processos Chrome | INFO | `killBrowserProcessesForSession` |
| Mensagem recebida | DEBUG | evento `message` |

## Riscos e Lacunas

- 🔴 Comportamento do kill de Chrome em Linux/Mac não implementado — `killBrowserProcessesForSession` só funciona no Windows (`service.ts:106`)
- 🟢 Duração do debounce: controlada por `MESSAGE_DEBOUNCE_MS` (env var), padrão **4000ms** (4s); 0 = processar imediatamente — confirmado em `whatsapp.service.ts:2076-2079`
- 🟡 `session_files_hash` é armazenado mas a lógica de validação no auto-reconnect precisa de verificação detalhada
- 🟡 `closeBrowserSafely()` tem timeout de 10s — se o browser não fechar, o processo Chrome pode ficar órfão
- 🔴 Sem tratamento explícito de múltiplos usuários em produção simultânea — cada usuário tem seu processo Chromium isolado, o que pode ser intensivo em recursos
