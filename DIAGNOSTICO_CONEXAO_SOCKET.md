# Diagnóstico da conexão Socket.IO / Backend (porta 3301)

**Data:** 31/01/2026  
**Objetivo:** Verificar por que o Firefox às vezes não estabelece conexão com `ws://localhost:3301/socket.io/` no carregamento da página.

---

## 1. Porta 3301 em escuta

```
TCP    0.0.0.0:3301           0.0.0.0:0              LISTENING
TCP    [::]:3301              [::]:0                 LISTENING
```

**Resultado:** O backend está escutando na porta 3301 (IPv4 e IPv6). Há várias conexões ESTABLISHED e TIME_WAIT (clientes conectando e reconectando).

---

## 2. HTTP – API Health

- **Comando:** `Invoke-WebRequest http://localhost:3301/api/health`
- **Resultado:** HTTP **200**
- **Conclusão:** A API HTTP responde normalmente.

---

## 3. Socket.IO – Transporte Polling

- **Comando:** `GET http://localhost:3301/socket.io/?EIO=4&transport=polling`
- **Resultado:** HTTP **200**
- **Conclusão:** O endpoint de polling do Socket.IO está acessível.

---

## 4. CORS – Origin do frontend (localhost:3300)

- **Comando:** Requisição ao Socket.IO com header `Origin: http://localhost:3300`
- **Resultado:** HTTP **200** e resposta do servidor com `Access-Control-Allow-Origin: http://localhost:3300`
- **Conclusão:** O backend aceita a origem do frontend (porta 3300). CORS para Socket.IO está correto.

---

## 5. Variáveis de ambiente (backend)

- **Arquivo:** `backend/.env` e `config/environment.env`
- **Valores relevantes:**
  - `PORT=3301`
  - `FRONTEND_URL=http://localhost:3300`
- **Conclusão:** Porta e URL do frontend estão configuradas de forma consistente.

---

## 6. Conectividade TCP

- **Comando:** `Test-NetConnection localhost -Port 3301` e teste com `net.createConnection(3301, 'localhost')`
- **Resultado:** Conexão TCP na porta 3301 **OK**
- **Conclusão:** Não há bloqueio básico de rede para a porta 3301.

---

## Resumo

| Item                    | Status | Observação                          |
|-------------------------|--------|-------------------------------------|
| Porta 3301 em escuta    | OK     | Backend ativo                       |
| API HTTP /health        | OK     | 200                                 |
| Socket.IO (polling)      | OK     | 200                                 |
| CORS (Origin 3300)      | OK     | Header retornado corretamente       |
| FRONTEND_URL            | OK     | http://localhost:3300              |
| Conectividade TCP       | OK     | Conexão estabelecida                |

---

## Conclusão sobre o erro no Firefox

Do lado do **servidor** e da **rede** tudo está correto:

- Backend responde na 3301.
- Socket.IO (polling) responde com 200.
- CORS está configurado para `http://localhost:3300`.

O aviso **“Firefox não conseguiu estabelecer uma conexão com o servidor ws://localhost:3301/socket.io/”** tende a ocorrer quando:

