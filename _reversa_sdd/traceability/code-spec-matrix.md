# Code-Spec Matrix — WhatsappAgenteIA

> Gerado pelo Writer (Reversa) em 2026-05-16
> Mapeia arquivos do legado às units de spec geradas.

## Legenda de cobertura

- 🟢 Coberto — spec completa gerada (requirements + design + tasks)
- 🟡 Parcial — mencionado na spec mas não é o foco principal
- `n/a` — utilitário/infra sem spec própria (coberto por units relacionadas)

---

## Backend — Rotas e Controllers

| Arquivo do legado | Unit correspondente | Cobertura |
|---------|---------------------|-----------|
| `backend/src/routes/auth.routes.ts` | `autenticacao/` | 🟢 |
| `backend/src/controllers/auth.controller.ts` | `autenticacao/` | 🟢 |
| `backend/src/services/auth.service.ts` | `autenticacao/` | 🟢 |
| `backend/src/middleware/auth.ts` | `autenticacao/` | 🟢 |
| `backend/src/routes/whatsapp.routes.ts` | `whatsapp/` | 🟢 |
| `backend/src/controllers/whatsapp.controller.ts` | `whatsapp/` | 🟢 |
| `backend/src/services/whatsapp.service.ts` | `whatsapp/` | 🟢 |
| `backend/src/services/whatsapp.manager.ts` | `whatsapp/` | 🟢 |
| `backend/src/routes/conversation.routes.ts` | `conversa/` | 🟢 |
| `backend/src/controllers/conversation.controller.ts` | `conversa/` | 🟢 |
| `backend/src/services/conversation.service.ts` | `conversa/` | 🟢 |
| `backend/src/routes/document.routes.ts` | `documento/` | 🟢 |
| `backend/src/controllers/document.controller.ts` | `documento/` | 🟢 |
| `backend/src/services/document.service.ts` | `documento/` | 🟢 |
| `backend/src/routes/agentConfig.routes.ts` | `configuracao-agente/` | 🟢 |
| `backend/src/controllers/agentConfig.controller.ts` | `configuracao-agente/` | 🟢 |
| `backend/src/services/agentConfig.service.ts` (inferido) | `configuracao-agente/` | 🟡 |
| `backend/src/routes/media.routes.ts` | `midia/` | 🟢 |
| `backend/src/controllers/media.controller.ts` | `midia/` | 🟢 |
| `backend/src/services/media.service.ts` | `midia/` | 🟢 |
| `backend/src/routes/topic.routes.ts` | `topico/` | 🟢 |
| `backend/src/controllers/topic.controller.ts` | `topico/` | 🟢 |
| `backend/src/services/topic.service.ts` | `topico/` | 🟢 |
| `backend/src/routes/indexing.routes.ts` | `indexacao/` | 🟢 |
| `backend/src/controllers/indexing.controller.ts` | `indexacao/` | 🟢 |
| `backend/src/services/indexing.service.ts` | `indexacao/` | 🟢 |
| `backend/src/services/rag.service.ts` | `indexacao/` | 🟢 |
| `backend/src/routes/testChat.routes.ts` | `teste-chat/` | 🟢 |
| `backend/src/controllers/testChat.controller.ts` | `teste-chat/` | 🟢 |
| `backend/src/services/testChat.service.ts` (inferido) | `teste-chat/` | 🟡 |
| `backend/src/routes/ollama.routes.ts` | `ollama/` | 🟢 |
| `backend/src/controllers/ollama.controller.ts` | `ollama/` | 🟢 |
| `backend/src/services/ollama.service.ts` | `ollama/` | 🟢 |
| `backend/src/routes/humanAttendant.routes.ts` | `atendente-humano/` | 🟢 |
| `backend/src/controllers/humanAttendant.controller.ts` | `atendente-humano/` | 🟢 |
| `backend/src/services/humanAttendant.service.ts` | `atendente-humano/` | 🟢 |
| `backend/src/routes/vmLav.routes.ts` | `vmlav/` | 🟢 |
| `backend/src/controllers/vmLav.controller.ts` | `vmlav/` | 🟢 |
| `backend/src/services/vmLav.service.ts` (inferido) | `vmlav/` | 🟢 |
| `backend/src/services/vmLavScheduler.ts` | `vmlav/` | 🟢 |
| `backend/src/services/vmLavConnectionManager.service.ts` | `vmlav/` | 🟢 |
| `backend/src/routes/fidelizacao.routes.ts` | `fidelizacao/` | 🟢 |
| `backend/src/controllers/fidelizacao.controller.ts` | `fidelizacao/` | 🟢 |
| `backend/src/controllers/fidelizacaoRegras.controller.ts` | `fidelizacao/` | 🟢 |
| `backend/src/services/fidelizacao.service.ts` (inferido) | `fidelizacao/` | 🟢 |
| `backend/src/services/fidelizacaoRegras.service.ts` (inferido) | `fidelizacao/` | 🟢 |
| `backend/src/services/fidelizacaoNotificacao.service.ts` (inferido) | `fidelizacao/` | 🟢 |
| `backend/src/services/fidelizacaoVoucherAuto.service.ts` (inferido) | `fidelizacao/` | 🟢 |

