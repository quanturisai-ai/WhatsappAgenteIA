# Investigação: PROGRESSO não enviado (automação ativa e após desativar)

Com base nos dados do diagnóstico de 08/03/2026 e na análise do código.

---

## Resumo do diagnóstico (08/03/2026)

- **29 pedidos** do dia (13 CPFs distintos, todos elegíveis)
- **14 PROGRESSO** enviados (8 CPFs)
- **5 CPFs em gap** (sem PROGRESSO): 40235602191, 65959434172, 71322898294, 78735661100, 94075565149
- **CPF 94075565149** recebeu **4 INCENTIVO_DIA_UTIL** no dia, mas nenhum PROGRESSO
- Os outros 4 não receberam nenhuma notificação no dia
- Todos os 5 têm telefone cadastrado
- Config: `notificar_progresso=true`, `simulacao=0`

---

## Causas identificadas no código

### 1. **Comparação exata de CPF em `buscarClientePorCpf` (crítico)**

**Arquivo:** `backend/src/services/fidelizacaoNotificacao.service.ts` (linha 374)

```typescript
return clientes.clientes.find(c => c.cpf === cpf) || null;
```

A busca usa **comparação exata** (`===`). Se o pedido tiver `cliente_cpf = "123.456.789-00"` e `vm_lav_clientes` tiver `cpf = "12345678900"` (ou o contrário), o cliente **não é encontrado**. Nesse caso:

- `cliente` fica `null`
- O fluxo retorna antes de gravar PROGRESSO (linha 576–578)
- Log: *"Cliente não encontrado ou sem telefone para notificação de progresso"*

**Impacto:** CPFs em formatos diferentes entre `vm_lav_pedidos` e `vm_lav_clientes` nunca recebem PROGRESSO.

**Correção sugerida:** Normalizar CPF (só dígitos) antes de comparar, por exemplo com `normalizeCpfToDigits` de `cpfUtils`.

---

### 2. **Agrupamento por CPF em `buscarPedidosNovosPorCpf`**

**Arquivo:** `backend/src/utils/vmLavScheduler.ts` (linhas 72–79)

```typescript
const cpf = row.cliente_cpf as string;
// ...
cpfMap.set(cpf, { pedidoId: row.id, dataVenda });
```

O agrupamento usa `cliente_cpf` bruto. O mesmo cliente pode aparecer com formatos diferentes em pedidos diferentes (ex.: `"123.456.789-00"` e `"12345678900"`), gerando **duas entradas** no mapa. Uma delas pode ser processada e a outra ignorada, ou ambas, dependendo da ordem.

**Impacto:** Possível perda de PROGRESSO para clientes com CPF em formatos mistos.

**Correção sugerida:** Usar CPF normalizado (só dígitos) como chave do mapa.

---

### 3. **Trava de concorrência por operação, não por fluxo**

**Arquivo:** `backend/src/services/vmLav.service.ts`

A trava `activeSyncs` é usada **por operação** (clientes, pedidos, vouchers), não por todo o fluxo de `sincronizarUsuario`:

- `sincronizarClientes`: set no início, delete no fim
- `sincronizarPedidos`: set no início, delete no fim
- `sincronizarVouchers`: idem

Quando uma operação termina, a trava é liberada. Duas execuções de `sincronizarUsuario` podem **intercalar**:

- Run A: sync clientes (libera)
- Run B: sync clientes (libera)
- Run A: sync pedidos (libera)
- Run B: sync pedidos (libera)
- etc.

Cada run usa seu próprio watermark. O resultado é imprevisível e pode gerar:

- Pedidos processados duas vezes
- Pedidos nunca processados (watermark “avançado” em um run)
- Conflitos de dados

**Impacto:** Com automação ativa, o fluxo demora mais e a janela de overlap aumenta. A concorrência pode fazer com que alguns pedidos nunca entrem na fila de PROGRESSO.

---

### 4. **“Sincronização já em andamento”**

Quando uma segunda sync tenta iniciar enquanto a primeira ainda está em uma operação (clientes, pedidos ou vouchers), ela recebe *"Sincronização já em andamento"* e **retorna imediatamente**, sem executar o restante do fluxo (incluindo PROGRESSO).

**Impacto:** O run que perde a corrida **não processa PROGRESSO**. Se o run que ganhou falhar depois (ex.: erro em regras), pode não haver outro run para compensar.

---

### 5. **Watermark e pedidos retroativos**

`buscarPedidosNovosPorCpf` usa `data_venda > watermark`. O watermark é `MAX(data_venda)` em `vm_lav_pedidos` **antes** do sync.

Pedidos com `data_venda` **anterior** ao watermark (ex.: sincronização retroativa) **nunca** entram na fila de PROGRESSO.

**Impacto:** Pedidos que chegam “atrasados” na base nunca geram PROGRESSO.

---

### 6. **Sync manual e watermark**

No fluxo de sync manual (`sincronizarClientesManual`):

1. Sync clientes, pedidos, vouchers
2. `setImmediate(sincronizarUsuario)`

Quando `sincronizarUsuario` roda, o watermark é calculado **depois** de o manual já ter gravado os pedidos. Nesse cenário, `watermark = MAX(data_venda)` já inclui os pedidos recém-sincronizados. A condição `data_venda > watermark` tende a não ser satisfeita, e a fila de PROGRESSO fica vazia.

**Impacto:** Sync manual pode não disparar PROGRESSO para os pedidos que acabou de sincronizar.

---

### 7. **Automação não bloqueia PROGRESSO diretamente**

`verificarBloqueios` em `fidelizacaoRegras.service.ts` considera apenas notificações com `regra_id IS NOT NULL`. PROGRESSO tem `regra_id = null`, então **não entra** no limite de automação.

Ou seja, o anti-spam das regras **não** impede o envio de PROGRESSO.

---

## Por que piora com automação ativa?

1. **Duração do fluxo:** Com regras ativas, o fluxo fica mais longo (sync + PROGRESSO + muitas regras). A janela em que outra sync pode iniciar aumenta.
2. **Concorrência:** Trava por operação permite intercalação de runs e watermarks diferentes.
3. **“Sincronização já em andamento”:** Mais tentativas de sync (manual ou automática) durante o fluxo longo aumentam a chance de um run inteiro ser abortado antes de processar PROGRESSO.

---

## Por que alguns clientes ainda não recebem após desativar?

1. **Formato de CPF:** Se `buscarClientePorCpf` não encontra o cliente por diferença de formato, PROGRESSO continua não sendo enviado.
2. **Pedidos retroativos:** Pedidos com `data_venda` antiga nunca entram na fila.
3. **Watermark:** Se o watermark já passou da `data_venda` do pedido em runs anteriores, esse pedido não será reprocessado.

---

## Ações recomendadas (em ordem de prioridade)

1. **Corrigir `buscarClientePorCpf`** para usar CPF normalizado na comparação.
2. **Corrigir `buscarPedidosNovosPorCpf`** para agrupar por CPF normalizado.
3. **Revisar a trava de concorrência** para cobrir todo o fluxo de `sincronizarUsuario` (incluindo PROGRESSO e regras), não só cada operação de sync.
4. **Revisar o fluxo de sync manual** para garantir que o watermark permita processar os pedidos recém-sincronizados.
5. **Criar job de recuperação** para pedidos elegíveis sem PROGRESSO (ex.: `data_venda` antiga, CPF com formato diferente), para reprocessar casos perdidos.
