# ADR-002 — LLM Local via Ollama

> Status: Ativo
> Data: 🟡 INFERIDO — desde o início do projeto
> Confiança: 🟢 CONFIRMADO (implementação) / 🟡 INFERIDO (motivação)

## Contexto

O sistema precisa de um modelo de linguagem para gerar respostas automáticas ao WhatsApp e embeddings para busca semântica. Dados de clientes e informações de negócio são sensíveis.

## Decisão

Usar **Ollama** como servidor LLM local, com modelo **deepseek-r1** como padrão configurável para geração e embedding. O sistema se comunica com Ollama via REST API em `localhost:11434`.

## Justificativa

- **Privacidade**: dados de clientes (CPF, pedidos, conversas) não saem da infraestrutura local
- **Custo zero por token**: sem cobrança de API externa
- **Controle**: modelo e parâmetros (temperatura, top_p, top_k, repeat_penalty) são configuráveis por usuário
- **Flexibilidade de modelo**: qualquer modelo disponível no Ollama pode ser usado

## Consequências

**Positivas:**
- Privacidade total dos dados
- Sem custo de API
- Parâmetros do LLM configuráveis (temperatura, top_p, top_k, repeat_penalty)
- Modelo fica em memória por 5min após uso (`keep_alive: '5m'`) — evita latência de cold start

**Negativas/Riscos:**
- Requer hardware local robusto (GPU recomendada para modelos grandes)
- Sem fallback se Ollama falhar — mensagem recebe timeout de 60s sem resposta
- Qualidade do modelo deepseek-r1 em português pode ser inferior a GPT-4/Claude
- HTTP keep-alive com maxSockets=5 pode ser gargalo se múltiplos usuários simultâneos

## Alternativas Consideradas

- **OpenAI API**: rejeitada por custo recorrente e envio de dados a terceiros
- **Anthropic Claude API**: 🔴 LACUNA — não há evidência de avaliação
- **LM Studio**: 🔴 LACUNA — não avaliado
