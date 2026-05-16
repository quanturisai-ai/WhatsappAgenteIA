# Teste de Chat — Simulação do Agente IA

> Gerado pelo Writer (Reversa) em 2026-05-16
> Rastreabilidade: `backend/src/routes/testChat.routes.ts`, `backend/src/controllers/testChat.controller.ts`, `backend/src/services/testChat.service.ts`

## Visão Geral

Módulo que permite testar o comportamento do agente IA sem precisar de uma sessão WhatsApp ativa. O operador envia mensagens diretamente pela interface web e recebe respostas do LLM em tempo real, usando o mesmo pipeline de conversa (RAG + Ollama). Útil para validar configurações do agente antes de ativar para clientes.

## Responsabilidades

- Receber mensagem de teste e processá-la via pipeline RAG (sem WhatsApp)
- Manter histórico de conversa de teste isolado por usuário
- Limpar histórico de teste
- Retornar informações de log sobre o processo de geração

## Regras de Negócio

- Histórico de teste é isolado por usuário — não interfere em conversas reais 🟢
- Usa o mesmo pipeline RAG e os mesmos parâmetros de AgentConfig 🟢
- Histórico de teste pode ser limpo pelo operador (DELETE) 🟢
- `log-info` retorna metadados do processo (tempo de resposta, tokens, modelo usado) 🟡

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|-----------|-------------------|
| RF-01 | Enviar mensagem de teste e receber resposta da IA | Must | POST / retorna resposta gerada pelo LLM via RAG |
| RF-02 | Limpar histórico de teste | Should | DELETE / remove todo o histórico de teste do usuário |
| RF-03 | Consultar informações de log | Could | GET /log-info retorna metadados da última geração |

## Critérios de Aceitação

```gherkin
Dado que o usuário envia "qual o horário?" no teste de chat
Quando POST /api/test-chat é chamado
Então a resposta é a geração do LLM baseada nos documentos e tópicos indexados

Dado que o histórico de teste tem 10 mensagens
Quando DELETE /api/test-chat é chamado
Então o histórico é limpo e a próxima sessão começa sem contexto anterior
```

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `backend/src/routes/testChat.routes.ts` | 3 rotas | 🟢 |
| `backend/src/controllers/testChat.controller.ts` | `testChat`, `clearTestChat`, `getTestLogInfo` | 🟢 |
| `backend/src/services/testChat.service.ts` | `TestChatService` | 🟢 |
