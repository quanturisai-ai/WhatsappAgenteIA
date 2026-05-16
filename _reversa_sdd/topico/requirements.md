# Tópico — Base de Conhecimento Estruturada

> Gerado pelo Writer (Reversa) em 2026-05-16
> Rastreabilidade: `backend/src/routes/topic.routes.ts`, `backend/src/controllers/topic.controller.ts`, `backend/src/services/topic.service.ts`

## Visão Geral

Módulo que gerencia tópicos de conhecimento estruturado — entradas menores e mais precisas que documentos, ideais para regras de negócio, FAQs e contextos específicos (saudação, despedida, datas especiais). Cada tópico pode ser ativado por palavras-chave e tem prioridade configurável no re-ranking do RAG.

## Responsabilidades

- CRUD completo de tópicos de conhecimento
- Configurar palavras-chave gatilho e contexto de aplicação
- Controlar prioridade no sistema de re-ranking do RAG
- Indexar conteúdo de tópicos no ChromaDB

## Regras de Negócio

- `trigger_keywords` é um campo JSON com array de strings que ativam o tópico 🟢
- `context` define quando o tópico é prioritário: `'greeting'`, `'farewell'`, `'absence'`, `'special_date'`, `'custom'` 🟢
- `priority` (0–100) define peso no re-ranking — maior prioridade = mais relevante na busca semântica 🟢
- `is_active=false` desativa o tópico sem excluí-lo 🟢
- `indexing_status` reflete estado no ChromaDB 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|-----------|-------------------|
| RF-01 | Listar tópicos do usuário | Must | GET /api/topics/list retorna array de tópicos |
| RF-02 | Buscar tópico por ID | Should | GET /api/topics/:id retorna tópico completo |
| RF-03 | Criar tópico | Must | POST /api/topics cria e retorna o novo tópico |
| RF-04 | Atualizar tópico | Must | PUT /api/topics/:id atualiza campos e retorna tópico atualizado |
| RF-05 | Excluir tópico | Should | DELETE /api/topics/:id remove tópico e vetores ChromaDB |

## Critérios de Aceitação

```gherkin
Dado que o operador cria um tópico com trigger_keywords=["horário", "funcionamento"]
Quando a IA processa uma mensagem contendo "horário"
Então o tópico é priorizado na busca semântica do ChromaDB

Dado que um tópico tem is_active=false
Quando a busca RAG é executada
Então o tópico não aparece nos resultados
```

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `backend/src/routes/topic.routes.ts` | 5 rotas | 🟢 |
| `backend/src/controllers/topic.controller.ts` | `listTopics`, `getTopic`, `createTopic`, `updateTopic`, `deleteTopic` | 🟢 |
| `backend/src/services/topic.service.ts` | `TopicService` | 🟢 |
