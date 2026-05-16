# ADR-007 — Debounce de Mensagens WhatsApp antes do LLM

> Status: Ativo
> Data: 🟡 INFERIDO
> Confiança: 🟢 CONFIRMADO (implementação) / 🟡 INFERIDO (motivação)

## Contexto

Usuários do WhatsApp frequentemente enviam mensagens fracionadas — dividem o que querem dizer em 2, 3 ou mais mensagens enviadas rapidamente em sequência. Sem debounce, cada fragmento geraria uma chamada separada ao LLM, produzindo respostas fragmentadas e incoerentes, além de sobrecarga desnecessária no Ollama.

## Decisão

Implementar **debounce** no `WhatsAppService`: mensagens do mesmo contato são acumuladas por um período (alguns segundos) antes de serem enviadas como uma mensagem única ao `ConversationService` e ao LLM.

## Justificativa

- **UX**: resposta coerente a mensagens enviadas em partes
- **Performance**: reduz o número de chamadas ao Ollama (cada chamada pode levar vários segundos)
- **Custo**: em modelos pagos, reduz o número de chamadas à API

## Consequências

**Positivas:**
- Resposta mais coerente quando cliente divide o texto em várias mensagens
- Menor carga no Ollama

**Negativas/Riscos:**
- 🟡 **Latência percebida**: o cliente espera alguns segundos a mais antes de receber resposta
- 🟡 **Valor do debounce não documentado**: o intervalo de acumulação não está documentado no código identificado — 🔴 LACUNA
- Se o cliente enviar mensagens com longa pausa entre elas, serão processadas separadamente (comportamento esperado)

## Alternativas Consideradas

- **Sem debounce**: gera múltiplas respostas fragmentadas
- **Streaming de resposta**: 🔴 LACUNA — não avaliado