1. **Ordem dos transports:** O cliente está com `transports: ['websocket', 'polling']`, então a **primeira** tentativa é WebSocket. Se essa primeira tentativa falhar (timing, handshake, etc.), o Firefox mostra o erro antes do fallback para polling.
2. **Momento da conexão:** A página tenta conectar ao Socket logo no carregamento; em algumas cargas o handshake WebSocket pode falhar na primeira tentativa e só funcionar na reconexão (por isso depois aparece “Socket.IO conectado!”).
3. **WebSocket não foi testado diretamente neste diagnóstico:** Os testes feitos foram HTTP (health e polling). O upgrade para WebSocket (ws://) pode ter comportamento ligeiramente diferente em cenários de carga rápida ou múltiplas abas.

**Recomendações (para quando quiser alterar algo):**

- ~~Considerar `transports: ['polling', 'websocket']` no cliente Socket.IO~~ **APLICADO** em `frontend/src/services/socket.service.ts`.
- Manter a configuração atual de CORS e `FRONTEND_URL`; não é necessário mudar nada aí com base neste diagnóstico.

---

## Pós-alteração (31/01/2026)

**Alteração feita:** Em `frontend/src/services/socket.service.ts`, `transports` passou de `['websocket', 'polling']` para `['polling', 'websocket']`, para que a primeira conexão seja por HTTP long-polling e depois upgrade para WebSocket.

**Testes executados após a alteração:**

| Teste              | Resultado |
|--------------------|-----------|
| GET /api/health    | 200       |
| Socket.IO polling (Origin: 3300) | 200 |
| Linter socket.service.ts | Sem erros |

**Como validar no navegador:** Abra a página do WhatsApp (http://localhost:3300/whatsapp), recarregue (F5) e verifique no console se o aviso "Firefox não conseguiu estabelecer uma conexão com ws://..." ainda aparece. Com polling primeiro, a primeira conexão deve ser HTTP; o upgrade para WebSocket ocorre em seguida, reduzindo a chance do erro no carregamento.

---

## 7. ChromaDB (verificação)

- **Serviço:** Banco vetorial (ChromaDB), usado por RAG, indexação, documentos e mídia.
- **Porta:** 8000 (`CHROMA_HOST`/`CHROMA_PORT`), independente do backend.
- **Conclusão:** ChromaDB não utiliza a porta 3301 e não interfere na conexão Socket.IO. O diagnóstico da conexão ws://localhost:3301/socket.io/ não depende do estado do ChromaDB. Se o Chroma não estiver disponível, o backend e o Socket.IO na 3301 seguem funcionando; apenas indexação/RAG podem falhar.

---

## 8. Problema de reconexão (Desconectar → Conectar)

**Sintoma identificado:** Após clicar em "Desconectar" e depois "Conectar", o status trava em `connecting` e o evento `ready` não chega ao frontend via Socket.IO, mesmo com o Socket.IO conectado e recebendo QR Code.

**Causa raiz:** 
- Ao "Desconectar", o `WhatsAppManager.disconnectService()` **deletava** o serviço do Map (`this.services.delete(userId)`).
- Ao "Conectar" novamente, uma **nova instância** de `WhatsAppService` era criada.
- Os listeners do Socket.IO registrados na página estavam ligados à instância **antiga** (deletada).
- Quando a nova instância disparava eventos (`ready`, `authenticated`), o frontend não recebia porque os listeners estavam na instância antiga.

**Correção aplicada (31/01/2026):**
- `whatsapp.manager.ts`: Removido `this.services.delete(userId)` do método `disconnectService()`.
- Agora, ao "Desconectar", o cliente WhatsApp fecha mas a **instância do serviço permanece no Map**.
- Ao "Conectar", a mesma instância é reutilizada, e os listeners do Socket.IO continuam válidos.
- O evento `ready` agora chegará ao frontend via Socket.IO após escanear o QR Code.

---

## Encerramento do diagnóstico

**Data de encerramento:** 31/01/2026

- **Itens verificados:** Porta 3301, API HTTP, Socket.IO (polling), CORS, variáveis de ambiente, conectividade TCP e independência do ChromaDB.
- **Alterações aplicadas:**
  1. `frontend/src/services/socket.service.ts`: `transports: ['polling', 'websocket']` para melhor robustez na conexão inicial.
  2. `backend/src/services/whatsapp.manager.ts`: Removido delete do serviço no `disconnectService()` para manter listeners do Socket.IO válidos na reconexão.
- **Resultado esperado:** Socket.IO conecta corretamente; após Desconectar → Conectar, o evento `ready` chega ao frontend e a UI atualiza para "connected" quando o usuário escanear o QR Code.

**Diagnóstico encerrado.**
