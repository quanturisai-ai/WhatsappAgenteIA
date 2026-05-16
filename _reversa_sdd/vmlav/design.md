# VM Lav — Design Técnico

> Gerado pelo Writer (Reversa) em 2026-05-16

## Interface

| Método | Caminho | Entrada | Saída | Status codes |
|--------|---------|---------|-------|--------------|
| POST | `/api/vmlav/credentials` | `{ username, password }` | `{ message }` | 200, 400, 401 |
| GET | `/api/vmlav/credentials` | — | `{ username, hasPassword }` | 200, 401 |
| POST | `/api/vmlav/test-connection` | — | `{ success, message }` | 200, 401 |
| POST | `/api/vmlav/sync` | — | `{ message, count }` | 200, 401 |
| POST | `/api/vmlav/sync-vouchers` | — | `{ message, count }` | 200, 401 |
| GET | `/api/vmlav/clientes` | — | `VmLavCliente[]` | 200, 401 |
| POST | `/api/vmlav/close-browser` | — | `{ message }` | 200, 401 |

## Fluxo Principal — Autenticação via Puppeteer

```
VmLavService.autenticar(userId):
1. Puppeteer abre https://apps.vmhub.vmtecnologia.io/conta/api/v1/...
2. Navega para tela de login
3. Preenche username e password (lidos do banco — texto plano)
4. Aguarda resolução de captcha (automática ou via serviço)
5. Após login, extrai JWT do localStorage do browser
6. VmLavConnectionManager.setToken(userId, jwt)
7. Agendamento de renovação automática
```

## Fluxo Principal — Sincronização de Clientes

```
VmLavService.sincronizarClientes(userId):
1. VmLavConnectionManager.getToken(userId) → jwt (renova se necessário)
2. GET https://apps.vmhub.vmtecnologia.io/vmlav/api/v1/relatorios/clientes
   Headers: { Authorization: Bearer jwt, idEmpresa: 1737 }
3. Para cada cliente da resposta:
   UPSERT vm_lav_clientes (cpf como chave)
4. Registra log em VmLavSincronizacaoLog
```

## Fluxo Principal — Scheduler

```
vmLavScheduler.ts:
setInterval(10min) → para cada userId com credenciais configuradas:
  if Map<userId, boolean>.get(userId) == true: skip (já em execução)
  Map.set(userId, true)
  → VmLavService.sincronizarClientes(userId)
  → VmLavService.sincronizarVouchers(userId)
  Map.set(userId, false)
```

## APIs Externas Consumidas

| Endpoint | Método | Propósito |
|----------|--------|-----------|
| `vmhub.../contas-usuarios/login` | POST (Puppeteer) | Autenticação |
| `vmhub.../relatorios/clientes` | GET | Lista de clientes |
| `vmhub.../relatorios/pedidos` | GET | Pedidos/serviços |
| `vmhub.../vouchers/listaVoucher` | GET | Lista de vouchers |
| `vmhub.../vouchers` | POST | Criação de voucher |

## Constantes Hardcoded

| Constante | Valor | Impacto |
|-----------|-------|---------|
| `idEmpresa` | `1737` | Identifica a empresa na API externa |
| `empresaLocalizador` | `'lavateriajdnovomundo'` | Localizador de empresa |
| LAVAGEM id | `3837` | ID do serviço de lavagem |
| SECAGEM id | `3838` | ID do serviço de secagem |

## Riscos e Lacunas

- 🔴 **Senha em texto plano** — ADR-004 reconhece o risco; necessita criptografia (AES-256 mínimo)
- 🔴 **Constantes hardcoded** — `idEmpresa`, `empresaLocalizador`, IDs de serviço são fixos no código; quebra se a API mudar ou se for necessário suportar múltiplas empresas
- 🔴 **URLs hardcoded** — não configuráveis via env; quebra se o domínio da API mudar
- 🟡 Captcha no login — estratégia de resolução não confirmada (manual? serviço externo?)
- 🟡 Comportamento quando token expira durante sync em andamento
