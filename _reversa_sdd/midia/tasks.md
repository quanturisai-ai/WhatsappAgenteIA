# Mídia — Tarefas de Implementação

> Gerado pelo Writer (Reversa) em 2026-05-16

## Pré-requisitos

- [ ] Diretório `uploads/medias/` com permissão de escrita
- [ ] Tabela `medias` criada no banco

## Tarefas

- [ ] T-01 — Configurar Multer para mídias: validação de tipo (video/image/document/audio), destino `uploads/medias/`
  - Origem: `backend/src/controllers/media.controller.ts:getUploadMiddleware`
  - Critério de pronto: tipos corretos aceitos; outros rejeitados com 400
  - Confiança: 🟢

- [ ] T-02 — Implementar CRUD: `uploadMedia`, `listMedias`, `updateMedia`, `deleteMedia`
  - Origem: `backend/src/services/media.service.ts`
  - Critério de pronto: operações CRUD funcionam com isolamento por userId
  - Confiança: 🟢

- [ ] T-03 — Implementar `getMediaFile`: servir arquivo estático com Content-Type correto
  - Origem: `backend/src/controllers/media.controller.ts:getMediaFile`
  - Critério de pronto: GET /:id/file retorna bytes do arquivo com header correto
  - Confiança: 🟢

- [ ] T-04 — Implementar `sendMandatoryMedias(userId, wpService)`: SELECT mandatory_send=true + is_active=true → envio via WhatsApp
  - Origem: `backend/src/services/media.service.ts` (chamado por ConversationService)
  - Critério de pronto: mídias obrigatórias enviadas automaticamente no início das conversas
  - Confiança: 🟢

- [ ] T-05 — **Corrigir bug:** `[ENVIAR_MIDIA:id]` em `ConversationService` deve verificar `is_active=true` além de `status='completed'` antes de enviar a mídia
  - Bug confirmado em: `backend/src/services/conversation.service.ts:259`
  - Critério de pronto: mídia com `is_active=false` não é enviada mesmo que a IA solicite via `[ENVIAR_MIDIA:id]`
  - Prioridade: **Must** (comportamento incorreto confirmado)
  - Confiança: 🟢

## Lacunas Pendentes (🔴)

- Limite de tamanho do upload de mídia não confirmado — verificar Multer config (provável 50MB pelo padrão Multer)