---

## Backend — Models

| Arquivo do legado | Unit correspondente | Cobertura |
|---------|---------------------|-----------|
| `backend/src/models/user.model.ts` | `autenticacao/` | 🟡 |
| `backend/src/models/whatsappSession.model.ts` | `whatsapp/` | 🟡 |
| `backend/src/models/conversation.model.ts` | `conversa/` | 🟢 |
| `backend/src/models/message.model.ts` | `conversa/` | 🟡 |
| `backend/src/models/document.model.ts` | `documento/` | 🟡 |
| `backend/src/models/documentChunk.model.ts` | `indexacao/` | 🟡 |
| `backend/src/models/agentConfig.model.ts` | `configuracao-agente/` | 🟡 |
| `backend/src/models/media.model.ts` | `midia/` | 🟡 |
| `backend/src/models/mediaSentTracking.model.ts` | `midia/` | 🟡 |
| `backend/src/models/topic.model.ts` | `topico/` | 🟡 |
| `backend/src/models/humanAttendant.model.ts` | `atendente-humano/` | 🟡 |
| `backend/src/models/attendantAlert.model.ts` | `atendente-humano/` | 🟡 |
| `backend/src/models/reaction.model.ts` | `whatsapp/` | 🟡 |
| `backend/src/models/vmLavCliente.model.ts` | `vmlav/` | 🟡 |
| `backend/src/models/vmLavPedido.model.ts` | `vmlav/` | 🟡 |
| `backend/src/models/vmLavCredentials.model.ts` | `vmlav/` | 🟡 |
| `backend/src/models/vmLavSincronizacaoLog.model.ts` | `vmlav/` | 🟡 |
| `backend/src/models/vmLavVoucher.model.ts` | `fidelizacao/` + `vmlav/` | 🟡 |
| `backend/src/models/fidelizacaoRegra.model.ts` | `fidelizacao/` | 🟡 |
| `backend/src/models/fidelizacaoTipoGatilho.model.ts` | `fidelizacao/` | 🟡 |
| `backend/src/models/fidelizacaoNotificacao.model.ts` | `fidelizacao/` | 🟡 |

---

## Backend — Utils e Infra

| Arquivo do legado | Unit correspondente | Cobertura |
|---------|---------------------|-----------|
| `backend/src/config/database.ts` | `n/a` — compartilhado por todas as units | `n/a` |
| `backend/src/middleware/errorHandler.ts` | `n/a` — transversal | `n/a` |
| `backend/src/utils/logger.ts` | `n/a` — transversal | `n/a` |
| `backend/src/utils/cpfUtils.ts` | `fidelizacao/` | 🟡 |
| `backend/src/utils/phoneUtils.ts` | `vmlav/`, `conversa/` | 🟡 |
| `backend/src/utils/puppeteer.util.ts` | `whatsapp/`, `vmlav/` | 🟡 |
| `backend/src/utils/chromaManager.ts` | `indexacao/` | 🟡 |
| `backend/src/services/chromadb.service.ts` | `indexacao/` | 🟡 |
| `backend/src/utils/conversationSocketEmitter.ts` | `conversa/` | 🟡 |
| `backend/src/utils/whatsappRawMessageLogger.ts` | `whatsapp/` | `n/a` |
| `backend/src/utils/whisperServiceManager.ts` | `n/a` — Whisper service | `n/a` |
| `backend/src/services/audioTranscription.service.ts` | `n/a` — Whisper service | `n/a` |
| `backend/src/utils/vmLavConnectionLogger.ts` | `vmlav/` | `n/a` |
| `backend/src/utils/vmLavTokenRenewal.ts` | `vmlav/` | 🟡 |
| `backend/src/index.ts` | `whatsapp/` (auto-reconnect + health check) | 🟡 |

