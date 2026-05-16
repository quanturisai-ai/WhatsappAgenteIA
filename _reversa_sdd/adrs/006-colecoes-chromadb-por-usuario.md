# ADR-006 — Coleções ChromaDB Isoladas por Usuário

> Status: Ativo
> Data: 🟡 INFERIDO — junto com a adição do módulo indexing
> Confiança: 🟢 CONFIRMADO

## Contexto

O sistema suporta múltiplos usuários (donos de lavanderias), cada um com sua própria base de conhecimento (documentos, tópicos, mídias). As buscas RAG devem ser isoladas por usuário — um usuário não pode recuperar documentos de outro.

## Decisão

Cada usuário tem uma **coleção ChromaDB exclusiva** com o nome `user_{userId}`. Todas as operações de indexação e busca usam essa coleção como namespace.

## Justificativa

- **Isolamento natural**: ChromaDB organiza vetores em coleções — usar uma por usuário garante separação física dos embeddings
- **Simplicidade**: sem necessidade de filtros por `user_id` nas queries ChromaDB — o namespace é suficiente
- **Performance**: buscas em coleção menor são mais rápidas

## Consequências

**Positivas:**
- Isolamento garantido entre usuários
- Sem risco de vazamento de documentos entre contas
- Queries ChromaDB mais simples (sem filtro extra)

**Negativas/Riscos:**
- 🟡 **Escalabilidade**: muitos usuários com poucas docs cada gera overhead de gerenciamento de coleções
- 🟡 **Sem compartilhamento**: impossível ter base de conhecimento compartilhada entre usuários (ex: documentação geral da plataforma VM Lav)
- Limpeza de coleções ao deletar usuário requer operação manual no ChromaDB

## Alternativas Consideradas

- **Coleção única com filtro por user_id**: maior flexibilidade mas requer metadata filtering em cada query
- **Um ChromaDB por usuário**: maior isolamento mas inviável operacionalmente
