# VM Lav — Contratos HTTP

> Gerado pelo Writer (Reversa) em 2026-05-16
> Base URL: `/api/vmlav`
> Autenticação: **obrigatória**

---

## POST /api/vmlav/credentials

Configura credenciais de acesso ao VM Lav.

**Request Body:**
```json
{ "username": "usuario@lavanderia.com", "password": "senha123" }
```

**Response 200:** `{ "message": "Credenciais configuradas" }`

---

## GET /api/vmlav/credentials

Retorna credenciais configuradas (sem expor senha).

**Response 200:**
```json
{ "username": "usuario@lavanderia.com", "hasPassword": true }
```

---

## POST /api/vmlav/test-connection

Testa conexão com o VM Lav via autenticação Puppeteer.

**Response 200 — Sucesso:**
```json
{ "success": true, "message": "Conexão estabelecida com sucesso" }
```

**Response 200 — Falha:**
```json
{ "success": false, "message": "Credenciais inválidas ou sistema indisponível" }
```

---

## POST /api/vmlav/sync

Sincroniza clientes do VM Lav para o banco local.

**Response 200:**
```json
{ "message": "Sincronização concluída", "count": 1250 }
```

---

## POST /api/vmlav/sync-vouchers

Sincroniza vouchers do VM Lav.

**Response 200:**
```json
{ "message": "Vouchers sincronizados", "count": 45 }
```

---

## GET /api/vmlav/clientes

Lista clientes sincronizados no banco local.

**Response 200:**
```json
[
  {
    "id": 1,
    "nome": "João Silva",
    "cpf": "123.456.789-00",
    "telefone": "5511999999999",
    "email": "joao@email.com"
  }
]
```

---

## POST /api/vmlav/close-browser

Encerra o browser Puppeteer manualmente (libera recursos).

**Response 200:** `{ "message": "Browser encerrado" }`
