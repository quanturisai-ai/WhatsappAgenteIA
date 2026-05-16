# WhatsApp — Integração e Gestão de Sessão

> Gerado pelo Writer (Reversa) em 2026-05-16
> Rastreabilidade: `backend/src/routes/whatsapp.routes.ts`, `backend/src/controllers/whatsapp.controller.ts`, `backend/src/services/whatsapp.service.ts`, `backend/src/services/whatsapp.manager.ts`

## Visão Geral

Módulo responsável por inicializar, monitorar e controlar a conexão com o WhatsApp Web via `whatsapp-web.js`. Gerencia o ciclo de vida completo de uma sessão WhatsApp por usuário: da leitura do QR code até a desconexão. Inclui mecanismos de resiliência (keep-alive, health check, auto-reconnect) e é a camada que recebe mensagens brutas do WhatsApp e as encaminha para o pipeline de IA.

## Responsabilidades

- Inicializar o cliente WhatsApp Web (Puppeteer + whatsapp-web.js) por usuário
- Gerenciar ciclo de vida da sessão: connecting → authenticated → connected → disconnected
- Expor QR code para autenticação via interface web
- Enviar mensagens de texto para números externos
- Desconectar e destruir sessões (disconnect leve vs. logout completo)
- Manter resiliência via keep-alive, health check e auto-reconnect no startup
- Receber mensagens WhatsApp e acionar o pipeline de conversa/IA

## Regras de Negócio

- Exatamente **uma sessão WhatsApp por usuário** — enforced por `UNIQUE(user_id)` na tabela `whatsapp_sessions` e pelo padrão Singleton no `WhatsAppManager` 🟢
- Proteção contra **dupla inicialização simultânea** via segundo `Map<userId, Promise>` no manager 🟢
- QR code expirado é limpo da memória (`lastQRCode = null`) e evento `qr_expired` é emitido via Socket.IO 🟢
- **Keep-alive:** verifica sessão a cada 15 min; após 4 erros consecutivos (~1h) marca status `connection_failed` 🟢
- **Health check:** a cada 30 min reconcilia estado do banco vs. cliente em memória (background job) 🟢
- **Auto-reconnect no startup:** ao iniciar o servidor, escaneia sessões `connected`/`authenticated` do banco, valida arquivos físicos e tenta reconectar automaticamente 🟢
- **Debounce de mensagens recebidas:** acumula mensagens do mesmo contato por alguns segundos antes de processar com a IA — evita múltiplas chamadas ao LLM para mensagens fracionadas 🟢
- `logout()` mata processos Chrome residuais via PowerShell (`taskkill`) no Windows 🟡
- `disconnect()` diferencia-se de `logout()`: disconnect é leve (para o cliente sem destruir sessão persistida), logout destrói tudo incluindo arquivos 🟡

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|-----------|-------------------|
| RF-01 | Inicializar sessão WhatsApp para o usuário autenticado | Must | POST /api/whatsapp/initialize dispara criação do cliente Puppeteer e retorna status `connecting` |
| RF-02 | Retornar status atual da sessão | Must | GET /api/whatsapp/status retorna ENUM: `disconnected`, `connecting`, `authenticated`, `connected`, `connection_failed` |
| RF-03 | Retornar QR code para autenticação | Must | GET /api/whatsapp/qr retorna QR code em memória enquanto vigente; null se expirado |
| RF-04 | Enviar mensagem de texto para número WhatsApp | Must | POST /api/whatsapp/send envia mensagem e retorna confirmação |
| RF-05 | Desconectar sessão (leve) | Should | POST /api/whatsapp/disconnect para o cliente sem destruir arquivos de sessão |
| RF-06 | Fazer logout completo (destrói sessão) | Should | POST /api/whatsapp/logout destrói cliente, arquivos e mata processos Chrome |
| RF-07 | Auto-reconnect ao iniciar o servidor | Must | Sessions com status `connected`/`authenticated` no banco são reconectadas automaticamente |
| RF-08 | Keep-alive com marcação de falha após 4 erros | Should | Após ~1h de erros, status muda para `connection_failed` |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Disponibilidade | Keep-alive a cada 15 min + health check a cada 30 min | `code-analysis.md` (mecanismos de resiliência) | 🟢 |
| Segurança | Todas as rotas requerem autenticação JWT | `backend/src/routes/whatsapp.routes.ts:14` | 🟢 |
| Compatibilidade | Usa Puppeteer com Chromium — dependente de ambiente com display (ou headless) | `whatsapp.service.ts` (LocalAuth + Puppeteer config) | 🟡 |
| Confiabilidade | Proteção contra dupla inicialização via Promise lock | `whatsapp.manager.ts` | 🟢 |

## Critérios de Aceitação

```gherkin
Dado que o usuário está autenticado e não tem sessão WhatsApp ativa
Quando POST /api/whatsapp/initialize é chamado
Então o status muda para "connecting" e o QR code fica disponível em /qr

Dado que o QR code foi escaneado pelo celular
Quando a autenticação WhatsApp é concluída
Então o status muda para "connected" e o evento de conexão é emitido via Socket.IO

Dado que o status é "connected"
Quando GET /api/whatsapp/status é chamado
Então a resposta é 200 com { status: "connected" }

Dado que uma sessão está ativa
Quando POST /api/whatsapp/send com { number, message } é chamado
Então a mensagem é enviada e a resposta confirma o envio

Dado que o QR code expirou sem ser escaneado
Quando o timeout do QR code dispara
Então lastQRCode é limpo e o evento qr_expired é emitido via Socket.IO

Dado que o keep-alive detecta 4 erros consecutivos (≈1h)
Quando a verificação de saúde falha repetidamente
Então o status é atualizado para "connection_failed" no banco

Dado que o servidor é reiniciado com sessões "connected" no banco
Quando o auto-reconnect do startup executa
Então as sessões com arquivos físicos válidos são reconectadas automaticamente
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Inicialização de sessão (RF-01) | Must | Prerequisito para tudo |
| Status da sessão (RF-02) | Must | UI depende disto para feedback |
| QR code (RF-03) | Must | Único meio de autenticação |
| Envio de mensagem (RF-04) | Must | Funcionalidade core do produto |
| Auto-reconnect (RF-07) | Must | Sem isso o sistema cai a cada restart |
| Keep-alive (RF-08) | Should | Melhora disponibilidade mas não bloqueia operação |
| Disconnect leve (RF-05) | Should | Útil mas logout cobre o caso |
| Logout completo (RF-06) | Should | Menos frequente que disconnect |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `backend/src/routes/whatsapp.routes.ts` | Roteamento das 6 rotas | 🟢 |
| `backend/src/controllers/whatsapp.controller.ts` | `initializeWhatsApp`, `getWhatsAppStatus`, `getQRCode`, `sendMessage`, `disconnectWhatsApp`, `logoutWhatsApp` | 🟢 |
| `backend/src/services/whatsapp.service.ts` | `WhatsAppService` — ciclo de vida, QR, envio, logout | 🟢 |
| `backend/src/services/whatsapp.manager.ts` | `WhatsAppManager` — Singleton, Map por userId, proteção dupla inicialização | 🟢 |
| `backend/src/index.ts` | Health check background job + auto-reconnect no startup | 🟡 |
