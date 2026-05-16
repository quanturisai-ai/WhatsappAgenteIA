# Tópico — Design Técnico

> Gerado pelo Writer (Reversa) em 2026-05-16

## Interface

| Método | Caminho | Entrada | Saída | Status codes |
|--------|---------|---------|-------|--------------|
| GET | `/api/topics/list` | — | `Topic[]` | 200, 401 |
| GET | `/api/topics/:id` | `id: number` | `Topic` | 200, 401, 404 |
| POST | `/api/topics` | `TopicCreate` | `Topic` | 201, 400, 401 |
| PUT | `/api/topics/:id` | `Partial<Topic>` | `Topic` | 200, 401, 404 |
| DELETE | `/api/topics/:id` | `id: number` | `{ message }` | 200, 401, 404 |

**Tipo `Topic`:**
```ts
{
  id: number;
  user_id: number;
  title: string;
  description: string;
  trigger_keywords: string[];   // JSON array
  context: 'greeting' | 'farewell' | 'absence' | 'special_date' | 'custom';
  priority: number;             // 0–100
  is_active: boolean;
  indexing_status: 'pending' | 'indexed' | 'failed' | 'not_applicable';
  created_at: Date;
  updated_at: Date;
}
```

## Dependências

- MariaDB — persistência
- ChromaDB — coleção `user_{userId}_topics` (🟡 nome exato inferido por padrão ADR-006)
- `OllamaService` — embeddings para indexação

## Riscos e Lacunas

- 🟡 Nome exato da coleção ChromaDB para tópicos não confirmado — inferido como `user_{userId}_topics` por analogia com documentos
- 🟡 Mecanismo de disparo da indexação (automático no create/update ou manual?) não confirmado
