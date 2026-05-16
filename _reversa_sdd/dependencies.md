# Dependências — WhatsappAgenteIA (Agente Zap)

> Gerado pelo Scout (Reversa) em 2026-05-16

---

## Backend (`backend/package.json`)

### Dependências de Produção

| Pacote | Versão | Papel |
|--------|--------|-------|
| `express` | ^4.18.2 | Framework HTTP REST API |
| `socket.io` | ^4.7.2 | Comunicação bidirecional WebSocket |
| `whatsapp-web.js` | ^1.34.6 | Automação WhatsApp Web via browser |
| `puppeteer` | ^24.34.0 | Browser headless (requerido pelo whatsapp-web.js) |
| `mariadb` | ^3.2.0 | Driver de banco de dados MariaDB |
| `chromadb` | ^1.8.1 | Cliente ChromaDB (banco vetorial) |
| `langchain` | ^1.0.2 | Framework de orquestração LLM |
| `@langchain/ollama` | ^0.2.4 | Integração LangChain com Ollama (LLM local) |
| `jsonwebtoken` | ^9.0.2 | Autenticação JWT |
| `bcryptjs` | ^2.4.3 | Hash de senhas |
| `dotenv` | ^16.3.1 | Carregamento de variáveis de ambiente |
| `cors` | ^2.8.5 | Middleware CORS |
| `multer` | ^1.4.5-lts.1 | Upload de arquivos multipart |
| `axios` | ^1.6.2 | Cliente HTTP (chamadas a APIs externas) |
| `form-data` | ^4.0.0 | Suporte a multipart/form-data |
| `winston` | ^3.11.0 | Logger estruturado |
| `mammoth` | ^1.6.0 | Extração de texto de documentos Word (.docx) |
| `pdf-parse` | ^1.1.1 | Extração de texto de PDFs |
| `qrcode-terminal` | ^0.12.0 | Exibição de QR Code no terminal |

### Dependências de Desenvolvimento

| Pacote | Versão | Papel |
|--------|--------|-------|
| `typescript` | ^5.3.3 | Compilador TypeScript |
| `ts-node-dev` | ^2.0.0 | Hot-reload para desenvolvimento TypeScript |
| `@types/express` | ^4.17.21 | Tipos TypeScript para Express |
| `@types/node` | ^20.10.5 | Tipos TypeScript para Node.js |
| `@types/jsonwebtoken` | ^9.0.5 | Tipos para jsonwebtoken |
| `@types/bcryptjs` | ^2.4.6 | Tipos para bcryptjs |
| `@types/cors` | ^2.8.17 | Tipos para cors |
| `@types/multer` | ^1.4.11 | Tipos para multer |
| `@types/puppeteer` | ^7.0.4 | Tipos para puppeteer |
| `@types/qrcode-terminal` | ^0.12.2 | Tipos para qrcode-terminal |

---

## Frontend (`frontend/package.json`)

### Dependências de Produção

| Pacote | Versão | Papel |
|--------|--------|-------|
| `react` | ^18.2.0 | Framework UI |
| `react-dom` | ^18.2.0 | Renderização DOM do React |
| `react-router-dom` | ^6.21.0 | Roteamento SPA |
| `socket.io-client` | ^4.7.2 | Cliente WebSocket (par com backend Socket.IO) |
| `axios` | ^1.6.2 | Cliente HTTP para chamadas à API |
| `zustand` | ^4.4.7 | Gerenciamento de estado global |
| `lucide-react` | ^0.303.0 | Biblioteca de ícones |
| `qrcode.react` | ^3.1.0 | Componente de exibição de QR Code |
| `react-hot-toast` | ^2.4.1 | Notificações toast |
| `recharts` | ^3.4.1 | Gráficos e visualizações |
| `date-fns` | ^3.0.0 | Utilitários de data/hora |

### Dependências de Desenvolvimento

| Pacote | Versão | Papel |
|--------|--------|-------|
| `vite` | ^5.0.8 | Bundler e dev server |
| `@vitejs/plugin-react` | ^4.2.1 | Plugin React para Vite |
| `typescript` | ^5.3.3 | Compilador TypeScript |
| `tailwindcss` | ^3.4.0 | Framework CSS utility-first |
| `autoprefixer` | ^10.4.16 | Plugin PostCSS para prefixes CSS |
| `postcss` | ^8.4.32 | Pós-processador CSS |
| `eslint` | ^8.55.0 | Linter JavaScript/TypeScript |
| `eslint-plugin-react-hooks` | ^4.6.0 | Regras ESLint para React Hooks |
| `@typescript-eslint/parser` | ^6.14.0 | Parser TypeScript para ESLint |

---

## Whisper Service (`whisper-service/requirements.txt`)

| Pacote | Versão | Papel |
|--------|--------|-------|
| `fastapi` | 0.115.0 | Framework HTTP assíncrono (Python) |
| `uvicorn[standard]` | 0.30.0 | Servidor ASGI para FastAPI |
| `faster-whisper` | 1.1.0 | Transcrição de áudio via OpenAI Whisper (CTranslate2) |
| `python-multipart` | 0.0.12 | Suporte a upload multipart no FastAPI |
| `requests` | >=2.28.0 | Cliente HTTP Python |

---

## Serviços de Infraestrutura (externos ao código)

| Serviço | Tipo | Porta | Requisito |
|---------|------|-------|-----------|
| MariaDB | Banco de dados relacional | 3306 | Obrigatório |
| Ollama | LLM local (servidor) | 11434 | Obrigatório |
| ChromaDB | Banco vetorial | 8000 | Gerenciado pelo backend |

---

## Análise de Riscos de Dependências

| Risco | Pacote | Nível | Observação |
|-------|--------|-------|-----------|
| Quebras de API do WhatsApp | `whatsapp-web.js` | 🔴 Alto | Depende de engenharia reversa do WhatsApp Web — pode parar a qualquer momento |
| Compatibilidade Puppeteer | `puppeteer ^24` | 🟡 Médio | Versão alta pode ter incompatibilidade com whatsapp-web.js |
| Ausência de pinagem | Todas as versões `^` | 🟡 Médio | Atualizações automáticas de minor/patch podem introduzir regressões |
| LangChain API instável | `langchain ^1.0.2` | 🟡 Médio | LangChain tem histórico de mudanças de API frequentes |
| GPU/CUDA para Whisper | `faster-whisper` | 🟡 Médio | Configurado para CUDA por padrão; fallback para CPU disponível |
