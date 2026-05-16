# WhatsApp — Tarefas de Implementação

> Gerado pelo Writer (Reversa) em 2026-05-16

## Pré-requisitos

- [ ] `whatsapp-web.js` e `puppeteer` instalados (`backend/package.json`)
- [ ] Chrome/Chromium disponível no ambiente (ou detectado via `detectChrome()`)
- [ ] Variável `WHATSAPP_SESSION_PATH` definida (padrão: `./whatsapp_sessions`)
- [ ] Tabela `whatsapp_sessions` criada (`backend/src/config/database.schema.sql`)
- [ ] Socket.IO configurado e acessível para emissão de eventos

## Tarefas

- [ ] T-01 — Implementar `WhatsAppManager` como Singleton com `Map<userId, WhatsAppService>` e proteção de dupla inicialização via segundo `Map<userId, Promise>`
  - Origem no legado: `backend/src/services/whatsapp.manager.ts`
  - Critério de pronto: duas chamadas simultâneas a `initializeService(userId)` resultam em uma única instância
  - Confiança: 🟢

- [ ] T-02 — Implementar `WhatsAppService` com todos os handlers de evento: `qr`, `authenticated`, `ready`, `disconnected`, `message`, `message_reaction`
  - Origem no legado: `backend/src/services/whatsapp.service.ts`
  - Critério de pronto: cada evento atualiza o estado em memória e no banco corretamente
  - Confiança: 🟢

- [ ] T-03 — Implementar `initialize()`: criação de `Client` com `LocalAuth`, `setupPuppeteerCache()` antes da criação, registro de eventos
  - Origem no legado: `backend/src/services/whatsapp.service.ts:54-62`
  - Critério de pronto: cliente inicializa e evento `qr` dispara em ambiente sem sessão salva
  - Confiança: 🟢

- [ ] T-04 — Implementar QR code em memória: `lastQRCode`, timeout de expiração, evento `qr_expired` via Socket.IO, limpeza em `authenticated`/`ready`
  - Origem no legado: `backend/src/services/whatsapp.service.ts:32-33`
  - Critério de pronto: `GET /api/whatsapp/qr` retorna QR enquanto vigente e null após expirar
  - Confiança: 🟢

- [ ] T-05 — Implementar keep-alive: interval de 15min, contador `keepAliveErrorCount`, limite `MAX_KEEPALIVE_ERRORS=4`, marcação `connection_failed` no banco
  - Origem no legado: `backend/src/services/whatsapp.service.ts:39,52`
  - Critério de pronto: após 4 falhas consecutivas o status no banco muda para `connection_failed`
  - Confiança: 🟢

- [ ] T-06 — Implementar debounce de mensagens: `responseTimers` e `pendingMessages` Maps por `conversationId`; acumulação e chamada única ao `ConversationService`
  - Origem no legado: `backend/src/services/whatsapp.service.ts:47-48`
  - Critério de pronto: múltiplas mensagens do mesmo contato em rápida sucessão resultam em uma única chamada ao LLM
  - Confiança: 🟢

- [ ] T-07 — Implementar `logout()`: `killBrowserProcessesForSession()` (Windows: PowerShell), `closeBrowserSafely()` com timeout 10s, `client.destroy()`, remoção de arquivos, atualização de status no banco
  - Origem no legado: `backend/src/services/whatsapp.service.ts:82-107, 113-130`
  - Critério de pronto: após logout, arquivos de sessão removidos e status `disconnected` no banco
  - Confiança: 🟢

- [ ] T-08 — Implementar `disconnect()` (leve): para o cliente sem destruir arquivos físicos
  - Origem no legado: `backend/src/services/whatsapp.service.ts`
  - Critério de pronto: sessão pode ser re-inicializada sem novo QR code após disconnect
  - Confiança: 🟡

- [ ] T-09 — Implementar `sendMessage(number, content)`: valida client pronto, formata número, chama `client.sendMessage()`
  - Origem no legado: `backend/src/services/whatsapp.service.ts`
  - Critério de pronto: mensagem entregue ao destinatário; erro adequado se client não pronto
  - Confiança: 🟢

- [ ] T-10 — Implementar auto-reconnect no startup: escanear sessões `connected`/`authenticated` no banco, validar arquivos físicos, chamar `initializeService()` para cada uma
  - Origem no legado: `backend/src/index.ts` (background job no startup)
  - Critério de pronto: após restart do servidor, sessões ativas são reconectadas sem intervenção manual
  - Confiança: 🟡

- [ ] T-11 — Implementar health check global (background job a cada 30min): reconciliar estado banco vs. `Map` do manager
  - Origem no legado: `backend/src/index.ts`
  - Critério de pronto: inconsistências entre banco e memória são detectadas e corrigidas
  - Confiança: 🟡

- [ ] T-12 — Implementar `killBrowserProcessesForSession()` para Linux/Mac (atualmente só Windows)
  - Origem no legado: `backend/src/services/whatsapp.service.ts:106`
  - Critério de pronto: logout completo funciona em Linux sem processos Chrome órfãos
  - Confiança: 🔴 (não implementado no legado)

## Tarefas de Teste

- [ ] TT-01 — Teste de inicialização: `POST /initialize` sem sessão prévia gera QR code
- [ ] TT-02 — Teste de dupla inicialização: duas chamadas simultâneas resultam em uma instância
- [ ] TT-03 — Teste de envio de mensagem: `POST /send` com sessão ativa entrega mensagem
- [ ] TT-04 — Teste de expiração de QR: após timeout, `GET /qr` retorna null
- [ ] TT-05 — Teste de logout: arquivos de sessão removidos após `POST /logout`

## Ordem Sugerida

1. T-01 (Manager Singleton) — fundação
2. T-02, T-03 (WhatsAppService + initialize) — core
3. T-04 (QR code) — necessário para auth
4. T-09 (sendMessage) — funcionalidade core
5. T-05 (keep-alive) — resiliência
6. T-06 (debounce) — qualidade de processamento
7. T-07, T-08 (logout/disconnect) — gerenciamento de ciclo de vida
8. T-10, T-11 (auto-reconnect + health check) — robustez em produção
9. T-12 (Linux/Mac kill) — compatibilidade cross-platform

## Lacunas Pendentes (🔴)

- **T-12:** `killBrowserProcessesForSession()` não implementado para Linux/Mac — decisão necessária sobre estratégia cross-platform
- **Duração do debounce:** valor exato do timeout não confirmado — inspecionar `responseTimers` para obter o valor em milissegundos
