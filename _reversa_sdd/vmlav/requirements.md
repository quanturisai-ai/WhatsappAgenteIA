# VM Lav — Integração com Sistema de Lavanderia

> Gerado pelo Writer (Reversa) em 2026-05-16
> Rastreabilidade: `backend/src/routes/vmLav.routes.ts`, `backend/src/controllers/vmLav.controller.ts`, `backend/src/services/vmLav.service.ts`, `backend/src/services/vmLavScheduler.ts`

## Visão Geral

Módulo de integração com o sistema externo VM Lavanderia (vmtecnologia.io). Autentica via scraping com Puppeteer (pela tela de login com captcha), obtém token JWT e sincroniza clientes, pedidos e vouchers da API externa para o banco local. Sincronização automática a cada 10 minutos via scheduler.

## Responsabilidades

- Configurar e armazenar credenciais de acesso ao VM Lav
- Autenticar no sistema externo via Puppeteer (scraping de login com captcha)
- Testar conectividade com o VM Lav
- Sincronizar clientes da API externa para o banco local
- Sincronizar vouchers (lista e criação)
- Listar clientes sincronizados
- Fechar browser Puppeteer manualmente

## Regras de Negócio

- Autenticação usa **Puppeteer** para navegar na tela de login e extrair JWT do localStorage — necessário por causa do captcha 🟢
- Token JWT renovado automaticamente por `VmLavConnectionManager` 🟢
- Scheduler sincroniza a cada **10 minutos** — usa `Map<userId, boolean>` para prevenir execuções simultâneas 🟢
- Constantes `idEmpresa`, `empresaLocalizador`, `LAVAGEM(serviceId)`, `SECAGEM(serviceId)` são atualmente hardcoded (`1737`, `lavateriajdnovomundo`, `3837`, `3838`) mas **devem ser configuráveis por usuário/conta** — gap de implementação confirmado pelo usuário; precisam ser adicionadas ao modelo de credenciais VM Lav 🔴 (feature gap)
- URLs da API são hardcoded (não configuráveis): `apps.vmhub.vmtecnologia.io` — se a VM Lav muda de domínio, exige deploy 🟡
- Senha é armazenada como **texto plano** no banco (ADR-004 reconhece como risco) 🔴
- `normaliza_telefone()` é uma função SQL customizada usada para JOIN com conversas 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|-----------|-------------------|
| RF-01 | Configurar credenciais VM Lav | Must | POST /api/vmlav/credentials persiste usuário e senha |
| RF-02 | Ler credenciais configuradas | Must | GET /api/vmlav/credentials retorna credenciais (sem senha) |
| RF-03 | Testar conexão com VM Lav | Must | POST /api/vmlav/test-connection retorna sucesso ou falha |
| RF-04 | Sincronizar clientes manualmente | Should | POST /api/vmlav/sync dispara sincronização de clientes |
| RF-05 | Sincronizar vouchers manualmente | Should | POST /api/vmlav/sync-vouchers dispara sincronização de vouchers |
| RF-06 | Listar clientes sincronizados | Must | GET /api/vmlav/clientes retorna clientes do banco local |
| RF-07 | Fechar browser Puppeteer | Should | POST /api/vmlav/close-browser encerra Puppeteer manualmente |
| RF-08 | Sincronização automática | Must | Scheduler executa sync a cada 10min sem intervenção |
| RF-09 | Configurar identificadores da conta VM Lav | Must | PUT /api/vmlav/credentials deve persistir `idEmpresa`, `empresaLocalizador`, `lavagem_service_id`, `secagem_service_id` por usuário — **feature gap no legado, hardcoded atualmente** |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Senha armazenada em texto plano — RISCO CRÍTICO | ADR-004 | 🔴 |
| Disponibilidade | Scheduler com deduplicação por userId | `vmLavScheduler.ts` (Map deduplication) | 🟢 |
| Compatibilidade | Puppeteer requer ambiente com Chromium | `vmLav.service.ts` | 🟢 |

## Critérios de Aceitação

```gherkin
Dado que as credenciais foram configuradas
Quando POST /api/vmlav/test-connection é chamado
Então a resposta indica sucesso (autenticação Puppeteer bem-sucedida) ou falha com erro

Dado que a sincronização automática executa a cada 10 min
Quando dois jobs simultâneos tentam sincronizar o mesmo userId
Então apenas um executa; o segundo é ignorado pelo Map de deduplicação

Dado que o banco tem clientes sincronizados
Quando uma conversa WhatsApp chega
Então o findById da conversa enriquece o contato com dados do cliente via normaliza_telefone()
```

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `backend/src/routes/vmLav.routes.ts` | 7 rotas | 🟢 |
| `backend/src/controllers/vmLav.controller.ts` | `configurarCredenciais`, `obterCredenciais`, `testarConexao`, `sincronizarClientes`, `sincronizarVouchers`, `listarClientes`, `fecharNavegador` | 🟢 |
| `backend/src/services/vmLav.service.ts` | `VmLavService` — autenticação Puppeteer, sync | 🟢 |
| `backend/src/services/vmLavScheduler.ts` | Scheduler 10min com deduplicação | 🟢 |
| `backend/src/services/vmLavConnectionManager.ts` | Gerenciamento de token JWT e renovação | 🟢 |
