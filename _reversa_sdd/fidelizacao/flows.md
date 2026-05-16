# Fidelização — Fluxos Detalhados

> Gerado pelo Writer (Reversa) em 2026-05-16

## Fluxo 1: Cálculo e Apuração de Saldo de Fidelidade

```
Operador ou sistema chama: POST /api/fidelizacao/clientes/:cpf/apurar
        │
        ▼
normalizeCpfToDigits(cpf) → "12345678900"
        │
        ▼
SELECT vm_lav_pedidos WHERE:
  normalizeCpfColumnSql(cpf_cliente) = '12345678900'
  AND situacao_venda = 'Sucesso'
  AND pago_com_fidelidade = 0
        │
        ▼
totalUtilizacoes = count(pedidos filtrados)
        │
        ▼
SELECT premios ORDER BY meta ASC
        │
        ▼
Para cada prêmio:
  se totalUtilizacoes >= premio.meta:
    ├── Verifica se PremioCliente já existe (evita duplicata)
    └── Se não existe: INSERT premios_clientes (cliente_cpf, premio_id, status='conquistado')
        │
        ▼
Retorna: { conquistasGeradas: N }
        │
        ▼
[Opcional] Gerar voucher automático:
FidelizacaoVoucherAutoService.gerarSeNecessario(cpf, conquista)
  └── POST API VM Lav: criar voucher do tipo_servico do prêmio
```

---

## Fluxo 2: Motor de Automações — Execução de Regra

```
[Cron ou evento] FidelizacaoRegrasService.executarTodasRegras(userId)
        │
        ▼
SELECT regras WHERE ativa=true AND user_id=userId
        │
        ▼
Para cada regra:
  │
  ├── Verifica vigência:
  │     NOW() >= vigencia_inicio AND NOW() <= vigencia_fim
  │     Se fora: SKIP
  │
  ├── Busca clientes elegíveis (segmentacao_publico)
  │     Ex: clientes sem compras há N dias
  │     SELECT vm_lav_clientes WHERE [critérios de segmentação]
  │
  ├── Para cada cliente elegível:
  │     │
  │     ├── Verifica bloqueio_antispam:
  │     │     SELECT fidelizacao_notificacoes WHERE
  │     │       regra_id = regra.id AND cliente_cpf = cpf
  │     │       AND created_at > NOW() - intervalo_verificacao_automacoes
  │     │     Se existe: SKIP (bloqueado)
  │     │
  │     ├── Verifica bloqueado_semanal / bloqueado_mensal
  │     │     Se aplicável e já enviado: SKIP
  │     │
  │     └── Dispara notificação:
  │           WhatsAppService.sendMessage(cliente.telefone, mensagem_da_regra)
  │           INSERT fidelizacao_notificacoes (regra_id, cliente_cpf, status='enviado')
  │
  └── Atualiza métricas da regra (total_disparos++)
```

---

## Fluxo 3: Geração de Voucher para Conquista

```
Operador: PUT /api/fidelizacao/conquistas/:id/gerar-voucher
        │
        ▼
SELECT premios_clientes WHERE id = :id AND user_id = userId
        │
        ▼
SELECT premios WHERE id = conquista.premio_id
        │
        ▼
FidelizacaoVoucherAutoService.gerarVoucher(conquista, premio):
  1. VmLavConnectionManager.getToken(userId) → jwt
  2. POST https://apps.vmhub.vmtecnologia.io/wallet/api/v1/vouchers
     Body: {
       idEmpresa: 1737,
       cpf_cliente: conquista.cliente_cpf,
       tipo_servico: premio.tipo_servico,  // ex: 3837 = LAVAGEM
       ...
     }
  3. Recebe: { codigo: "XXXX", validade: "..." }
        │
        ▼
UPDATE premios_clientes SET voucher_codigo=..., voucher_gerado_at=NOW()
        │
        ▼
Retorna: { voucher: { codigo, validade } }
```
