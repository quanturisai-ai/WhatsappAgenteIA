# Fidelização — Programa de Pontos e Automações

> Gerado pelo Writer (Reversa) em 2026-05-16
> Rastreabilidade: `backend/src/routes/fidelizacao.routes.ts`, `backend/src/controllers/fidelizacao.controller.ts`, `backend/src/controllers/fidelizacaoRegras.controller.ts`, `backend/src/services/fidelizacao.service.ts`, `backend/src/services/fidelizacaoRegras.service.ts`

## Visão Geral

O módulo mais complexo do sistema. Implementa um programa de fidelidade baseado em utilização de serviços da lavanderia. Clientes acumulam utilizações (pedidos com `situacao_venda='Sucesso'` e `pago_com_fidelidade=0`) e conquistam prêmios ao atingir metas. Inclui motor de automações parametrizáveis com gatilhos, segmentação de público e filtros anti-spam, além de geração automática de vouchers na API VM Lav.

## Responsabilidades

- Calcular saldo de fidelidade por CPF de cliente
- Gerenciar catálogo de prêmios (CRUD)
- Listar clientes com saldo, distribuição por percentual e prêmios conquistados
- Apurar prêmios conquistados por cliente
- Marcar prêmio como utilizado, registrar entrega e gerar voucher
- Listar e reenviar notificações
- Configurar parâmetros globais do programa (ativo/inativo, simulação)
- CRUD de automações (regras com gatilhos parametrizáveis)
- Preview de automações antes de ativar

## Regras de Negócio

- Apenas pedidos com `situacao_venda='Sucesso'` E `pago_com_fidelidade=0` contam para saldo 🟢
- `SaldoFidelidade` = `{ atual, proximoObjetivo, faltam, proximoPremio, conquistas }` 🟢
- Filtros anti-spam: `intervalo_verificacao_automacoes`, `vigencia_inicio`/`vigencia_fim`, `segmentacao_publico` 🟢
- Status `bloqueado_antispam`, `bloqueado_semanal`, `bloqueado_mensal` previnem reenvios de notificações 🟢
- `FidelizacaoVoucherAutoService` gera vouchers na API VM Lav quando cliente atinge meta 🟢
- `FidelizacaoNotificacaoService` rastreia notificações enviadas para evitar duplicatas 🟢
- Voucher gerado via API externa VM Lav (mesmas credenciais e autenticação do módulo vmLav) 🟢
- CPF normalizado via `normalizeCpfToDigits()` para joins e buscas 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|-----------|-------------------|
| RF-01 | Listar clientes com saldo de fidelidade | Must | GET /clientes retorna lista com saldo calculado |
| RF-02 | Buscar fidelização por CPF | Must | GET /clientes/:cpf retorna SaldoFidelidade do cliente |
| RF-03 | Obter distribuição de clientes por percentual | Should | GET /clientes/distribuicao retorna agrupamento percentual |
| RF-04 | Buscar pedidos detalhados por CPF | Should | GET /clientes/:cpf/pedidos retorna histórico filtrado |
| RF-05 | Apurar prêmios conquistados por cliente | Must | POST /clientes/:cpf/apurar calcula e registra prêmios atingidos |
| RF-06 | Listar prêmios do catálogo | Must | GET /premios retorna catálogo de prêmios |
| RF-07 | CRUD de prêmios | Must | POST/PUT/DELETE /premios gerenciam catálogo |
| RF-08 | Listar conquistas (prêmios ganhos) | Must | GET /conquistas retorna PremioCliente[] |
| RF-09 | Marcar prêmio como utilizado | Should | PUT /conquistas/:id/utilizar atualiza status |
| RF-10 | Registrar entrega de prêmio | Should | PUT /conquistas/:id/entrega registra entrega física |
| RF-11 | Gerar voucher para conquista | Should | PUT /conquistas/:id/gerar-voucher cria voucher na API VM Lav |
| RF-12 | Listar notificações enviadas | Should | GET /notificacoes lista histórico |
| RF-13 | Reenviar notificação | Could | POST /notificacoes/:id/reenviar reenvia sem bloqueio anti-spam |
| RF-14 | Configurar parâmetros globais | Must | GET/PATCH /config gerencia configuração do programa |
| RF-15 | CRUD de automações (regras) | Must | GET/POST/PUT/DELETE /automacoes/regras |
| RF-16 | Ativar/desativar automação | Must | PATCH /automacoes/regras/:id/toggle |
| RF-17 | Preview de automação | Should | POST /automacoes/regras/preview (body) e /:id/preview |
| RF-18 | Configurar motor de automações | Should | GET/PUT /automacoes/config |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Rotas requerem JWT | `fidelizacao.routes.ts:39` | 🟢 |
| Confiabilidade | Filtros anti-spam previnem reenvio duplicado | `code-analysis.md` (status bloqueado_*) | 🟢 |

## Critérios de Aceitação

```gherkin
Dado que um cliente tem 3 pedidos com situacao_venda='Sucesso' e pago_com_fidelidade=0
Quando GET /api/fidelizacao/clientes/:cpf é chamado
Então SaldoFidelidade.atual = 3

Dado que um cliente atingiu a meta do prêmio
Quando POST /api/fidelizacao/clientes/:cpf/apurar é chamado
Então um PremioCliente é criado e um voucher pode ser gerado na API VM Lav

Dado que uma automação tem vigencia_fim = ontem
Quando o motor de automações executa
Então a regra não é disparada (fora da vigência)

Dado que uma notificação foi enviada há menos de intervalo_verificacao_automacoes horas
Quando o motor tenta disparar a mesma regra para o mesmo cliente
Então o disparo é bloqueado (bloqueado_antispam=true)
```

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `backend/src/routes/fidelizacao.routes.ts` | 28+ rotas | 🟢 |
| `backend/src/controllers/fidelizacao.controller.ts` | 16 funções | 🟢 |
| `backend/src/controllers/fidelizacaoRegras.controller.ts` | 10 funções | 🟢 |
| `backend/src/services/fidelizacao.service.ts` | `FidelizacaoService` — cálculo de saldo | 🟢 |
| `backend/src/services/fidelizacaoRegras.service.ts` | `FidelizacaoRegrasService` — motor de automações | 🟢 |
| `backend/src/services/fidelizacaoNotificacao.service.ts` | Rastreamento de notificações | 🟢 |
| `backend/src/services/fidelizacaoVoucherAuto.service.ts` | Geração de vouchers automáticos | 🟢 |
| `backend/src/utils/cpfUtils.ts` | `normalizeCpfToDigits`, `normalizeCpfColumnSql` | 🟢 |
