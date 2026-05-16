# Inventário do Projeto — WhatsappAgenteIA (Agente Zap)

> Gerado pelo Scout (Reversa) em 2026-05-16
> Nível de documentação: Completo

---

## Visão Geral

| Campo | Valor |
|-------|-------|
| Nome do Projeto | WhatsappAgenteIA (Agente Zap) |
| Descrição | Sistema de atendimento automatizado via WhatsApp com IA local |
| Linguagem Principal | TypeScript |
| Arquitetura | Monorepo multi-serviço (Backend Node.js + Frontend React + Microserviço Python) |
| Banco de Dados | MariaDB (relacional) + ChromaDB (vetorial) |
| Total de Arquivos Fonte | ~210 (TypeScript/TSX/Python/SQL/JS) |

---

## Estrutura de Diretórios

```
WhatsappAgenteIA/
├── backend/                     # Servidor Node.js + Express (TypeScript)
│   ├── src/
│   │   ├── index.ts             # Entry point — Express + Socket.IO
│   │   ├── config/
│   │   │   ├── database.ts      # Pool de conexão MariaDB
│   │   │   ├── database.schema.sql
│   │   │   └── migrations/      # 35 arquivos SQL de migração
│   │   ├── controllers/         # 14 controllers REST
│   │   ├── middleware/          # auth.ts, errorHandler.ts
│   │   ├── models/              # 22 modelos (acesso a dados)
│   │   ├── routes/              # 13 routers Express
│   │   ├── services/            # 17 services (lógica de negócio)
│   │   ├── scripts/             # Scripts de diagnóstico e manutenção
│   │   ├── types/               # index.ts (tipos compartilhados)
│   │   └── utils/               # Utilitários e schedulers
│   ├── .env                     # Variáveis de ambiente (não versionado)
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/                    # SPA React + Vite (TypeScript)
│   ├── src/
│   │   ├── App.tsx              # Entry point — React Router
│   │   ├── main.tsx             # Bootstrap React
│   │   ├── components/          # 11 componentes reutilizáveis
│   │   ├── pages/               # 7 páginas (Login, Dashboard, etc.)
│   │   ├── services/            # 13 services (chamadas HTTP + Socket)
│   │   ├── store/               # authStore.ts (Zustand)
│   │   ├── types/               # index.ts
│   │   └── utils/               # (vazio)
│   ├── package.json
│   └── vite.config.ts
│
├── whisper-service/             # Microserviço Python — Transcrição de Áudio
│   ├── main.py                  # FastAPI app — /transcribe endpoint
│   ├── transcribe_file.py       # CLI helper de transcrição
│   ├── requirements.txt         # FastAPI + faster-whisper + uvicorn
│   └── start.bat / start.sh     # Scripts de inicialização
│
├── config/                      # Configuração global do monorepo
│   ├── services.json            # Mapa de serviços (portas, processos)
│   ├── paths.json               # Caminhos relativos dos módulos
│   └── environment.env          # Variáveis globais de ambiente
│
├── scripts/                     # Scripts de automação (Windows .bat + .ps1)
│   ├── start_all.bat            # Inicia todos os serviços
│   ├── stop-all.bat / .ps1      # Para todos os serviços
│   ├── build-all.bat            # Build completo
│   └── install-dependencies.bat # Instala dependências
│
└── logs/                        # Logs de execução dos serviços
```

---

## Módulos do Backend

| Módulo | Rota REST | Controller | Service | Descrição |
|--------|-----------|------------|---------|-----------|
| `auth` | `/api/auth` | auth.controller.ts | auth.service.ts | Autenticação JWT |
| `whatsapp` | `/api/whatsapp` | whatsapp.controller.ts | whatsapp.service.ts, whatsapp.manager.ts | Integração WhatsApp Web |
| `conversation` | `/api/conversations` | conversation.controller.ts | conversation.service.ts | Gerenciamento de conversas |
| `document` | `/api/documents` | document.controller.ts | document.service.ts | Upload e gestão de documentos |
| `agentConfig` | `/api/agent-config` | agentConfig.controller.ts | — | Configuração do agente IA |
| `media` | `/api/medias` | media.controller.ts | media.service.ts | Mídia (imagens, áudio, vídeo) |
| `topic` | `/api/topics` | topic.controller.ts | topic.service.ts | Tópicos para categorização |
| `indexing` | `/api/indexing` | indexing.controller.ts | indexing.service.ts | Indexação RAG (ChromaDB) |
| `testChat` | `/api/test-chat` | testChat.controller.ts | — | Chat de testes com o agente |
| `ollama` | `/api/ollama` | ollama.controller.ts | ollama.service.ts | Interface com LLM local (Ollama) |
| `humanAttendant` | `/api/human-attendant` | humanAttendant.controller.ts | humanAttendant.service.ts | Transferência para atendente humano |
| `vmLav` | `/api/vmlav` | vmLav.controller.ts | vmLav.service.ts, vmLavConnectionManager.service.ts | Integração VM Lavanderia (API externa) |
| `fidelizacao` | `/api/fidelizacao` | fidelizacao.controller.ts, fidelizacaoRegras.controller.ts | fidelizacao.service.ts, fidelizacaoRegras.service.ts, fidelizacaoNotificacao.service.ts, fidelizacaoVoucherAuto.service.ts | Programa de fidelidade/loyalty |

