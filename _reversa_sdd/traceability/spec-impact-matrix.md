# Spec Impact Matrix — WhatsappAgenteIA (Agente Zap)

> Gerado pelo Arquiteto (Reversa) em 2026-05-16
> Mostra: qual componente impacta qual quando modificado

---

## Como Ler

- **Linha** = Componente modificado
- **Coluna** = Componente impactado
- `🔴 ALTO` — mudança quase certamente quebra ou requer atualização do componente impactado
- `🟡 MÉDIO` — mudança pode afetar dependendo do escopo
- `🟢 BAIXO` — impacto improvável, apenas indireto
- ` ` — sem relação direta

---

## Matriz de Impacto

| Modificar ↓ \ Impacta → | auth | whatsapp | conversation | rag/indexing | ollama | document | media | topic | agentConfig | humanAttendant | vmLav | fidelizacao | Frontend | MariaDB | ChromaDB |
|--------------------------|------|----------|--------------|--------------|--------|----------|-------|-------|-------------|----------------|-------|-------------|---------|---------|---------|
| **auth** | — | 🟢 BAIXO | 🟢 BAIXO | | | | | | | | | | 🟡 MÉDIO | 🟡 MÉDIO | |
| **whatsapp** | | — | 🔴 ALTO | | | | | | | 🔴 ALTO | | 🔴 ALTO | 🔴 ALTO | 🟡 MÉDIO | |
| **conversation** | | 🟡 MÉDIO | — | 🔴 ALTO | 🔴 ALTO | | 🔴 ALTO | | 🟡 MÉDIO | 🔴 ALTO | | 🟡 MÉDIO | 🟡 MÉDIO | 🔴 ALTO | 🟡 MÉDIO |
| **rag/indexing** | | | 🔴 ALTO | — | 🔴 ALTO | 🔴 ALTO | 🟡 MÉDIO | 🔴 ALTO | 🟡 MÉDIO | | | | 🟡 MÉDIO | | 🔴 ALTO |
| **ollama** | | | 🔴 ALTO | 🔴 ALTO | — | 🔴 ALTO | | 🟡 MÉDIO | 🟡 MÉDIO | | | | | | 🟡 MÉDIO |
| **document** | | | | 🔴 ALTO | 🟡 MÉDIO | — | | | | | | | 🟡 MÉDIO | 🟡 MÉDIO | 🔴 ALTO |
| **media** | | 🟡 MÉDIO | 🔴 ALTO | 🟡 MÉDIO | | | — | | | | | | 🟡 MÉDIO | 🟡 MÉDIO | 🟡 MÉDIO |
| **topic** | | | 🟡 MÉDIO | 🔴 ALTO | 🟡 MÉDIO | | | — | | | | | 🟡 MÉDIO | 🟡 MÉDIO | 🔴 ALTO |
| **agentConfig** | | | 🔴 ALTO | 🟡 MÉDIO | 🔴 ALTO | | | | — | | | | 🔴 ALTO | 🟡 MÉDIO | |
| **humanAttendant** | | 🔴 ALTO | 🔴 ALTO | | | | | | | — | | | 🟡 MÉDIO | 🟡 MÉDIO | |
| **vmLav** | | | 🟡 MÉDIO | | | | | | | | — | 🔴 ALTO | 🟡 MÉDIO | 🔴 ALTO | |
| **fidelizacao** | | 🔴 ALTO | 🟡 MÉDIO | | | | | | | | 🔴 ALTO | — | 🔴 ALTO | 🔴 ALTO | |
| **MariaDB schema** | 🔴 ALTO | 🔴 ALTO | 🔴 ALTO | 🟡 MÉDIO | | 🔴 ALTO | 🔴 ALTO | 🔴 ALTO | 🔴 ALTO | 🔴 ALTO | 🔴 ALTO | 🔴 ALTO | 🔴 ALTO | — | |
| **ChromaDB schema** | | | 🟡 MÉDIO | 🔴 ALTO | 🟡 MÉDIO | 🔴 ALTO | 🟡 MÉDIO | 🔴 ALTO | 🟡 MÉDIO | | | | 🟡 MÉDIO | | — |
| **JWT/Auth middleware** | 🔴 ALTO | 🟡 MÉDIO | 🟡 MÉDIO | 🟡 MÉDIO | 🟡 MÉDIO | 🟡 MÉDIO | 🟡 MÉDIO | 🟡 MÉDIO | 🟡 MÉDIO | 🟡 MÉDIO | 🟡 MÉDIO | 🟡 MÉDIO | 🔴 ALTO | | |

