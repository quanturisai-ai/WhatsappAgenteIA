# Relatório de verificação – PROGRESSO de fidelização

Data da verificação: execução automática do script e análise dos logs.

---

## 1. Logs

### 1.1 Pasta de logs
- **Local:** `backend/logs/`
- **Arquivos:** `combined.log`, `error.log` (entre outros).

### 1.2 Erros de envio de notificação de progresso
- **Quantidade em `error.log`:** **191** ocorrências da mensagem  
  `"Erro ao enviar notificação de progresso para pedido XXXXX: t"`.
- **Período amostrado:** 2026-02-09 a 2026-02-13 (e possivelmente mais).
- **Conclusão:** A notificação **foi gravada** em `fidelizacao_notificacoes` (o `create` roda antes do envio). O **envio** via WhatsApp falhou; o campo `erro` ficou com o valor `"t"` (mensagem truncada ou erro que stringificou como `"t"`). Ou seja, o problema observado é de **envio**, não de gravação.

### 1.3 Concorrência
- Em `combined.log` aparecem:
  - `"Erro ao sincronizar clientes para usuário 1: Sincronização já em andamento para este usuário."`
  - `"Erro ao sincronizar pedidos para usuário 1: Sincronização já em andamento para este usuário."`
- Isso indica **dois fluxos de sincronização** rodando ao mesmo tempo para o mesmo usuário (scheduler + manual ou dois runs sobrepostos).

### 1.4 Sucessos
- **32** linhas em `combined.log` com `"Notificação de progresso enviada"` (pedido X, cliente Y), mostrando que PROGRESSO às vezes é enviado com sucesso.

---

## 2. Concorrência (scheduler)

- **Intervalo do timer:** `startScheduler()` é chamado sem argumentos → **60.000 ms (1 minuto)**.
- **Intervalo por usuário:** Em `verificarESincronizarUsuarios` usa-se `intervalo_sincronizacao_minutos` de `vm_lav_credentials` (default **60 min**). A próxima sync do mesmo usuário só é disparada após esse intervalo.
- **Atualização de `ultima_sincronizacao`:** Feita após sync de clientes e após sync de pedidos (no meio do fluxo), não ao final de `sincronizarUsuario`. Ou seja, o “relógio” dos 60 min não espera terminar notificações (PROGRESSO) nem regras.
- **Conclusão:** Overlap é possível quando há **sync manual** (ex.: pela UI) ao mesmo tempo que a sync automática, gerando “Sincronização já em andamento”.

---

## 3. Configuração (banco)

- Foi executado o script **`verificar-progresso-fidelizacao.ts`** (comando: `npm run verificar:progresso`).
- No ambiente onde o script rodou, as tabelas **`fidelizacao_config`** e **`fidelizacao_regras_config`** não tinham registros (banco vazio ou outro ambiente).
- **Recomendação:** Rodar no mesmo ambiente onde o backend de produção escreve os logs e onde estão os dados reais:
  ```bash
  cd backend && npm run verificar:progresso
  ```
  Assim o relatório trará:
  - Valores atuais de `notificar_progresso` e `ativo` (automação).
  - Resumo de notificações por tipo (PROGRESSO vs regras).
  - Amostra de PROGRESSO com erro e pedidos elegíveis sem PROGRESSO.

---

## 4. Pedidos “sem PROGRESSO”

- Na base em que o script foi executado, a consulta de “pedidos elegíveis sem notificação PROGRESSO” não retornou linhas (tabelas vazias ou sem pedidos elegíveis).
- **Critério de elegibilidade** (usado no script e em `buscarPedidosNovosPorCpf`):
  - `situacao_venda = 'Sucesso'`
  - `pago_com_fidelidade = 0`
  - `cliente_cpf` não nulo e não vazio.
- Pedidos com `pago_com_fidelidade = 1` **não** entram na lista de “novos para notificar” e por isso não geram PROGRESSO.

---

## 5. Resumo e recomendações

| Item | Resultado |
|------|-----------|
| **Logs** | 191 erros de **envio** de PROGRESSO (gravação ok; erro no WhatsApp registrado como `"t"`). Concorrência (“Sincronização já em andamento”) presente. |
| **Concorrência** | Timer do scheduler a cada 1 min; sync por usuário a cada 60 min; overlap possível com sync manual. |
| **Config (banco)** | Script rodou em ambiente sem dados; rodar `npm run verificar:progresso` no ambiente real. |
| **Pedidos sem PROGRESSO** | Nenhum encontrado no ambiente do script; no ambiente real, o mesmo script lista candidatos. |

### Ações sugeridas
1. **Melhorar o log do erro de envio** em `fidelizacaoNotificacao.service.ts`: registrar `error.message` e, se existir, `error.stack` ou objeto completo, para deixar de gravar só `"t"` e facilitar diagnóstico (ex.: bloqueio WhatsApp, número inválido, etc.).
2. **Evitar overlap de sync:** garantir que não se dispare sync manual enquanto uma sync automática já estiver rodando para o mesmo usuário (ex.: checagem de “sync em andamento” na API de sync manual).
3. **Rodar o script de verificação no ambiente real** e, se houver PROGRESSO com erro ou pedidos elegíveis sem PROGRESSO, usar o relatório para cruzar com períodos em que a automação estava ativa.
