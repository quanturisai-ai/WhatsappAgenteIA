# Arquitetura — WhatsappAgenteIA (Agente Zap)

> Gerado pelo Arquiteto (Reversa) em 2026-05-16
> Nível de documentação: Completo

---

## Visão Geral

O **Agente Zap** é um sistema de atendimento automatizado via WhatsApp com IA local, especializado para lavanderias que operam com a plataforma VM Lavanderia. A arquitetura combina um bot conversacional com RAG (Retrieval-Augmented Generation), programa de fidelidade e automações de marketing.

**Estilo arquitetural:** Monorepo multi-serviço com 3 processos independentes e comunicação síncrona via HTTP REST / Socket.IO.

---

## Diagrama de Visão Geral

```
┌─────────────────────────────────────────────────────────────────┐
│                       SISTEMA AGENTE ZAP                        │
│                                                                  │
│  ┌──────────────┐    REST/WS    ┌─────────────────────────────┐ │
│  │  Frontend     │◄────────────►│  Backend Node.js/TS         │ │
│  │  React+Vite   │              │  Express + Socket.IO        │ │
│  │  :3300        │              │  :3302                      │ │
│  └──────────────┘              └──────────┬────────────────── ┘ │
│                                           │                      │
│              ┌────────────────────────────┼──────────────────┐  │
│              │                            │                  │  │
│              ▼                            ▼                  ▼  │
│  ┌──────────────────┐  ┌──────────────────────┐  ┌─────────────┐│
│  │  MariaDB :3306   │  │  ChromaDB :8000       │  │  Whisper    ││
│  │  (relacional)    │  │  (vetorial/RAG)       │  │  Python     ││
│  └──────────────────┘  └──────────────────────┘  │  FastAPI    ││
│                                                    └─────────────┘│
└──────────────────────────────────────────────────────────────────┘
         │                          │
         ▼ automação de browser     ▼ REST API
┌─────────────────────┐   ┌────────────────────┐
│  WhatsApp Web       │   │  Ollama :11434      │
│  (whatsapp-web.js)  │   │  (LLM local)        │
│  Puppeteer          │   │  deepseek-r1 / etc  │
└─────────────────────┘   └────────────────────┘
         │
         ▼ HTTPS API externa
┌─────────────────────┐
│  VM Lavanderia      │
│  vmtecnologia.io    │
│  (clientes, pedidos,│
│   vouchers)         │
└─────────────────────┘
```

---

## Componentes Principais

| Componente | Tecnologia | Porta | Responsabilidade |
|-----------|-----------|-------|-----------------|
| **Backend API** | Node.js + Express + TypeScript | 3302 | Orquestrador central: REST API, WebSocket, integrações, schedulers |
| **Frontend SPA** | React 18 + Vite + Tailwind CSS | 3300 | Dashboard de conversas (Kanban), config. do agente, upload de docs |
| **Whisper Service** | Python + FastAPI + faster-whisper | — | Transcrição de mensagens de áudio recebidas via WhatsApp |
| **MariaDB** | MySQL-compatible | 3306 | Persistência relacional: usuários, conversas, fidelidade, VM Lav |
| **ChromaDB** | Banco vetorial | 8000 | Índice de embeddings para busca semântica (RAG) |
| **Ollama** | LLM local | 11434 | Geração de texto e embeddings (modelo configurável) |

---

## Fluxo Principal de Mensagem

```
Cliente WhatsApp envia mensagem
    → whatsapp-web.js recebe evento `message`
    → WhatsAppService aplica debounce (acumula fragmentos)
    → ConversationService.processIncomingMessage()
        → verifica auto_responding (se false: ignora)
        → envia mídias obrigatórias (mandatory_send=true)
        → RAGService.search(query)
            → normaliza query (lowercase, remove stopwords PT-BR)
            → ChromaDB busca por similaridade vetorial (coleção user_{userId})
            → re-ranking híbrido: 0.5×keyword + 0.3×vector + 0.2×priority
        → monta prompt (business_info + contexto RAG + histórico)
        → OllamaService.generateResponse(prompt)  [timeout 60s]
        → extrai comandos inline da resposta [ALERTA_ATENDENTE, ENVIAR_MIDIA, CONTATO_PROATIVO]
        → executa side effects (alerta atendente, envia mídia, contato proativo)
        → WhatsAppService.sendMessage(resposta limpa)
    → Socket.IO emite evento para atualizar Dashboard em tempo real
```

---

## Padrões Arquiteturais

