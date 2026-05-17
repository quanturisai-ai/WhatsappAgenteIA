# Gaps e Lacunas — WhatsappAgenteIA

> Gerado pelo Revisor (Reversa) em 2026-05-16
> Lacunas que permaneceram 🔴 ou foram identificadas durante a revisão.

---

## Críticos — Bloqueiam reimplementação fiel

### GAP-01: VM Lav — Configuração por conta não implementada
**Módulo:** `vmlav`
**Descrição:** As constantes `idEmpresa`, `empresaLocalizador`, `lavagem_service_id` e `secagem_service_id` estão hardcoded no legado. O usuário confirmou que devem ser configuráveis por conta/usuário.
**Feature gap:** O modelo de credenciais VM Lav precisa de campos adicionais. A tela de configuração de credenciais precisa expô-los. O `vmLavTokenRenewal.ts` precisa ler do banco em vez de usar constantes.
**Spec afetada:** `_reversa_sdd/vmlav/requirements.md` — RF-09 adicionado
**Severidade:** Crítico — sem isso, o sistema não funciona para múltiplos clientes/lavanderias

---

### GAP-02: Conversa — Transição para `status='paused'` não implementada
**Módulo:** `conversa`
**Descrição:** O ENUM `conversations.status` inclui `'paused'`, com intenção confirmada de uso no takeover humano. Porém o endpoint `POST /:id/takeover` apenas seta `auto_responding=false` sem mudar o status da conversa.
**Feature gap:** O takeover deve também atualizar `status='paused'` e as transições de saída (`paused → in_progress` ao retomar, `paused → finished` ao finalizar) precisam ser implementadas.
**Spec afetada:** `_reversa_sdd/conversa/requirements.md`, `_reversa_sdd/conversa/design.md`
**Severidade:** Crítico — estado inconsistente entre `status` e `auto_responding` no legado

---

### GAP-03: Mídia — Bug `[ENVIAR_MIDIA:id]` ignora `is_active`
**Módulo:** `midia`, `conversa`
**Descrição:** O comando especial `[ENVIAR_MIDIA:id]` na resposta da IA não verifica `is_active=true` antes de enviar. Mídias desativadas podem ser enviadas via comando explícito. Bug confirmado pelo usuário.
**Arquivo:** `backend/src/services/conversation.service.ts:259`
**Fix:** Adicionar verificação `media.is_active === true` ao condicional existente
**Spec afetada:** `_reversa_sdd/midia/requirements.md`, `_reversa_sdd/midia/tasks.md` — T-05 adicionado
**Severidade:** Crítico — comportamento incorreto confirmado

---

## Moderados — Impactam qualidade mas não bloqueiam operação

### GAP-04: Autenticação — Fallback JWT_SECRET inseguro
**Módulo:** `autenticacao`
**Descrição:** `process.env.JWT_SECRET || 'default-secret'` em `auth.service.ts:169` e `middleware/auth.ts:29`. Se não configurado em produção, tokens são forjáveis.
**Status:** Decisão confirmada — app deve falhar no startup sem `JWT_SECRET`. T-10 atualizado como Must.
**Spec afetada:** `_reversa_sdd/autenticacao/tasks.md` — T-10 (atualizado para 🟢 Must)
**Severidade:** Moderado no legado (já documentado); **deve ser corrigido na reimplementação**

---

### GAP-05: WhatsApp — `killBrowserProcessesForSession` apenas Windows
**Módulo:** `whatsapp`
**Descrição:** Logout completo não encerra processos Chrome em Linux/Mac. Confirmado pelo comentário `"por ora não implementado"` no código.
**Status:** Aguarda teste em ambiente Linux para determinar prioridade. T-12 marcado como Should.
**Spec afetada:** `_reversa_sdd/whatsapp/tasks.md` — T-12
**Severidade:** Moderado — Chrome órfão pode acumular memória em deploys Linux

---

### GAP-06: VM Lav — Senha em texto plano
**Módulo:** `vmlav`
**Descrição:** Credenciais VM Lav (senha) armazenadas em texto plano no banco (ADR-004). Não há criptografia ou vault.
**Status:** Documentado como risco; decisão de implementação não tomada.
**Spec afetada:** `_reversa_sdd/vmlav/requirements.md`
**Severidade:** Moderado — risco de exposição em breach do banco

---

## Cosméticos — Melhorias de qualidade sem impacto funcional

### GAP-07: Autenticação — Sem rate limiting no `/login`
**Módulo:** `autenticacao`
**Descrição:** Sem proteção contra brute force no endpoint de login. Não há middleware de rate limiting detectado.
**Severidade:** Cosmético — não bloqueia funcionalidade mas é recomendação de segurança

### GAP-08: WhatsApp — `session_files_hash` validação no auto-reconnect não confirmada
**Módulo:** `whatsapp`
**Descrição:** O campo `session_files_hash` é armazenado no banco mas a lógica completa de validação no auto-reconnect não foi confirmada em detalhes.
**Severidade:** Cosmético — auto-reconnect funciona; hash é verificação adicional

---
