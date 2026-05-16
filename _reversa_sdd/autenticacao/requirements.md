# Autenticação

> Gerado pelo Writer (Reversa) em 2026-05-16
> Rastreabilidade: `backend/src/routes/auth.routes.ts`, `backend/src/controllers/auth.controller.ts`, `backend/src/services/auth.service.ts`, `backend/src/middleware/auth.ts`

## Visão Geral

Módulo responsável por registro, autenticação e perfil de usuários do sistema. Emite tokens JWT usados por todos os demais endpoints protegidos e pelo canal WebSocket (Socket.IO). É a porta de entrada obrigatória para qualquer operação autenticada no sistema.

## Responsabilidades

- Criar novos usuários com senha hashed via bcrypt
- Autenticar usuários e emitir tokens JWT
- Validar tokens em cada requisição autenticada (middleware)
- Retornar dados do perfil do usuário autenticado

## Regras de Negócio

- Senha deve ter no mínimo **6 caracteres** — validada no controller, não no service 🟢
- `username` e `email` devem ser **únicos** no banco — verificado via SELECT antes do INSERT 🟢
- O token JWT é assinado com `JWT_SECRET` e expira conforme `JWT_EXPIRES_IN` (padrão: `7d`) 🟢
- O middleware `authenticateToken` aceita o token tanto no header `Authorization: Bearer <token>` quanto na query string `?token=<token>` 🟢
- `req.user` é populado com dados frescos do banco a cada requisição autenticada — não apenas o payload do token 🟢
- O mesmo `JWT_SECRET` é compartilhado com a sessão WhatsApp 🟡
- Erros de credenciais retornam a mensagem genérica `"Credenciais inválidas"` sem discriminar se usuário ou senha estão errados 🟢
- Senha nunca é retornada nas respostas — `password_hash` é excluído do objeto `User` retornado 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|-----------|-------------------|
| RF-01 | Registrar novo usuário com username, email e senha | Must | POST /api/auth/register retorna 201 com objeto user (sem password_hash) e token JWT válido |
| RF-02 | Autenticar usuário existente com username e senha | Must | POST /api/auth/login retorna 200 com objeto user e token JWT |
| RF-03 | Rejeitar registro com username ou email duplicado | Must | Retorna 400 (ou 500 sem código explícito) com mensagem de erro |
| RF-04 | Rejeitar senha com menos de 6 caracteres no registro | Must | Retorna 400 com mensagem "Senha deve ter no mínimo 6 caracteres" |
| RF-05 | Retornar dados do perfil do usuário autenticado | Should | GET /api/auth/profile com token válido retorna objeto user |
| RF-06 | Proteger rotas via middleware JWT | Must | Requisição sem token retorna 401; token inválido retorna 403 |
| RF-07 | Aceitar token via query string além do header | Could | GET /api/auth/profile?token=<jwt> funciona igual ao header Authorization |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Hash bcrypt com salt=10 aplicado antes de persistir senha | `backend/src/services/auth.service.ts:33` | 🟢 |
| Segurança | Token JWT verificado a cada requisição autenticada com busca ao banco | `backend/src/middleware/auth.ts:35` | 🟢 |
| Segurança | JWT_SECRET via env var com fallback `'default-secret'` (risco em produção) | `backend/src/services/auth.service.ts:169` | 🔴 |
| Performance | Busca ao banco em todo middleware de autenticação (sem cache) | `backend/src/middleware/auth.ts:33-47` | 🟡 |

## Critérios de Aceitação

```gherkin
Dado que um usuário envia username, email e senha (>= 6 chars) válidos e únicos
Quando POST /api/auth/register é chamado
Então a resposta é 201 com { message, user: { id, username, email, created_at, updated_at }, token }
  E password_hash não está presente no objeto user

Dado que um usuário envia username e senha corretos
Quando POST /api/auth/login é chamado
Então a resposta é 200 com { message, user, token }

Dado que um token JWT válido é enviado no header Authorization
Quando GET /api/auth/profile é chamado
Então a resposta é 200 com { user } contendo dados atuais do banco

Dado que a senha informada tem menos de 6 caracteres
Quando POST /api/auth/register é chamado
Então a resposta é 400 com mensagem de erro adequada

Dado que username ou email já existem no banco
Quando POST /api/auth/register é chamado
Então a resposta retorna erro com mensagem "Usuário ou email já existe"

Dado que nenhum token é enviado
Quando qualquer rota protegida é acessada
Então a resposta é 401 com { error: "Token de acesso não fornecido" }

Dado que um token JWT inválido ou expirado é enviado
Quando qualquer rota protegida é acessada
Então a resposta é 403 com { error: "Token inválido" }

Dado que credenciais incorretas (senha errada ou usuário inexistente) são enviadas
Quando POST /api/auth/login é chamado
Então a resposta é 401 com { error: "Credenciais inválidas" } sem discriminar o tipo de erro
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Registro de usuário (RF-01) | Must | Porta de entrada; sem isso nenhum outro recurso é acessível |
| Login e emissão de token (RF-02) | Must | Caminho crítico chamado a cada sessão |
| Proteção JWT de rotas (RF-06) | Must | Toda a API depende deste middleware |
| Rejeição de duplicatas (RF-03) | Must | Regra de negócio sem fallback |
| Validação de senha mínima (RF-04) | Must | Regra de negócio sem fallback |
| Perfil do usuário (RF-05) | Should | Útil mas não bloqueia operação principal |
| Token via query string (RF-07) | Could | Caso de uso específico (Socket.IO handshake), raramente chamado diretamente |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `backend/src/routes/auth.routes.ts` | Roteamento `POST /register`, `POST /login`, `GET /profile` | 🟢 |
| `backend/src/controllers/auth.controller.ts` | `register`, `login`, `getProfile` | 🟢 |
| `backend/src/services/auth.service.ts` | `AuthService.register`, `AuthService.login`, `AuthService.generateToken` | 🟢 |
| `backend/src/middleware/auth.ts` | `authenticateToken` | 🟢 |
