# Autenticação — Tarefas de Implementação

> Gerado pelo Writer (Reversa) em 2026-05-16

## Pré-requisitos

- [ ] Pool de conexão MariaDB configurado e acessível
- [ ] Tabela `users` criada (schema em `backend/src/config/database.schema.sql`)
- [ ] Variáveis de ambiente definidas: `JWT_SECRET`, `JWT_EXPIRES_IN`
- [ ] Dependências instaladas: `bcryptjs`, `jsonwebtoken`, `express`

## Tarefas

- [ ] T-01 — Implementar `AuthService.register(data)`: hash bcrypt(10) + INSERT + SELECT do criado + geração de JWT
  - Origem no legado: `backend/src/services/auth.service.ts:19-101`
  - Critério de pronto: registro com dados válidos retorna `{ user, token }`; duplicata lança erro
  - Confiança: 🟢

- [ ] T-02 — Implementar `AuthService.login(credentials)`: SELECT por username + bcrypt.compare + JWT
  - Origem no legado: `backend/src/services/auth.service.ts:103-166`
  - Critério de pronto: credenciais corretas retornam token; erradas lançam `"Credenciais inválidas"`
  - Confiança: 🟢

- [ ] T-03 — Implementar `AuthService.generateToken(userId)`: `jwt.sign({ userId }, JWT_SECRET, { expiresIn })`
  - Origem no legado: `backend/src/services/auth.service.ts:168-178`
  - Critério de pronto: token decodificável com `jwt.verify` usando o mesmo secret
  - Confiança: 🟢

- [ ] T-04 — Implementar controller `register`: validação de campos obrigatórios + senha mínima + delegação ao service
  - Origem no legado: `backend/src/controllers/auth.controller.ts:8-39`
  - Critério de pronto: retorna 201 em sucesso, 400 em validação, propaga erro do service
  - Confiança: 🟢

- [ ] T-05 — Implementar controller `login`: validação de presença + delegação ao service + verificação de resultado
  - Origem no legado: `backend/src/controllers/auth.controller.ts:41-86`
  - Critério de pronto: retorna 200 em sucesso, 400 sem campos, 401 em credenciais inválidas
  - Confiança: 🟢

- [ ] T-06 — Implementar controller `getProfile`: lê `req.user` populado pelo middleware
  - Origem no legado: `backend/src/controllers/auth.controller.ts:88-102`
  - Critério de pronto: retorna 200 com `{ user }` quando middleware já autenticou
  - Confiança: 🟢

- [ ] T-07 — Implementar middleware `authenticateToken`: extração token (header ou query), `jwt.verify`, SELECT de usuário, populate `req.user`
  - Origem no legado: `backend/src/middleware/auth.ts:10-58`
  - Critério de pronto: 401 sem token, 403 token inválido, 401 usuário inexistente, `next()` em sucesso
  - Confiança: 🟢

- [ ] T-08 — Registrar rotas em `auth.routes.ts`: `POST /register`, `POST /login`, `GET /profile` (com middleware)
  - Origem no legado: `backend/src/routes/auth.routes.ts`
  - Critério de pronto: rotas respondem conforme especificado em `contracts.md`
  - Confiança: 🟢

- [ ] T-09 — Garantir que `password_hash` nunca apareça nos objetos `User` retornados ao cliente
  - Origem no legado: `backend/src/services/auth.service.ts:56-58` (SELECT explícito sem password_hash)
  - Critério de pronto: inspeção do JSON de resposta não contém o campo
  - Confiança: 🟢

- [ ] T-10 — Configurar `JWT_SECRET` obrigatório em produção — **app deve falhar no startup** se `JWT_SECRET` não estiver definido (remoção do fallback `'default-secret'`); melhor prática confirmada pelo usuário
  - Origem no legado: `backend/src/services/auth.service.ts:169`
  - Critério de pronto: `process.env.JWT_SECRET` ausente → `throw Error` ou `process.exit(1)` antes de registrar rotas
  - Prioridade: **Must** (confirmado)
  - Confiança: 🟢

## Tarefas de Teste

- [ ] TT-01 — Teste do happy path: registro → login → profile com token emitido
- [ ] TT-02 — Teste de senha curta: `POST /register` com senha de 5 chars retorna 400
- [ ] TT-03 — Teste de duplicata: registro com username/email já existente retorna erro
- [ ] TT-04 — Teste de credenciais erradas: `POST /login` com senha incorreta retorna 401
- [ ] TT-05 — Teste de rota protegida sem token: retorna 401
- [ ] TT-06 — Teste de token inválido: retorna 403
- [ ] TT-07 — Teste de token via query string: `GET /profile?token=<jwt>` funciona igual ao header

## Tarefas de Migração de Dados

- [ ] TM-01 — Garantir que a tabela `users` exista com os campos: `id`, `username` (UNIQUE), `email` (UNIQUE), `password_hash`, `created_at`, `updated_at`
  - Referência: `backend/src/config/database.schema.sql`

## Ordem Sugerida

1. T-03 (generateToken) — independente, sem dependências
2. T-01, T-02 (services) — dependem de T-03 e do pool DB
3. T-07 (middleware) — depende do pool DB e JWT_SECRET
4. T-04, T-05, T-06 (controllers) — dependem dos services
5. T-08 (rotas) — depende dos controllers e middleware
6. T-09 (segurança) — revisão transversal
7. T-10 (configuração produção) — revisão de env

## Lacunas Pendentes (🔴)

- **T-10:** Decisão sobre como tratar `JWT_SECRET` ausente em produção — remover fallback ou falhar no startup?
- **Rate limiting em `/login`:** Sem evidência de proteção contra brute force no código legado. Definir se será adicionado no reimplementação.
