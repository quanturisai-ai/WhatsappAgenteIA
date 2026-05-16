# WhatsApp — Contratos HTTP

> Gerado pelo Writer (Reversa) em 2026-05-16
> Base URL: `/api/whatsapp`
> Autenticação: **obrigatória** em todas as rotas — `Authorization: Bearer <token>`

---

## POST /api/whatsapp/initialize

Inicializa (ou retorna) a sessão WhatsApp do usuário autenticado.

**Request Body:** Nenhum

**Response 200 — Sucesso (sessão criada ou já existente):**
```json
{ "message": "WhatsApp inicializado com sucesso" }
```

**Response 500 — Erro interno:**
```json
{ "error": "Erro ao inicializar WhatsApp" }
```

---

## GET /api/whatsapp/status

Retorna o status atual da sessão WhatsApp do usuário.

**Response 200:**
```json
{
  "status": "connected"
}
```
*Valores possíveis de `status`:* `"disconnected"` | `"connecting"` | `"authenticated"` | `"connected"` | `"connection_failed"`

**Response 404 — Sessão não encontrada no banco:**
```json
{ "status": "disconnected" }
```

---

## GET /api/whatsapp/qr

Retorna o QR code atual para autenticação. Disponível apenas durante o processo de inicialização (antes de escanear).

**Response 200 — QR disponível:**
```json
{
  "qrCode": "data:image/png;base64,..." 
}
```

**Response 200 — QR expirado ou sessão já autenticada:**
```json
{
  "qrCode": null
}
```

---

## POST /api/whatsapp/send

Envia uma mensagem de texto para um número WhatsApp.

**Request Body** (`application/json`):
```json
{
  "number": "5511999999999",
  "message": "Olá, como posso ajudar?"
}
```

**Response 200 — Sucesso:**
```json
{ "message": "Mensagem enviada com sucesso" }
```

**Response 400 — Campos ausentes:**
```json
{ "error": "Número e mensagem são obrigatórios" }
```

**Response 500 — Sessão não ativa ou erro de envio:**
```json
{ "error": "Erro ao enviar mensagem" }
```

---

## POST /api/whatsapp/disconnect

Desconecta a sessão sem destruir os arquivos de sessão (reconexão sem novo QR possível).

**Request Body:** Nenhum

**Response 200:**
```json
{ "message": "WhatsApp desconectado com sucesso" }
```

---

## POST /api/whatsapp/logout

Encerra completamente a sessão: destrói o cliente, remove arquivos e mata processos Chrome.

**Request Body:** Nenhum

**Response 200:**
```json
{ "message": "Logout realizado com sucesso" }
```

**Response 500:**
```json
{ "error": "Erro ao fazer logout" }
```

---

## Eventos Socket.IO emitidos por este módulo

| Evento | Payload | Quando |
|--------|---------|--------|
| `qr_code` | `{ qrCode: string }` | Novo QR code gerado |
| `qr_expired` | `{}` | QR code expirou sem ser escaneado |
| `authenticated` | `{ userId }` | QR escaneado, aguardando ready |
| `connected` | `{ userId }` | Sessão completamente pronta |
| `disconnected` | `{ userId }` | Sessão desconectada |
| `connection_failed` | `{ userId }` | 4 erros consecutivos no keep-alive |

---

## Notas de integração

- O número deve ser informado no formato internacional sem `+` (ex: `5511999999999`)
- O QR code expira em alguns minutos; ao expirar, uma nova inicialização pode ser necessária
- Events Socket.IO são emitidos para todos os clientes conectados no namespace padrão `/`