---

## Top 5 — Componentes de Maior Impacto (ao modificar)

| Rank | Componente | Impactos Altos | Observação |
|------|-----------|---------------|-----------|
| 1 | **MariaDB schema** | 11 componentes | Qualquer alteração de schema impacta todos os models |
| 2 | **conversation** | 7 componentes | Orquestra o pipeline central — mudanças propagam para RAG, Ollama, mídia, WhatsApp |
| 3 | **whatsapp** | 5 componentes | Sessão WhatsApp é dependência crítica de envio (fidelizacao, humanAttendant, conversation) |
| 4 | **fidelizacao** | 4 componentes | Módulo mais complexo, depende de vmLav e whatsapp em cascata |
| 5 | **rag/indexing** | 4 componentes | Motor de busca usado por conversation e dependente de ollama+chromadb |

---

## Top 5 — Componentes Mais Impactados (ao receber mudanças)

| Rank | Componente | Recebe Impactos Altos de | Observação |
|------|-----------|--------------------------|-----------|
| 1 | **MariaDB** | conversation, document, media, topic, agentConfig, humanAttendant, vmLav, fidelizacao, auth | Toda mudança de dados impacta o banco |
| 2 | **conversation** | whatsapp, rag/indexing, agentConfig, MariaDB | Ponto central do pipeline — recebe de todos os lados |
| 3 | **ChromaDB** | rag/indexing, document, topic, media | Toda mudança no índice impacta a busca semântica |
| 4 | **Frontend** | whatsapp, conversation, agentConfig, fidelizacao | Dashboard depende de múltiplos módulos de backend |
| 5 | **fidelizacao** | vmLav, whatsapp, MariaDB | Módulo de alto acoplamento — depende de 3 componentes críticos |

---

## Áreas de Risco por Alta Coesão

### Pipeline de mensagens (risco cascade)
```
Mensagem WhatsApp recebida
    → whatsapp [change here cascades to] → conversation → rag/indexing → ollama
                                                        → media → ChromaDB
                                                        → humanAttendant → whatsapp
                                                        → MariaDB
```
Qualquer mudança no `WhatsAppService` ou `ConversationService` pode quebrar o pipeline completo.

### Ciclo fidelidade + VM Lav (risco de integração)
```
vmLav sync → MariaDB (vm_lav_clientes, vm_lav_pedidos)
    → fidelizacao (cálculo de saldo, gatilhos)
        → whatsapp (disparo de mensagens)
            → fidelizacaoNotificacao (registro anti-spam)
```
Mudanças na API VM Lav (autenticação, formato de dados) propagam para fidelizacao e para o envio WhatsApp.

### Modelo LLM (risco de qualidade)
```
agentConfig (embedding_model, generation_model, temperatura)
    → ollama → rag/indexing (qualidade dos embeddings)
             → conversation (qualidade das respostas)
```
Trocar o modelo Ollama sem reindexar o ChromaDB gera incompatibilidade de embeddings.

---

## Escala de Confiança

- 🟢 **CONFIRMADO** — relacionamentos verificados no código-fonte e nos artefatos de análise anteriores
- 🟡 **INFERIDO** — alguns impactos de baixa intensidade baseados em análise de dependência indireta
