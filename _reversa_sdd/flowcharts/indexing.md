# Flowchart — Módulo `indexing` (RAG)

> Gerado pelo Arqueólogo (Reversa) em 2026-05-16

## Fluxo: Busca Híbrida (RAGService)

```mermaid
flowchart TD
    A[processMessageAndRespond\nquery do cliente] --> B[normalizeQuery\nremove stopwords PT-BR]
    B --> C[Buscar tópicos com\ntrigger_keywords match\nno banco MariaDB]
    C --> D[OllamaService.generateEmbedding\npara a query]
    D --> E[ChromaDBService.query\nbusca vetorial na coleção do usuário]
    E --> F[rankTopics\nRe-ranking híbrido]

    F --> G{Para cada resultado}
    G --> H[Score = 0.5×trigger_kw\n+ 0.3×vector_sim\n+ 0.2×priority]
    H --> I[Ordenar por score DESC]

    I --> J[Buscar dados do AgentConfig\npersonality, business_info, etc.]
    J --> K[Montar system prompt\ncom contexto do negócio]
    K --> L[Montar user prompt\ncom tópicos + histórico + mensagem]
    L --> M{includeHistory?}
    M -- sim --> N[Adicionar N mensagens\nanteriores da conversa]
    M -- não --> O[Omitir histórico]
    N --> P
    O --> P[OllamaService.generateResponse\nTimeout: 60s]
    P --> Q[Resposta bruta do LLM]
```

## Fluxo: Indexação de Documento

```mermaid
flowchart TD
    A[Upload de arquivo\n.txt / .pdf / .docx] --> B[extractText\naby pdf-parse ou mammoth]
    B --> C[chunkText\nDividir em blocos de 1000 chars]
    C --> D{Para cada chunk}
    D --> E[OllamaService.generateEmbedding\nvetor do chunk]
    E --> F[ChromaDBService.addDocuments\ninserir na coleção user_N]
    F --> G[Salvar DocumentChunk\nno MariaDB]
    G --> H[Atualizar Document.status\n→ completed]
```

## Fórmula de Score — Re-ranking

```
Score = (TRIGGER_KW_WEIGHT × hasTriggerKeyword)
      + (VECTOR_SIM_WEIGHT × (1 - min(distance, 1)))
      + (PRIORITY_WEIGHT × min(priority/100, 1))

Onde:
  TRIGGER_KW_WEIGHT = 0.5
  VECTOR_SIM_WEIGHT = 0.3
  PRIORITY_WEIGHT   = 0.2
  MAX_DISTANCE_THRESHOLD = 0.8
```
