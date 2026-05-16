# Fidelização — Design Técnico

> Gerado pelo Writer (Reversa) em 2026-05-16

## Interface

| Método | Caminho | Saída | Status codes |
|--------|---------|-------|--------------|
| GET | `/api/fidelizacao/premios` | `Premio[]` | 200, 401 |
| POST | `/api/fidelizacao/premios` | `Premio` | 201, 400, 401 |
| PUT | `/api/fidelizacao/premios/:id` | `Premio` | 200, 401, 404 |
| DELETE | `/api/fidelizacao/premios/:id` | `{ message }` | 200, 401, 404 |
| GET | `/api/fidelizacao/clientes` | `ClienteFidelidade[]` | 200, 401 |
| GET | `/api/fidelizacao/clientes/distribuicao` | `DistribuicaoPercentual[]` | 200, 401 |
| GET | `/api/fidelizacao/clientes/:cpf` | `SaldoFidelidade` | 200, 401, 404 |
| GET | `/api/fidelizacao/clientes/:cpf/pedidos` | `VmLavPedido[]` | 200, 401 |
| POST | `/api/fidelizacao/clientes/:cpf/apurar` | `{ conquistasGeradas }` | 200, 401 |
| GET | `/api/fidelizacao/conquistas` | `PremioCliente[]` | 200, 401 |
| PUT | `/api/fidelizacao/conquistas/:id/utilizar` | `PremioCliente` | 200, 401, 404 |
| PUT | `/api/fidelizacao/conquistas/:id/entrega` | `PremioCliente` | 200, 401, 404 |
| PUT | `/api/fidelizacao/conquistas/:id/gerar-voucher` | `{ voucher }` | 200, 401, 404 |
| GET | `/api/fidelizacao/notificacoes` | `FidelizacaoNotificacao[]` | 200, 401 |
| POST | `/api/fidelizacao/notificacoes/:id/reenviar` | `{ message }` | 200, 401, 404 |
| GET | `/api/fidelizacao/config` | `FidelizacaoConfig` | 200, 401 |
| PATCH | `/api/fidelizacao/config/simulacao` | `FidelizacaoConfig` | 200, 401 |
| GET | `/api/fidelizacao/automacoes/tipos` | `TipoGatilho[]` | 200, 401 |
| GET | `/api/fidelizacao/automacoes/config` | `AutomacoesConfig` | 200, 401 |
| PUT | `/api/fidelizacao/automacoes/config` | `AutomacoesConfig` | 200, 401 |
| GET | `/api/fidelizacao/automacoes/regras` | `FidelizacaoRegra[]` | 200, 401 |
| GET | `/api/fidelizacao/automacoes/regras/:id` | `FidelizacaoRegra` | 200, 401, 404 |
| POST | `/api/fidelizacao/automacoes/regras` | `FidelizacaoRegra` | 201, 400, 401 |
| PUT | `/api/fidelizacao/automacoes/regras/:id` | `FidelizacaoRegra` | 200, 401, 404 |
| DELETE | `/api/fidelizacao/automacoes/regras/:id` | `{ message }` | 200, 401, 404 |
| PATCH | `/api/fidelizacao/automacoes/regras/:id/toggle` | `FidelizacaoRegra` | 200, 401, 404 |
| POST | `/api/fidelizacao/automacoes/regras/preview` | `PreviewResult` | 200, 400, 401 |
| POST | `/api/fidelizacao/automacoes/regras/:id/preview` | `PreviewResult` | 200, 401, 404 |

**Tipo `SaldoFidelidade`:**
```ts
{
  atual: number;
  proximoObjetivo: number;
  faltam: number;
  proximoPremio: string;
  conquistas: number;
}
```

## Algoritmo — Cálculo de Saldo

```
FidelizacaoService.calcularSaldo(cpf, userId):

1. normalizeCpfToDigits(cpf) → cpfDigits

2. SELECT pedidos FROM vm_lav_pedidos
   WHERE cpf_cliente = normalizeCpfColumnSql('cpf')
   AND situacao_venda = 'Sucesso'
   AND pago_com_fidelidade = 0
   → totalUtilizacoes

3. SELECT premios FROM premios
   WHERE user_id = userId
   ORDER BY meta ASC

4. Para cada prêmio (em ordem crescente de meta):
   se totalUtilizacoes >= premio.meta → conquista registrada
   senão → proximoObjetivo = premio.meta; faltam = meta - total; break

5. Retorna SaldoFidelidade
```

## Algoritmo — Motor de Automações

```
FidelizacaoRegrasService.executarRegra(regra, cliente):

1. Verifica vigência: NOW() BETWEEN vigencia_inicio AND vigencia_fim
2. Verifica segmentacao_publico (ex: sem compras há N dias)
3. Verifica bloqueio anti-spam:
   - bloqueado_antispam: último envio < intervalo_verificacao_automacoes
   - bloqueado_semanal: enviado nesta semana
   - bloqueado_mensal: enviado neste mês
4. Se todos os checks passam: dispara notificação + geração de voucher (se configurado)
5. Registra em FidelizacaoNotificacao → previne duplicatas futuras
```

## Dependências

- `VmLavService` / `FidelizacaoVoucherAutoService` — criação de vouchers na API VM Lav
- `WhatsAppService` — envio de notificações de fidelidade via WhatsApp
- `vm_lav_clientes`, `vm_lav_pedidos` — fonte de dados sincronizados do VM Lav
- `cpfUtils.ts` — normalização de CPF para joins/buscas

## Riscos e Lacunas

- 🟡 Geração de voucher requer sessão VM Lav ativa — falha silenciosa se não autenticado?
- 🟡 Motor de automações: frequência de execução automática não confirmada (cron? evento?)
- 🟡 `segmentacao_publico` — estrutura exata do campo JSON não confirmada
