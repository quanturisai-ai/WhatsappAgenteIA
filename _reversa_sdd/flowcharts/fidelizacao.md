# Flowchart — Módulo `fidelizacao`

> Gerado pelo Arqueólogo (Reversa) em 2026-05-16

## Fluxo: Motor de Disparo de Regras

```mermaid
flowchart TD
    A[processarRegrasUsuario userId\nVmLav Scheduler 10min] --> B{Config do módulo\nativo=true?}
    B -- não --> C[Retornar sem ação]
    B -- sim --> D[Buscar regras ativas\ndo usuário]
    D --> E{Para cada regra}
    E --> F{Vigência ativa?\nini <= hoje <= fim}
    F -- não --> G[Pular regra]
    F -- sim --> H[Buscar clientes alvo\npela segmentação do público]
    H --> I{Para cada cliente}
    I --> J{Cliente já recebeu\nnotificação recente?}
    J -- sim --> K[Status: bloqueado_antispam\nou bloqueado_semanal/mensal]
    J -- não --> L{Intervalo mínimo\nrespeitado?}
    L -- não --> K
    L -- sim --> M[Renderizar template\nda mensagem com dados do cliente]
    M --> N[WhatsAppService.sendMessage\nEnviar notificação]
    N --> O[Salvar FidelizacaoNotificacao\nstatus=enviado]
    N --> P{Gatilho é\nvoucher automático?}
    P -- sim --> Q[FidelizacaoVoucherAutoService\nCriar voucher na API VM Lav]
```

## Fluxo: Cálculo de Saldo de Fidelidade

```mermaid
flowchart TD
    A[getSaldoFidelidade cpf] --> B[Normalizar CPF\nnormalizeCpfToDigits]
    B --> C[Buscar pedidos no banco\nSucesso + pago_com_fidelidade=0]
    C --> D[Contar por tipo_servico\nLavagem, Secagem, Total]
    D --> E[Buscar prêmios ativos\ndo usuário por tipo]
    E --> F{Para cada prêmio\nna ordem de meta ASC}
    F --> G{utilizações >= meta?}
    G -- sim --> H[Prêmio conquistado\nregistrar ou verificar PremioCliente]
    G -- não --> I[Calcular faltam\nmeta - atual]
    I --> J[Retornar SaldoFidelidade\natual, proximoObjetivo, faltam, proximoPremio]
```

## Segmentação de Público — Filtros disponíveis

```mermaid
flowchart LR
    A[segmentacao_publico JSON] --> B{dias_sem_compra?}
    B -- sim --> C[Filtrar clientes\ndata_ultima_compra < hoje - N dias]
    A --> D{mes_aniversario?}
    D -- sim --> E[Filtrar clientes\ncom aniversário no mês]
    A --> F{qtd_compras_min?}
    F -- sim --> G[Filtrar clientes\ncom >= N compras]
    A --> H{valor_min_compras?}
    H -- sim --> I[Filtrar clientes\ncom valor_total >= X]
    A --> J{...outros filtros}
```