---

## Páginas do Frontend

| Página | Rota | Arquivo | Descrição |
|--------|------|---------|-----------|
| Login | `/login` | Login.tsx | Autenticação do usuário |
| Dashboard | `/dashboard` | Dashboard.tsx | Painel principal de conversas (Kanban) |
| Configuração do Agente | `/config` | AgentConfig.tsx | Configuração do modelo e comportamento IA |
| Status WhatsApp | `/whatsapp` | WhatsAppStatus.tsx | Status da sessão WhatsApp + QR Code |
| Documentos | `/documents` | Documents.tsx | Upload e gestão de base de conhecimento |
| Mídias | `/medias` | Medias.tsx | Gerenciamento de mídias automáticas |
| Indexação | `/indexing` | Indexing.tsx | Controle do índice RAG |

---

## Pontos de Entrada

| Tipo | Arquivo | Porta | Descrição |
|------|---------|-------|-----------|
| Backend HTTP/WS | `backend/src/index.ts` | 3302 | Express + Socket.IO |
| Frontend SPA | `frontend/src/main.tsx` | 3300 | React + Vite |
| Whisper Service | `whisper-service/main.py` | — | FastAPI transcrição de áudio |

---

## Banco de Dados

| Tipo | Tecnologia | Uso |
|------|-----------|-----|
| Relacional | MariaDB (porta 3306) | Dados principais: usuários, conversas, mensagens, fidelizações, VM Lav |
| Vetorial | ChromaDB (porta 8000) | Embeddings para RAG (busca semântica em documentos) |

**Schema SQL:** `backend/src/config/database.schema.sql`
**Migrations (35 arquivos):** `backend/src/config/migrations/`

---

## Integrações Externas

| Integração | Tipo | Tecnologia | Módulo |
|-----------|------|-----------|--------|
| WhatsApp Web | Automação de browser | whatsapp-web.js + Puppeteer | `whatsapp` |
| Ollama | LLM local (REST API) | @langchain/ollama + langchain | `ollama`, RAG |
| ChromaDB | Banco vetorial | chromadb SDK | `indexing` |
| VM Lavanderia (VmLav) | API externa B2B | axios (HTTP) | `vmLav` |
| Whisper | Transcrição de áudio | faster-whisper (Python) | `audioTranscription` |

---

## Cobertura de Testes

| Métrica | Valor |
|---------|-------|
| Framework de testes | Nenhum identificado |
| Arquivos `.test.*` / `.spec.*` | 0 |
| Scripts de diagnóstico | 15+ scripts em `backend/src/scripts/` |
| Observação | 🔴 **LACUNA** — Ausência total de testes automatizados |

---

## Processos em Background

| Processo | Intervalo | Descrição |
|---------|-----------|-----------|
| Finalização de conversas antigas | 1 hora | Finaliza conversas sem atividade há +12h |
| Health check de sessões WhatsApp | 30 minutos | Verifica consistência status banco vs. cliente ativo |
| VM Lav Scheduler | 10 minutos | Sincronização de dados com API VM Lavanderia |
| VM Lav Token Renewal | Sob demanda | Renovação automática de tokens de autenticação |

---

## CI/CD e Containerização

| Item | Status |
|------|--------|
| CI/CD | 🔴 Não identificado |
| Docker / docker-compose | 🔴 Não identificado |
| Automação de deploy | Scripts `.bat` para Windows (start_all.bat, build-all.bat) |

---

## Contagem de Arquivos por Extensão

| Extensão | Quantidade | Onde |
|----------|-----------|------|
| `.ts` | 137 | backend/src + frontend/src |
| `.tsx` | 19 | frontend/src |
| `.sql` | 35 | backend/src/config/migrations |
| `.js` | 17 | scripts raiz + config |
| `.py` | 2 | whisper-service |
| **Total fonte** | **~210** | |

---

## Escala de Confiança

- 🟢 **CONFIRMADO** — Estrutura de pastas, package.json, arquivos de rota e index.ts lidos diretamente
- 🟡 **INFERIDO** — Comportamento interno de cada service (análise aprofundada pelo Arqueólogo)
- 🔴 **LACUNA** — Ausência de testes, CI/CD e documentação de API formal
