# Agente Zap - Ambiente de Implantação

Este diretório contém a estrutura de implantação do sistema Agente Zap para Windows.

## 📁 Estrutura

```
buid/
├── backend/          # Backend Node.js/TypeScript (copiar da raiz do projeto)
├── frontend/         # Frontend React/Vite (copiar da raiz do projeto)
├── scripts/          # Scripts de gerenciamento
├── logs/             # Logs centralizados
├── config/            # Arquivos de configuração
└── docs/              # Documentação adicional
```

## 🚀 Início Rápido

### 1. Preparação

**Opção 1: Usando o script de preparação (Recomendado)**
```batch
scripts\prepare.bat
```

**Opção 2: Manual**
1. Copie as pastas `backend/` e `frontend/` da raiz do projeto para `buid/`
2. Configure os arquivos `.env` em `backend/.env` e `frontend/.env`
3. Instale as dependências:
   ```batch
   scripts\install-dependencies.bat
   ```

### 2. Iniciar Serviços

Execute o script principal:
```batch
scripts\start-all.bat
```

### 3. Verificar Status

Para verificar o status dos serviços:
```batch
scripts\status.bat
```

### 4. Parar Serviços

Para parar todos os serviços:
```batch
scripts\stop-all.bat
```

### 5. Configurar Auto-start

Para configurar inicialização automática ao reiniciar o computador:
```batch
scripts\setup-auto-start.bat
```

**Nota**: Execute como Administrador para configurar o auto-start.

## 📝 Scripts Disponíveis

- `prepare.bat` - Copia backend/ e frontend/ para buid/ (preparação inicial)
- `install-dependencies.bat` - Instala todas as dependências necessárias
- `start-all.bat` - Inicia todos os serviços
- `stop-all.bat` - Para todos os serviços
- `restart-all.bat` - Reinicia todos os serviços
- `status.bat` - Verifica o status dos serviços
- `build-all.bat` - Compila backend e frontend para produção
- `setup-auto-start.bat` - Configura inicialização automática

## 🔧 Configuração

### Arquivos de Configuração

- `config/paths.json` - Caminhos dos executáveis
- `config/services.json` - Configuração dos serviços
- `config/environment.env` - Variáveis de ambiente (template)

### Portas

- **Backend**: 3301
- **Frontend**: 3300
- **ChromaDB**: 8000
- **Ollama**: 11434
- **MariaDB**: 3306

## 📊 Logs

Os logs são salvos em `logs/`:
- `backend.log` - Logs do backend
- `frontend.log` - Logs do frontend
- `system.log` - Logs do sistema

## ⚠️ Requisitos

- Node.js (v18+)
- Python (v3.13+)
- MariaDB/MySQL
- Ollama
- ChromaDB (gerenciado pelo backend)

## 📖 Documentação Completa

Consulte `PLANO_IMPLANTACAO_WINDOWS.md` na raiz do projeto para documentação completa.

