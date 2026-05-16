# Autenticação — Design Técnico

> Gerado pelo Writer (Reversa) em 2026-05-16
> Rastreabilidade: `backend/src/services/auth.service.ts`, `backend/src/controllers/auth.controller.ts`, `backend/src/middleware/auth.ts`

## Interface

| Método | Caminho | Entrada | Saída | Status codes |
|--------|---------|---------|-------|--------------|
| POST | `/api/auth/register` | `{ username: string, email: string, password: string }` | `{ message, user, token }` | 201, 400, 500 |
| POST | `/api/auth/login` | `{ username: string, password: string }` | `{ message, user, token }` | 200, 400, 401, 500 |
| GET | `/api/auth/profile` | Header `Authorization: Bearer <token>` ou `?token=<token>` | `{ user }` | 200, 401, 403, 500 |

**Tipo `User` (retornado — sem password_hash):**
```ts
{
  id: number;
  username: string;
  email: string;
  created_at: Date;
  updated_at: Date;
}
```

**Tipo `RegisterData`:**
```ts
{ username: string; email: string; password: string }
```

**Tipo `LoginCredentials`:**
```ts
{ username: string; password: string }
```

## Fluxo Principal — Registro

1. Controller valida presença de `username`, `email` e `password` no body; rejeita com 400 se ausentes (`backend/src/controllers/auth.controller.ts:17-27`)
2. Controller valida `password.length >= 6`; rejeita com 400 se menor (`auth.controller.ts:23-27`)
3. `AuthService.register()` abre conexão com pool MariaDB (`auth.service.ts:21`)
4. SELECT verifica se `username` ou `email` já existem; lança erro se sim (`auth.service.ts:23-30`)
5. `bcrypt.hash(password, 10)` gera o hash da senha (`auth.service.ts:33`)
6. INSERT insere o novo usuário com `username`, `email`, `password_hash` (`auth.service.ts:36-39`)
7. SELECT busca o usuário recém-inserido pelo `insertId` (`auth.service.ts:56-59`)
8. `generateToken(userId)` assina JWT com `JWT_SECRET` e `JWT_EXPIRES_IN` (`auth.service.ts:168-178`)
9. Controller retorna 201 com `{ message, user (sem password_hash), token }` (`auth.controller.ts:31-35`)
10. Conexão retorna ao pool via `conn.release()` no `finally` (`auth.service.ts:99`)

## Fluxo Principal — Login

1. Controller valida presença de `username` e `password`; rejeita com 400 se ausentes (`auth.controller.ts:51-55`)
2. `AuthService.login()` abre conexão com pool MariaDB (`auth.service.ts:104`)
3. SELECT busca usuário por `username`, incluindo `password_hash` (`auth.service.ts:107-110`)
4. Se nenhuma linha retornar, lança `Error('Credenciais inválidas')` (`auth.service.ts:129-132`)
5. `bcrypt.compare(inputPassword, user.password_hash)` valida a senha (`auth.service.ts:141`)
6. Se senha inválida, lança `Error('Credenciais inválidas')` (`auth.service.ts:143-145`)
7. `generateToken(userId)` emite o JWT (`auth.service.ts:147`)
8. Controller retorna 200 com `{ message, user (sem password_hash), token }` (`auth.controller.ts:67-71`)

## Fluxo Principal — Middleware de Autenticação

1. Extrai token do header `Authorization: Bearer <token>` ou da query string `?token=` (`middleware/auth.ts:17-20`)
2. Se ausente, retorna 401 com `{ error: "Token de acesso não fornecido" }` (`auth.ts:22-24`)
3. `jwt.verify(token, JWT_SECRET)` decodifica e valida a assinatura (`auth.ts:27-30`)
4. SELECT no banco busca o usuário pelo `decoded.userId` para garantir existência atual (`auth.ts:35-38`)
5. Se não encontrado, retorna 401 com `{ error: "Usuário não encontrado" }` (`auth.ts:40-43`)
6. Popula `req.userId` e `req.user` com dados frescos do banco; chama `next()` (`auth.ts:45-47`)

## Fluxos Alternativos

- **Token via query string:** aceito em `?token=<jwt>` além do header — útil para handshake Socket.IO (`middleware/auth.ts:19-20`) 🟢
- **JWT expirado ou malformado:** `jwt.JsonWebTokenError` capturado, retorna 403 com `{ error: "Token inválido" }` (`auth.ts:52-54`) 🟢
- **Erro interno (ex: banco offline):** retorna 500 com `{ error: "Erro ao verificar token" }` (`auth.ts:55`) 🟢
- **Resultado inválido no login:** verificação extra em `result?.user && result?.token`; retorna 500 se falhar (`auth.controller.ts:59-63`) 🟢
- **Parsing de resultado MariaDB:** o serviço normaliza o retorno de `conn.query()` que pode vir como `[rows, metadata]` ou diretamente `rows` (`auth.service.ts:43-73`) 🟢

## Dependências

- `bcryptjs` — hash e comparação de senhas; salt rounds fixo em 10
- `jsonwebtoken` — emissão e verificação de tokens JWT
- `pool` (MariaDB) — conexão ao banco; gerenciado via `pool.getConnection()` / `conn.release()`
- `logger` (Winston) — logs de debug e error no fluxo de login

## Decisões de Design Identificadas

| Decisão | Evidência no código | Confiança |
|---------|---------------------|-----------|
| Validação de campo no controller, regra de unicidade no service | `auth.controller.ts:17-27` vs `auth.service.ts:23-30` | 🟢 |
| Busca ao banco em cada requisição autenticada (sem cache de sessão) | `middleware/auth.ts:33-47` | 🟢 |
| Fallback `'default-secret'` para `JWT_SECRET` quando env não definida | `auth.service.ts:169`, `middleware/auth.ts:29` | 🟢 |
| `password_hash` excluído manualmente do SELECT de retorno (não via ORM) | `auth.service.ts:56-58`, `middleware/auth.ts:35` | 🟢 |
| Token WhatsApp compartilha o mesmo `JWT_SECRET` do auth | `code-analysis.md` (regra de negócio auth) | 🟡 |

## Estado Interno

Stateless — nenhum estado é mantido em memória. Toda sessão é validada contra o banco a cada requisição. O JWT em si carrega apenas `{ userId }` no payload.

## Observabilidade

| Evento | Nível | Local |
|--------|-------|-------|
| Tentativa de login (username) | DEBUG | `auth.controller.ts:49` |
| Login bem-sucedido | INFO | `auth.controller.ts:66` |
| Erro no login (mensagem + stack) | ERROR | `auth.controller.ts:73-77` |
| Resultado inválido do AuthService | ERROR | `auth.controller.ts:60` |

## Riscos e Lacunas

- 🔴 `JWT_SECRET` com fallback `'default-secret'` — se env não estiver configurada em produção, tokens são facilmente forjáveis
- 🟡 Sem rate limiting no endpoint de login — vulnerável a ataques de força bruta
- 🟡 Mensagem de erro de unicidade no registro não distingue se é `username` ou `email` duplicado — retorna erro genérico do service
- 🟡 `password_hash` excluído via SELECT explícito, não por camada de serialização — risco de exposição acidental em queries futuras
- 🟡 Parsing manual do retorno MariaDB (`[rows, metadata]`) duplicado em vários pontos do service — frágil a mudanças de driver
