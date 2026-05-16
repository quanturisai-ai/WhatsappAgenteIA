# Configuração de Variáveis de Ambiente

Crie um arquivo `.env` na pasta `backend` com as seguintes variáveis:

## Variáveis Obrigatórias

```env
# Servidor
PORT=3002
NODE_ENV=development

# Banco de Dados MariaDB
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=sua_senha_aqui
DB_NAME=agente_zap

# JWT (Autenticação)
JWT_SECRET=escolha_uma_chave_secreta_forte_aqui
JWT_EXPIRES_IN=7d

# Ollama (IA Local)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=deepseek-r1

# ChromaDB (Banco Vetorial)
CHROMA_HOST=localhost
CHROMA_PORT=8000
CHROMA_DB_PATH=./chroma_db

# WhatsApp (Sessões)
WHATSAPP_SESSION_PATH=./whatsapp_sessions

# CORS (Frontend)
FRONTEND_URL=http://localhost:3000
```

## Descrição das Variáveis

- **PORT**: Porta onde o backend será executado (padrão: 3002)
- **NODE_ENV**: Ambiente de execução (development/production)
- **DB_***: Configurações de conexão com MariaDB
- **JWT_SECRET**: Chave secreta para assinatura de tokens JWT (use uma chave forte e aleatória)
- **JWT_EXPIRES_IN**: Tempo de expiração do token (ex: 7d, 24h)
- **OLLAMA_BASE_URL**: URL base do Ollama (geralmente http://localhost:11434)
- **OLLAMA_MODEL**: Nome do modelo Mistral configurado no Ollama
- **CHROMA_DB_PATH**: Caminho onde os dados do ChromaDB serão armazenados
- **WHATSAPP_SESSION_PATH**: Caminho onde as sessões do WhatsApp serão salvas
- **FRONTEND_URL**: URL do frontend para configuração de CORS

## Segurança

⚠️ **Importante**: Nunca commite o arquivo `.env` no repositório. Ele já está incluído no `.gitignore`.

