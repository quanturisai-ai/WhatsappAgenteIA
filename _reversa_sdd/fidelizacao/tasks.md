# Fidelização — Tarefas de Implementação

> Gerado pelo Writer (Reversa) em 2026-05-16

## Pré-requisitos

- [ ] Tabelas: `premios`, `premios_clientes`, `fidelizacao_regras`, `fidelizacao_tipos_gatilho`, `fidelizacao_regras_config`, `fidelizacao_notificacoes`, `fidelizacao_config`
- [ ] `vm_lav_clientes` e `vm_lav_pedidos` sincronizados (módulo vmLav)
- [ ] `cpfUtils.ts` disponível
- [ ] `VmLavService` / `FidelizacaoVoucherAutoService` para geração de vouchers

## Tarefas

- [ ] T-01 — Implementar `FidelizacaoService.calcularSaldo(cpf, userId)`: query pedidos filtrados + lógica de prêmios
  - Origem: `backend/src/services/fidelizacao.service.ts`
  - Critério de pronto: saldo correto para cliente com pedidos conhecidos
  - Confiança: 🟢

- [ ] T-02 — Implementar `apurarPremiosCliente(cpf, userId)`: calcula saldo, cria PremioCliente para metas atingidas
  - Origem: `backend/src/controllers/fidelizacao.controller.ts:apurarPremiosCliente`
  - Critério de pronto: clientes que atingiram meta recebem registro em premios_clientes
  - Confiança: 🟢

- [ ] T-03 — Implementar CRUD de prêmios: `listarPremios`, `criarPremio`, `atualizarPremio`, `deletarPremio`
  - Origem: `backend/src/controllers/fidelizacao.controller.ts`
  - Critério de pronto: catálogo gerenciável via API
  - Confiança: 🟢

- [ ] T-04 — Implementar `gerarVoucherConquista(id)`: delegação ao `FidelizacaoVoucherAutoService` → API VM Lav
  - Origem: `backend/src/services/fidelizacaoVoucherAuto.service.ts`
  - Critério de pronto: voucher criado na API VM Lav e retornado
  - Confiança: 🟢

- [ ] T-05 — Implementar motor de automações `FidelizacaoRegrasService`: verificação de vigência + segmentação + anti-spam + disparo
  - Origem: `backend/src/services/fidelizacaoRegras.service.ts`
  - Critério de pronto: regra com vigência expirada não dispara; anti-spam bloqueia reenvio
  - Confiança: 🟢

- [ ] T-06 — Implementar `FidelizacaoNotificacaoService`: registro de notificações enviadas para deduplicação
  - Origem: `backend/src/services/fidelizacaoNotificacao.service.ts`
  - Critério de pronto: mesma regra + mesmo cliente não dispara duas vezes no mesmo período
  - Confiança: 🟢

- [ ] T-07 — Implementar preview de automações (sem disparo real)
  - Origem: `backend/src/controllers/fidelizacaoRegras.controller.ts:previewRegraByBody, previewRegraById`
  - Critério de pronto: preview mostra quantos clientes seriam afetados sem enviar nada
  - Confiança: 🟡

- [ ] T-08 — Implementar todos os controllers REST (28+ endpoints)
  - Origem: `backend/src/controllers/fidelizacao.controller.ts` + `fidelizacaoRegras.controller.ts`
  - Critério de pronto: endpoints respondem conforme contracts.md
  - Confiança: 🟢

- [ ] T-09 — Implementar `normalizeCpfToDigits` e `normalizeCpfColumnSql` em `cpfUtils.ts`
  - Origem: `backend/src/utils/cpfUtils.ts`
  - Critério de pronto: "123.456.789-00" → "12345678900"; SQL expression remove pontuação
  - Confiança: 🟢

## Lacunas Pendentes (🔴)

- **Motor de automações:** confirmar frequência de execução automática — cron separado ou event-driven?
- **`segmentacao_publico`:** estrutura JSON exata do campo não confirmada — inspecionar tabela/código
- **Geração de voucher com VM Lav offline:** definir comportamento de fallback
