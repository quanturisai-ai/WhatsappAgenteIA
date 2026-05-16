# ADR-005 — Comandos Inline na Resposta da IA

> Status: Ativo
> Data: 🟡 INFERIDO — implementado junto com os módulos humanAttendant e media
> Confiança: 🟢 CONFIRMADO

## Contexto

O LLM precisa ser capaz de acionar ações do sistema (enviar mídia, alertar atendente, iniciar contato proativo) além de simplesmente retornar texto. A arquitetura usa um LLM genérico (Ollama) que não tem acesso direto a funções do sistema.

## Decisão

Usar **comandos embutidos na resposta do LLM** com sintaxe `[COMANDO:valor]`. O `ConversationService` processa a resposta via regex para extrair os comandos antes de enviar o texto ao usuário.

### Comandos implementados

| Comando | Ação |
|---------|------|
| `[ALERTAR_ATENDENTE:mensagem]` | Envia alerta ao atendente humano via WhatsApp e marca `needs_intervention=true` |
| `[ENVIAR_MIDIA:id]` | Envia arquivo de mídia com o ID especificado |
| `[CONTATO_PROATIVO: {"numero": "...", "mensagem": "..."}]` | Inicia conversa com número externo |

## Justificativa

- **Simplicidade**: sem necessidade de function calling ou streaming
- **Compatibilidade**: funciona com qualquer modelo Ollama que não suporte nativamente tool use
- **Controle**: o prompt do sistema instrui o LLM sobre quando e como usar cada comando

## Consequências

**Positivas:**
- Funciona com modelos sem suporte a tool use (ex: deepseek-r1)
- Fácil de adicionar novos comandos

**Negativas/Riscos:**
- 🟡 **Frágil a variações de formato**: o `CONTATO_PROATIVO` aceita 3 formatos diferentes de regex, evidenciando que o LLM não segue o formato consistentemente
- 🟡 **Sem validação de conteúdo**: o LLM pode gerar comandos com dados inválidos (número de telefone errado, ID de mídia inexistente)
- 🟡 **Poluição do texto**: se a regex falhar, o comando pode aparecer na mensagem enviada ao cliente
- Fallback de parsing JSON manual implementado no `CONTATO_PROATIVO` — sinal de instabilidade

## Alternativas Consideradas

- **Tool Use / Function Calling**: modelos que suportam (ex: GPT-4, Claude) retornam chamadas de função estruturadas — mais robusto mas requer modelo específico
- **Streaming com interceptação**: 🔴 LACUNA — não avaliado
