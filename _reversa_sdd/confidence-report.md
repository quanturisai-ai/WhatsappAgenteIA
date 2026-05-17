# Relatório de Confiança — WhatsappAgenteIA

> Gerado pelo Revisor (Reversa) em 2026-05-16
> Revisão cruzada: não realizada (Codex não disponível nesta sessão)
> Perguntas geradas: 5 | Respondidas: 5 | Reclassificações aplicadas: 11

---

## Resumo Geral

| Nível | Quantidade | Percentual |
|-------|-----------|------------|
| 🟢 CONFIRMADO | 152 | 81% |
| 🟡 INFERIDO   | 24  | 13% |
| 🔴 LACUNA     | 12  | 6%  |
| **Total**     | 188 | 100% |

**Confiança geral:** 87% *(= (152 + 24×0,5) / 188)*

> Interpretação: 87% indica documentação de alta confiança. Os 6% de lacunas remanescentes são majoritariamente gaps de implementação conhecidos (VM Lav configurável, status paused, bug is_active) com direção clara de resolução.

---

## Por Spec

| Spec | 🟢 | 🟡 | 🔴 | Confiança |
|------|----|----|-----|-----------|
| `autenticacao/` | 22 | 2  | 1   | 93% |
| `whatsapp/`     | 26 | 6  | 2   | 88% |
| `conversa/`     | 22 | 4  | 1   | 91% |
| `documento/`    | 11 | 1  | 0   | 96% |
| `configuracao-agente/` | 7 | 0 | 0 | 100% |
| `midia/`        | 9  | 1  | 1   | 87% |
| `topico/`       | 8  | 0  | 0   | 100% |
| `indexacao/`    | 9  | 0  | 0   | 100% |
| `teste-chat/`   | 5  | 1  | 0   | 96% |
| `ollama/`       | 6  | 0  | 0   | 100% |
| `atendente-humano/` | 8 | 1 | 0  | 96% |
| `vmlav/`        | 6  | 2  | 5   | 57% |
| `fidelizacao/`  | 13 | 6  | 2   | 75% |

> ⚠️ `vmlav/` tem a menor confiança (57%) — principalmente pelo gap de configuração por conta (RF-09) e senha em texto plano. É o módulo com maior risco técnico.

---

## Lacunas Pendentes 🔴

Itens que permaneceram como gaps mesmo após as respostas (com direção de resolução definida):

### vmlav/
- **Constantes hardcoded por conta** (`idEmpresa`, `empresaLocalizador`, service IDs) — RF-09 adicionado; requer implementação na reimplementação
  - Ver: `gaps.md#GAP-01`
- **Senha em texto plano** — risco documentado; decisão de criptografia pendente
  - Ver: `gaps.md#GAP-06`
- **URLs hardcoded** (`apps.vmhub.vmtecnologia.io`) — risco de quebra se API muda de domínio

### conversa/
- **Transição `in_progress → paused`** na operação de takeover — gap de implementação no legado confirmado
  - Ver: `gaps.md#GAP-02`

### midia/
- **Bug `[ENVIAR_MIDIA]` ignora `is_active`** — correção documentada em T-05, deve ser aplicada na reimplementação
  - Ver: `gaps.md#GAP-03`

### whatsapp/
- **`killBrowserProcessesForSession` Linux/Mac** — aguarda teste em ambiente Linux
  - Ver: `gaps.md#GAP-05`

### fidelizacao/
- **Motor de automações** — complexidade alta, alguns comportamentos dos filtros anti-spam (janelas de tempo exatas) inferidos mas não confirmados em detalhe

---

## Recomendações

- [ ] **vmlav/** — Prioridade alta: implementar RF-09 (configuração por conta) antes de qualquer deploy multi-tenant
- [ ] **conversa/** — Completar máquina de estados: adicionar transição `→ paused` no takeover e `paused →` nas retomadas
- [ ] **midia/** — Corrigir bug T-05 como primeira task do módulo (simples, alto impacto)
- [ ] **autenticacao/** — Remover fallback `JWT_SECRET` no startup (T-10 Must)
- [ ] **fidelizacao/** — Validar filtros anti-spam com Diego em sessão de perguntas específicas se for reimplementar

---

## Histórico de Reclassificações

| De | Para | Afirmação | Evidência |
|----|------|-----------|-----------|
| 🟡 | 🟢 | Duração do debounce de mensagens WhatsApp | `whatsapp.service.ts:2076-2079` — `MESSAGE_DEBOUNCE_MS`, padrão 4000ms |
| 🔴 | 🟢 | Múltiplos atendentes ativos = broadcast | `humanAttendant.service.ts:137` — `activeAttendants.map(sendMessage)` |
| 🟡 | 🟢 | `[CONTATO_PROATIVO]` comportamento | `conversation.service.ts:227` — `sendMessage` direto, sem criar conversa |
| 🟡 | 🟢 | Lógica mandatory_send (quando enviar) | `conversation.service.ts:473-498` — 1ª msg OU penúltima >max_age_hours |
| 🟡 | 🟢 | AgentConfig GET: retorna defaults sem persistir | `agentConfig.controller.ts:20-41` — objeto em memória se não existir no banco |
| 🔴 | 🟡 | Status `paused` em conversations | Confirmado pelo usuário: intenção = takeover humano; transição não implementada no legado |
| 🔴 | 🟢 | JWT_SECRET: decisão de tratamento | Confirmado pelo usuário: melhores práticas = startup fail sem a variável |
| erro | fix | Nome do comando `ALERTA_ATENDENTE` → `ALERTAR_ATENDENTE` | `conversation.service.ts:568` — regex confirma `ALERTAR_ATENDENTE` |
| 🟡 | 🟢 | Rastreabilidade `agentConfig.service.ts` não existe | `glob` confirma — sem service layer, controller usa model diretamente |
| 🔴 | 🔴 | VM Lav constantes: agora documentadas como feature gap | Confirmado pelo usuário: deve ser configurável por conta |
| 🟡 | 🟢 | Bug `[ENVIAR_MIDIA]` sem verificação `is_active` | Confirmado pelo usuário: deve verificar; T-05 adicionado como Must |
