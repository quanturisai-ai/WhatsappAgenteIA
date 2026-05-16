# Autenticação — Contratos HTTP

> Gerado pelo Writer (Reversa) em 2026-05-16
> Base URL: `/api/auth`
> Autenticação: rotas públicas exceto `GET /profile`

---

## POST /api/auth/register

Cria um novo usuário no sistema.

**Autenticação:** Não requerida

**Request Body** (`application/json`):
```json
{
  "username": "string (obrigatório)",
  "email": "string (obrigatório)",
  "password": "string (obrigatório, mínimo 6 chars)"
}
```

**Response 201 — Sucesso:**
```json
{
  "message": "Usuário criado com sucesso",
  "user": {
    "id": 1,
    "username": "diego",
    "email": "diego@exemplo.com",
    "created_at": "2026-05-16T00:00:00.000Z",
    "updated_at": "2026-05-16T00:00:00.000Z"
  },
  "token": "<jwt>"
}
```

**Response 400 — Campos ausentes:**
```json
{ "error": "Username, email e senha são obrigatórios" }
```

**Response 400 — Senha curta:**
```json
{ "error": "Senha deve ter no mínimo 6 caracteres" }
```

**Response 500 — Usuário/email duplicado** 🟡 *(o service lança sem statusCode explícito, pode retornar como 500)*:
```json
{ "error": "Usuário ou email já existe" }
```

---

## POST /api/auth/login

Autentica um usuário existente.

**Autenticação:** Não requerida

**Request Body** (`application/json`):
```json
{
  "username": "string (obrigatório)",
  "password": "string (obrigatório)"
}
```

**Response 200 — Sucesso:**
```json
{
  "message": "Login realizado com sucesso",
  "user": {
    "id": 1,
    "username": "diego",
    "email": "diego@exemplo.com",
    "created_at": "2026-05-16T00:00:00.000Z",
    "updated_at": "2026-05-16T00:00:00.000Z"
  },
  "token": "<jwt>"
}
```

**Response 400 — Campos ausentes:**
```json
{ "error": "Username e senha são obrigatórios" }
```

**Response 401 — Credenciais inválidas:**
```json
{ "error": "Credenciais inválidas" }
```

**Response 500 — Resultado inválido do service:**
```json
{ "error": "Erro ao fazer login: resposta inválida" }
```

---

## GET /api/auth/profile

Retorna dados do usuário autenticado.

**Autenticação:** Obrigatória — `Authorization: Bearer <token>` ou `?token=<token>`

**Response 200 — Sucesso:**
```json
{
  "user": {
    "id": 1,
    "username": "diego",
    "email": "diego@exemplo.com",
    "created_at": "2026-05-16T00:00:00.000Z"
  }
}
```

**Response 401 — Token ausente:**
```json
{ "error": "Token de acesso não fornecido" }
```

**Response 401 — Usuário não encontrado no banco:**
```json
{ "error": "Usuário não encontrado" }
```

**Response 403 — Token inválido ou expirado:**
```json
{ "error": "Token inválido" }
```

---

## Notas de integração

- O token JWT retornado em `/register` e `/login` deve ser enviado em todas as rotas protegidas via `Authorization: Bearer <token>`
- O mesmo token pode ser usado via query string `?token=<token>` — útil para o handshake Socket.IO
- Expiração padrão: `7d` (configurável via `JWT_EXPIRES_IN`)
- O payload do token contém apenas `{ userId: number }` — dados completos do usuário são buscados no banco a cada requisição
