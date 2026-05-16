# VM Lav — Tarefas de Implementação

> Gerado pelo Writer (Reversa) em 2026-05-16

## Pré-requisitos

- [ ] Puppeteer/Chromium disponível no ambiente
- [ ] Tabelas `vm_lav_clientes`, `vm_lav_pedidos`, `vm_lav_credentials`, `vm_lav_sincronizacao_log` criadas
- [ ] Função SQL `normaliza_telefone()` criada no banco

## Tarefas

- [ ] T-01 — Implementar `VmLavService.autenticar(userId)`: Puppeteer → login → extração de JWT do localStorage
  - Origem: `backend/src/services/vmLav.service.ts`
  - Critério de pronto: JWT válido obtido e armazenado no ConnectionManager
  - Confiança: 🟢

- [ ] T-02 — Implementar `VmLavConnectionManager`: gerenciamento de token por userId, renovação automática
  - Origem: `backend/src/services/vmLavConnectionManager.ts`
  - Critério de pronto: token renovado automaticamente antes de expirar
  - Confiança: 🟢

- [ ] T-03 — Implementar `sincronizarClientes(userId)`: GET relatorios/clientes → UPSERT no banco
  - Origem: `backend/src/services/vmLav.service.ts:sincronizarClientes`
  - Critério de pronto: clientes da API aparecem na tabela vm_lav_clientes
  - Confiança: 🟢

- [ ] T-04 — Implementar `sincronizarVouchers(userId)`: GET + POST vouchers
  - Origem: `backend/src/services/vmLav.service.ts:sincronizarVouchers`
  - Critério de pronto: vouchers sincronizados no banco local
  - Confiança: 🟢

- [ ] T-05 — Implementar scheduler de 10min com deduplicação por userId via Map
  - Origem: `backend/src/services/vmLavScheduler.ts`
  - Critério de pronto: apenas um sync por userId executa simultaneamente
  - Confiança: 🟢

- [ ] T-06 — Implementar controllers e rotas REST com JWT
  - Origem: `backend/src/controllers/vmLav.controller.ts`
  - Critério de pronto: endpoints respondem conforme contracts.md
  - Confiança: 🟢

- [ ] T-07 — **SEGURANÇA:** Implementar criptografia para senha armazenada (substituir texto plano)
  - Origem: ADR-004 (risco identificado)
  - Critério de pronto: senha não legível no banco; descriptografada apenas em runtime
  - Confiança: 🔴 (melhoria necessária, não existente no legado)

## Lacunas Pendentes (🔴)

- **Senha em texto plano:** risco de segurança crítico — priorizar T-07 antes de produção
- **Constantes hardcoded:** `idEmpresa`, `empresaLocalizador`, IDs de serviço — mover para configuração ou env
- **Captcha:** confirmar estratégia de resolução do captcha da tela de login do VM Lav
