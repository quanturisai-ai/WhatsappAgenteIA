# Flowchart — Módulo `vmLav`

> Gerado pelo Arqueólogo (Reversa) em 2026-05-16

## Fluxo: Configuração de Credenciais (Login Puppeteer)

```mermaid
flowchart TD
    A[configurarCredenciais\nemail, senha] --> B[Puppeteer lança Chrome\nnavegar até loginUrl]
    B --> C[Preencher email e senha\nno formulário]
    C --> D[Aguardar resolução\nde CAPTCHA pelo usuário]
    D --> E{Login bem-sucedido?}
    E -- não --> F[Retornar erro]
    E -- sim --> G[Extrair JWT do localStorage\ne cookies]
    G --> H[Salvar VmLavCredentials\nno banco]
    H --> I[Fechar browser]
```

## Fluxo: Sincronização de Clientes e Pedidos

```mermaid
flowchart TD
    A[VmLav Scheduler\n10 minutos] --> B{userId já\ntem sync ativo?}
    B -- sim --> C[Pular execução\nprevenção de concorrência]
    B -- não --> D[activeSyncs.set userId=true]
    D --> E[VmLavConnectionManager\nGetOrRenewToken]
    E --> F[GET /relatorios/clientes\ncom token JWT]
    F --> G{Response OK?}
    G -- não --> H{Token expirado 401?}
    H -- sim --> I[VmLavTokenRenewal\nRenovar token via Puppeteer]
    I --> J[Repetir requisição]
    G -- sim --> K{Para cada cliente}
    K --> L[UPSERT vm_lav_clientes\nbaseado no CPF]
    L --> M[GET /relatorios/pedidos\ndo cliente]
    M --> N[UPSERT vm_lav_pedidos]
    N --> O[Salvar VmLavSincronizacaoLog]
    O --> P[activeSyncs.delete userId]
```

## Fluxo: Renovação de Token (VmLavConnectionManager)

```mermaid
flowchart TD
    A[Token expirado\nou 401 response] --> B{Renovação\nmanual possível?}
    B -- não --> C[Puppeteer faz login\nnovo com credenciais salvas]
    C --> D{Login OK?}
    D -- não --> E[Marcar status=desconectado\nno banco]
    D -- sim --> F[Atualizar token\nno banco]
    F --> G[Repetir requisição\noriginal]
```