| Padrão | Onde | Descrição |
|--------|------|-----------|
| **MVC** | Backend | Controllers → Services → Models (sem ORM) |
| **Singleton** | `WhatsAppManager` | Uma instância por userId, proteção contra dupla inicialização |
| **Repository** | Models | Acesso a dados encapsulado por entidade |
| **Observer** | Socket.IO | Backend emite eventos para frontend em tempo real |
| **Command Pattern** | Respostas da IA | Comandos `[COMANDO:valor]` embutidos no texto e extraídos por regex |
| **Strategy** | RAG re-ranking | Pesos configuráveis por tipo de sinal (keyword, vector, priority) |
| **Scheduler/Cron** | Background jobs | Finalização de conversas, health check WhatsApp, sync VM Lav |
| **Debounce** | WhatsApp mensagens | Acumula mensagens fracionadas antes de chamar LLM |

---

## Módulos do Backend

| Módulo | Linhas aprox. | Complexidade | Dependências críticas |
|--------|--------------|--------------|----------------------|
| `fidelizacao` | ~800 | 🔴 Alta | vmLav, whatsapp, MariaDB |
| `conversation` | ~600 | 🔴 Alta | RAG, ollama, whatsapp, media, humanAttendant |
| `whatsapp` | ~500 | 🔴 Alta | whatsapp-web.js, Puppeteer, Socket.IO |
| `vmLav` | ~400 | 🟡 Média | Puppeteer, MariaDB |
| `indexing` (RAG) | ~350 | 🟡 Média | ChromaDB, ollama |
| `document` | ~200 | 🟢 Baixa | pdf-parse, mammoth, ChromaDB |
| `auth` | ~150 | 🟢 Baixa | bcrypt, JWT |
| `media` | ~150 | 🟢 Baixa | multer, ChromaDB |
| `topic` | ~120 | 🟢 Baixa | ChromaDB |
| `agentConfig` | ~100 | 🟢 Baixa | MariaDB |
| `ollama` | ~100 | 🟢 Baixa | @langchain/ollama |
| `humanAttendant` | ~80 | 🟢 Baixa | whatsapp |
| `testChat` | ~60 | 🟢 Baixa | RAG, ollama |

---

## Processos em Background

| Processo | Intervalo | Módulo | Descrição |
|---------|-----------|--------|-----------|
| Finalização de conversas | 1 hora | `conversation` | Finaliza conversas sem atividade há >max_age_hours (12h) |
| Health check WhatsApp | 30 minutos | `whatsapp` | Verifica consistência banco vs. cliente ativo em memória |
| VM Lav Scheduler | 10 minutos | `vmLav` | Sincroniza clientes e pedidos da API vmtecnologia.io |
| Automações fidelidade | Sob demanda | `fidelizacao` | Dispara regras de marketing baseadas em gatilhos |
| Keep-alive sessão | 15 minutos | `whatsapp` | Verifica se sessão WhatsApp está ativa; 4 falhas = connection_failed |

---

## Dívidas Técnicas

| ID | Severidade | Descrição | Módulo |
|----|-----------|-----------|--------|
| DT-01 | 🔴 Crítico | Ausência total de testes automatizados (0 arquivos .test/.spec) | Global |
| DT-02 | 🔴 Crítico | JWT_SECRET com fallback `'default-secret'` se env não configurado | `auth` |
| DT-03 | 🔴 Crítico | Senha VM Lav armazenada em texto plano no banco | `vmLav` |
| DT-04 | 🔴 Alto | `idEmpresa=1737` e `empresaLocalizador='lavateriajdnovomundo'` hardcoded | `vmLav` |
| DT-05 | 🔴 Alto | Autenticação VM Lav via Puppeteer scraping — frágil a mudanças de UI | `vmLav` |
| DT-06 | 🟡 Médio | Sem rate limiting — vulnerável a brute force e abuso de endpoints custosos | `auth`, API |
| DT-07 | 🟡 Médio | Sem retry quando Ollama falha (timeout 60s) — cliente fica sem resposta | `conversation` |
| DT-08 | 🟡 Médio | Lógica defensiva de parsing MariaDB repetida em todos os 20+ models | `models` |
| DT-09 | 🟡 Médio | Token JWT aceito via query string `?token=` — expõe token em logs/proxies | `auth` |
| DT-10 | 🟡 Médio | Campo `hours` em agent_config presente mas sem verificação de horário no pipeline | `conversation` |
| DT-11 | 🟡 Médio | Pesos do re-ranking RAG hardcoded (0.5/0.3/0.2) — não configuráveis | `indexing` |
| DT-12 | 🟢 Baixo | Sem CI/CD — deploy manual via scripts .bat | Global |
| DT-13 | 🟢 Baixo | Sem containerização (Docker) — dependências locais de sistema | Global |
| DT-14 | 🟢 Baixo | Estado `paused` no ENUM de conversas sem uso identificado | `conversation` |
| DT-15 | 🟢 Baixo | Validade de voucher com magic number `validadeDias ?? 34` sem documentação | `fidelizacao` |

---

## Escala de Confiança

- 🟢 **CONFIRMADO** — extraído diretamente de código-fonte e artefatos anteriores do Reversa
- 🟡 **INFERIDO** — baseado em padrões e análise indireta
- 🔴 **LACUNA** — requer validação humana