---

## Scripts de manutenção/migração

| Arquivo do legado | Unit correspondente | Cobertura |
|---------|---------------------|-----------|
| `backend/src/utils/migrateIndexingColumns.ts` | `indexacao/` | `n/a` |
| `backend/src/utils/migrateModelColumns.ts` | `configuracao-agente/` | `n/a` |
| `backend/src/utils/migrateGenerationParams.ts` | `configuracao-agente/` | `n/a` |
| `backend/src/utils/migrateMediaIsActive.ts` | `midia/` | `n/a` |
| `backend/src/utils/migratePedidosUnique.ts` | `vmlav/` | `n/a` |
| `backend/src/utils/migrateVouchersTable.ts` | `fidelizacao/` | `n/a` |
| `backend/src/utils/migrateVoucherColumn.ts` | `fidelizacao/` | `n/a` |
| `backend/src/utils/migrateFidelidadeColumn.ts` | `fidelizacao/` | `n/a` |
| `backend/src/utils/migrateSyncLogEnum.ts` | `vmlav/` | `n/a` |
| `backend/src/utils/fixVouchersTableColumns.ts` | `fidelizacao/` | `n/a` |
| `backend/src/scripts/diagnose-whatsapp-sessions.ts` | `whatsapp/` | `n/a` |
| `backend/src/scripts/cleanup-whatsapp-sessions.ts` | `whatsapp/` | `n/a` |
| `backend/src/scripts/add-connection-failed-status.ts` | `whatsapp/` | `n/a` |
| `backend/src/scripts/debug_loyalty.ts` | `fidelizacao/` | `n/a` |
| `backend/src/scripts/diagnose-fidelidade-marcacao.ts` | `fidelizacao/` | `n/a` |
| `backend/src/scripts/diagnose-fidelidade-por-movimentos.ts` | `fidelizacao/` | `n/a` |
| `backend/src/scripts/sync-voucher-movimentos.ts` | `fidelizacao/` | `n/a` |
| `backend/src/scripts/check-voucher-list.ts` | `fidelizacao/` | `n/a` |
| `backend/src/scripts/initFidelizacaoDefaults.ts` | `fidelizacao/` | `n/a` |
| `backend/src/scripts/test-vmLav-*.ts` | `vmlav/` | `n/a` |
| `backend/src/scripts/test-whatsapp-*.ts` | `whatsapp/` | `n/a` |

---

## Frontend

| Arquivo do legado | Unit correspondente | Cobertura |
|---------|---------------------|-----------|
| `frontend/src/main.tsx` | `n/a` — entry point React | `n/a` |
| `frontend/src/**/*.tsx` | `n/a` — UI layer (não coberta por estas specs de API) | `n/a` |

---

## Whisper Service (Python)

| Arquivo do legado | Unit correspondente | Cobertura |
|---------|---------------------|-----------|
| `whisper-service/main.py` | `n/a` — serviço independente, não coberto por estas specs | `n/a` |

---

## Resumo de Cobertura

| Categoria | Total de arquivos | 🟢 Cobertos | 🟡 Parcial | `n/a` |
|-----------|-------------------|-------------|------------|-------|
| Rotas + Controllers + Services | ~50 | 47 | 3 | 0 |
| Models | 21 | 1 | 20 | 0 |
| Utils + Infra | ~15 | 0 | 7 | 8 |
| Scripts de manutenção | ~25 | 0 | 0 | 25 |
| Frontend | ~19 | 0 | 0 | 19 |
| Whisper Service | 2 | 0 | 0 | 2 |
| **Total estimado** | **~132** | **48** | **30** | **54** |

**Cobertura de arquivos com lógica de negócio:** ~93% (48 cobertos + 30 parciais de ~83 arquivos relevantes)
