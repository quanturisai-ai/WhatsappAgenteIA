# Teste de Chat — Design Técnico

> Gerado pelo Writer (Reversa) em 2026-05-16

## Interface

| Método | Caminho | Entrada | Saída | Status codes |
|--------|---------|---------|-------|--------------|
| POST | `/api/test-chat` | `{ message: string }` | `{ response, logInfo? }` | 200, 400, 401 |
| DELETE | `/api/test-chat` | — | `{ message }` | 200, 401 |
| GET | `/api/test-chat/log-info` | — | `{ logInfo }` | 200, 401 |

## Fluxo Principal

1. Controller recebe `message` do body
2. `TestChatService.sendMessage(userId, message)` é chamado
3. Internamente usa `RAGService.query()` com contexto de teste (sem conversa WhatsApp real)
4. Histórico de teste é mantido em memória ou banco por userId
5. Resposta do LLM retornada com opcionais de logInfo (tempo, modelo, tokens)

## Dependências

- `RAGService` — pipeline de busca + geração
- `AgentConfigService` — parâmetros do LLM (mesmo da conversa real)

## Riscos e Lacunas

- 🟡 Armazenamento do histórico de teste (em memória ou banco?) — não confirmado; impacta persistência após restart
- 🟡 Conteúdo exato de `logInfo` não confirmado pela leitura do code-analysis
