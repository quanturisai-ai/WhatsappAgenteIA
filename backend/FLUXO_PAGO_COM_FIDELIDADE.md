# Ordem de execução: pago_com_fidelidade e dependências

## Por que a ordem importa

O campo `pago_com_fidelidade` em `vm_lav_pedidos` é usado em vários pontos **depois** da marcação. Se a marcação rodar tarde demais, pedidos pagos com fidelidade entram indevidamente em contagens e notificações. Se rodar antes de ter dados (movimentos, pedidos), não há o que marcar.

## Onde `pago_com_fidelidade` é usado (precisa já estar setado)

1. **Scheduler – passo 7 (notificações)**  
   - `buscarPedidosNovosPorCpf`: filtra `pago_com_fidelidade = 0` para definir “pedidos novos” que geram notificação de progresso e conquista.  
   - Pedidos com `pago_com_fidelidade = 1` **não** entram nessa lista (não disparam notificação).

2. **Fidelização – contagem e conquistas**  
   - Contagem de lavagens/secagens (progresso do cliente): só considera `pago_com_fidelidade = 0`.  
   - `apurarEConcederPremios`: pedidos com `pago_com_fidelidade` não contam para consumir o objetivo da conquista.

3. **Model/outros**  
   - Leitura/exposição do campo e filtros por `pago_com_fidelidade = 0` em listagens e relatórios.

## Ordem correta no scheduler (sync automática)

A marcação **deve** acontecer:

- **Depois de:**
  - **4.** Sincronizar pedidos (ter pedidos no banco).
  - **5.** Sincronizar vouchers (ter `vm_lav_vouchers`).
  - **5.2** Sincronizar `vm_lav_vouchers_movimentos` (a query de marcação usa essa tabela).

- **Antes de:**
  - **7.** Processar notificações (progresso/conquista), que usam `pago_com_fidelidade` em `buscarPedidosNovosPorCpf` e no serviço de fidelização.

Ordem atual no scheduler:

1. Watermark  
2. Sync clientes  
3. Sync pedidos  
4. Sync vouchers  
5.1 Observação rich (premios_clientes)  
5.2 **Sync vm_lav_vouchers_movimentos**  
6. **Marcar pago_com_fidelidade (por movimentos)**  
7. Notificações (progresso + conquista)

## Sync manual (vouchers)

Em `sincronizarVouchers` já se chama `sincronizarMovimentosVouchers` e, no fluxo que dispara o ciclo completo (`sincronizarUsuario`), o passo 6 continua sendo executado na mesma ordem acima. Assim, na manual a marcação também ocorre após movimentos e antes de qualquer uso de `pago_com_fidelidade`.

## Query usada para identificar pedidos (marcação simplificada)

Pedidos pagos com fidelidade são identificados por:

- `vm_lav_vouchers_movimentos`: `tipo_movimento = 'RETIRADA'`
- Mesmo CPF (voucher ↔ pedido), mesmo equipamento, mesma data (data_movimentacao ↔ data_venda)
- Diferença em segundos entre `data_movimentacao` e `data_venda` ≤ 10
- Pedido com `tipo_pagamento = 'Voucher'` e ainda não marcado (`pago_com_fidelidade = 0` ou `NULL`)

Implementação: `marcarPedidosPagosComFidelidadePorMovimentos(userId)` em `vmLav.service.ts`.
