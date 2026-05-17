# Passo a passo – Verificação de envio de PROGRESSO

Este documento descreve o fluxo de envio de notificações de PROGRESSO e em qual etapa o envio pode estar travando.

---

## Como rodar o diagnóstico para uma data (ex.: 08/03/2026)

No backend, com o banco que contém os pedidos e notificações reais:

```bash
cd backend
DIAG_DATA=2026-03-08 npm run diagnostico:progresso-08-03
```

Ou use a data padrão (2026-03-08) com:

```bash
npm run diagnostico:progresso-08-03
```

O script faz:

1. **Pedidos do dia** – Lista pedidos com `data_venda` na data, `situacao_venda = 'Sucesso'` e CPF preenchido; separa elegíveis (`pago_com_fidelidade = 0`) dos demais.
2. **PROGRESSO do dia** – Notificações com `tipo_notificacao = 'PROGRESSO'` e `data_envio` ou `data_venda` na data.
3. **Gap** – CPFs que tiveram pedido elegível no dia mas **não** têm PROGRESSO nessa data.
4. **Por que não enviou** – Para cada usuário com gap (ou com pedidos no dia): `notificar_progresso`, barreira, watermark, amostra de clientes sem telefone.
5. **Todas as notificações do dia** – Contagem por tipo (PROGRESSO, CONQUISTA, gatilhos, etc.) para comparar volume.

No final o script imprime o **passo a passo** abaixo.

---

## Fluxo de envio de PROGRESSO (passo a passo)

### ETAPA 1 – Sincronização (`vmLavScheduler.sincronizarUsuario`)

| Passo | O que acontece | Onde pode travar |
|-------|----------------|-------------------|
| **1.1** | Verifica credenciais VM Lav ativas. | Se inativas ou não encontradas → **para aqui** (não processa notificações). |
| **1.2** | Captura **watermark** = `MAX(data_venda)` em `vm_lav_pedidos` **antes** do sync. | - |
| **1.3** | Sincroniza clientes, pedidos (7 dias), vouchers, movimentos. | Erro em sync não impede seguir; pode afetar dados disponíveis. |
| **1.4** | Marca `pago_com_fidelidade` nos pedidos (por movimentos de voucher). | Pedidos marcados com 1 **são excluídos** da fila de PROGRESSO (etapa 2.2). |
| **1.5** | Se `watermarkAntesDaSync === null` (nenhum pedido no banco antes do sync). | **Para aqui**: log *"Primeira sincronização: pedidos históricos não geram notificações"* → **nenhum PROGRESSO é enviado**. |

**Trava em 1.5:** na primeira vez que o usuário tem sync (banco sem pedidos antes), o watermark é `null` e o fluxo de notificações não roda.

---

### ETAPA 2 – Quem entra na fila de notificação

| Passo | O que acontece | Onde pode travar |
|-------|----------------|-------------------|
| **2.1** | Lê `fidelizacao_config`: `notificar_progresso`, `simulacao_desativada_em` (dataBarreira). | - |
| **2.2** | `buscarPedidosNovosPorCpf(userId, watermarkAntesDaSync, dataBarreira)` retorna um CPF por cliente, com o pedido mais recente. Critérios do pedido: | Pedido **não entra** na fila se: |
| | • `user_id = userId` | |
| | • `data_venda > watermark` | `data_venda` ≤ watermark (já “contado” em run anterior). |
| | • Se houver barreira: `data_venda >= dataBarreira` | `data_venda` < barreira (ex.: simulação desativada depois). |
| | • `situacao_venda = 'Sucesso'` | Pedido não é Sucesso. |
| | • `pago_com_fidelidade = 0` | Pedido pago com fidelidade (marcado na etapa 1.4). |
| | • `cliente_cpf` não nulo e não vazio | Sem CPF. |
| **2.3** | Se `notificar_progresso === false` na config. | **Nenhum PROGRESSO é enviado** (nem gravado). |
| **2.4** | Se `pedidosNovosPorCpf.size === 0`. | Log *"Nenhum pedido genuinamente novo desde o último sync"* → **não envia PROGRESSO**. |

**Travas na etapa 2:**  
- **2.3:** Config com “notificar progresso” desligado.  
- **2.4:** Nenhum pedido passou nos filtros (watermark, barreira, `pago_com_fidelidade`, etc.).  
- **2.2:** Pedidos do dia podem estar fora da fila se o **watermark** daquele run for já maior ou igual à `data_venda` deles (ex.: sync rodou depois e o watermark já subiu), ou se estiverem com `pago_com_fidelidade = 1` ou `data_venda` antes da barreira.

---

### ETAPA 3 – Para cada CPF na fila: `enviarNotificacaoProgressoPorPedido`

| Passo | O que acontece | Onde pode travar |
|-------|----------------|-------------------|
| **3.1** | Lê de novo `notificar_progresso`. Se `false`. | **Return** → não grava nem envia. |
| **3.2** | Busca cliente por CPF em `vm_lav_clientes`. Se não existe ou **sem telefone**. | Log *"Cliente não encontrado ou sem telefone"* → **return** → **não grava** PROGRESSO. |
| **3.3** | Obtém saldos de fidelidade e monta a mensagem. | Erro aqui → exceção → não grava. |
| **3.4** | **INSERT** em `fidelizacao_notificacoes` (pedido_id, data_venda, tipo PROGRESSO, etc.). | Duplicata (ex.: mesmo pedido/CPF em outro run) → exceção tratada; log de duplicidade. |
| **3.5** | Se `config.simulacao === true`. | Só log *"[SIMULAÇÃO]"*; **não envia** WhatsApp (registro existe com `enviado_whatsapp = false`). |
| **3.6** | Se WhatsApp não está pronto (`!whatsappService || !isReady()`). | **Update** na notificação com `erro = 'WhatsApp não está pronto'`; registro existe. |
| **3.7** | Chama `sendMessage(telefone, mensagem)`. Se falhar. | **Update** na notificação com `erro = error.message`; registro existe (ex.: erro "t" truncado). |

**Travas na etapa 3:**  
- **3.1:** Config desligada (raro, já checado na etapa 2).  
- **3.2:** Cliente sem cadastro ou **sem telefone** → **não grava** PROGRESSO.  
- **3.5:** Modo simulação → grava mas não envia.  
- **3.6 / 3.7:** Grava e marca erro; envio que “falhou” (WhatsApp não pronto ou erro no envio).

---

## Resumo – Onde pode estar travando

| Se o cliente… | Provável etapa |
|----------------|----------------|
| Não tem **nenhum** registro em `fidelizacao_notificacoes` com tipo PROGRESSO para o pedido/dia | Travou **antes** de 3.4: 1.5 (watermark null), 2.3 (notificar_progresso false), 2.4 (fila vazia), 3.2 (sem telefone) ou erro antes do INSERT. |
| Tem registro PROGRESSO com `enviado_whatsapp = 0` e `erro` preenchido | Passou até 3.4; travou no **envio**: 3.5 (simulação), 3.6 (WhatsApp não pronto) ou 3.7 (falha no envio). |

Para um dia específico (ex.: 08/03/2026), use o script com `DIAG_DATA=2026-03-08` no ambiente com os dados reais e confira:  
- quantos pedidos elegíveis existem;  
- quantos PROGRESSO foram gravados nessa data;  
- o gap (quem não tem PROGRESSO);  
- config, barreira e telefone para esse usuário/CPFs.

Isso indica em qual etapa o envio está travando (sem gravar vs. gravando mas sem enviar).
