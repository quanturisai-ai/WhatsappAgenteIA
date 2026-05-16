# Mídia — Gestão de Mídias Automáticas

> Gerado pelo Writer (Reversa) em 2026-05-16
> Rastreabilidade: `backend/src/routes/media.routes.ts`, `backend/src/controllers/media.controller.ts`, `backend/src/services/media.service.ts`

## Visão Geral

Módulo que gerencia arquivos de mídia (imagens, vídeos, documentos, áudio) usados pelo agente para envio automático ou manual via WhatsApp. Mídias marcadas como `mandatory_send=true` são enviadas automaticamente no início de cada conversa, antes da resposta da IA. Mídias também podem ser enviadas via comandos especiais `[ENVIAR_MIDIA:id]` na resposta da IA.

## Responsabilidades

- Upload de arquivos de mídia com validação de tipo
- Listagem de mídias com status de indexação e flags
- Atualização de metadados (nome, flag mandatory_send, is_active)
- Exclusão de mídia (arquivo físico + registro no banco)
- Servir o arquivo físico para download/preview
- Indexação de conteúdo de mídia no ChromaDB (quando aplicável)

## Regras de Negócio

- Tipos suportados: `video`, `image`, `document`, `audio` 🟢
- Flag `mandatory_send=true`: mídia enviada automaticamente antes da resposta da IA em toda conversa ativa 🟢
- Flag `is_active`: controla disponibilidade para envio — mídias inativas não são enviadas nem pelo sistema nem pelo comando especial 🟡
- `source = 'outgoing'` para mídias cadastradas pelo operador; `source = 'incoming'` para mídias recebidas do WhatsApp 🟢
- `indexing_status` reflete o estado da indexação no ChromaDB 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|-----------|-------------------|
| RF-01 | Upload de mídia | Must | POST /api/medias/upload retorna 201 com metadados |
| RF-02 | Listar mídias do usuário | Must | GET /api/medias/list retorna array com flags e status |
| RF-03 | Servir arquivo físico | Should | GET /api/medias/:id/file retorna o arquivo com Content-Type correto |
| RF-04 | Atualizar metadados da mídia | Should | PUT /api/medias/:id atualiza nome, mandatory_send, is_active |
| RF-05 | Excluir mídia | Should | DELETE /api/medias/:id remove arquivo e registro |

## Critérios de Aceitação

```gherkin
Dado que o operador faz upload de uma imagem
Quando POST /api/medias/upload é chamado com multipart/form-data
Então a imagem é salva e metadados retornados com 201

Dado que uma mídia tem mandatory_send=true
Quando uma nova conversa começa com auto_responding=true
Então a mídia é enviada automaticamente via WhatsApp antes da resposta da IA

Dado que a IA retorna [ENVIAR_MIDIA:3]
Quando o pipeline de conversa processa a resposta
Então a mídia com id=3 é enviada ao contato (se is_active=true)
```

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `backend/src/routes/media.routes.ts` | 5 rotas | 🟢 |
| `backend/src/controllers/media.controller.ts` | `uploadMedia`, `listMedias`, `getMediaFile`, `updateMedia`, `deleteMedia`, `getUploadMiddleware` | 🟢 |
| `backend/src/services/media.service.ts` | `MediaService` | 🟢 |
