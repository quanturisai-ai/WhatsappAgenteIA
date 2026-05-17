# Perguntas para Validação — WhatsappAgenteIA

> Gerado pelo Revisor (Reversa) em 2026-05-16
> Todas as perguntas foram respondidas e processadas pelo Revisor.

---

## Pergunta 1 ✅ Respondida

**Contexto:** Módulo `conversa` — ENUM `conversations.status` contém o valor `'paused'` (`database.schema.sql:35`, `types/index.ts:30`), mas nenhum trecho de código faz UPDATE para esse status nem define transições de entrada/saída.
**Spec afetada:** [`_reversa_sdd/conversa/requirements.md`], [`_reversa_sdd/conversa/design.md`]
**Pergunta:** O status `paused` em `conversations.status` está em uso ou é reservado para feature futura? Se em uso, qual ação/endpoint define uma conversa como `paused` (diferente de `pause_auto_responding`)?

**Resposta:** O status paused da conversa serve para pausar as respostas da LLM numa determinada conversa, para que um atendente humano possa assumir por algum motivo.

**Ação aplicada:** Reclassificado 🔴→🟡. `status='paused'` tem intenção confirmada (takeover humano), mas a transição não está implementada no código legado — o takeover atual apenas seta `auto_responding=false`. A spec foi atualizada como gap de implementação planejado.

---

## Pergunta 2 ✅ Respondida

**Contexto:** Módulo `autenticacao` — `auth.service.ts:169` e `middleware/auth.ts:29` usam `process.env.JWT_SECRET || 'default-secret'`.
**Spec afetada:** [`_reversa_sdd/autenticacao/tasks.md` — T-10]
**Pergunta:** Como tratar ausência de `JWT_SECRET` em produção?

**Resposta:** Utilizar melhores práticas.

**Ação aplicada:** Reclassificado 🔴→🟢. T-10 promovido a **Must**: startup deve falhar (`throw`/`process.exit(1)`) se `JWT_SECRET` não estiver definido. Fallback `'default-secret'` deve ser removido.

---

## Pergunta 3 ✅ Respondida

**Contexto:** Módulo `vmlav` — constantes hardcoded: `idEmpresa=1737`, `empresaLocalizador='lavateriajdnovomundo'`, `LAVAGEM(id=3837)`, `SECAGEM(id=3838)`.
**Spec afetada:** [`_reversa_sdd/vmlav/requirements.md`]
**Pergunta:** São específicas desta instalação ou devem ser configuráveis por conta?

**Resposta:** Deve ser configurável — valor único para cada conta no sistema.

**Ação aplicada:** Permanece 🔴 (feature gap). Foi adicionado RF-09 em `vmlav/requirements.md`: campo de configuração de `idEmpresa`, `empresaLocalizador`, `lavagem_service_id`, `secagem_service_id` por usuário, a ser implementado na reimplementação.

---

## Pergunta 4 ✅ Respondida

**Contexto:** `[ENVIAR_MIDIA:id]` não verifica `is_active` antes de enviar (`conversation.service.ts:259`).
**Spec afetada:** [`_reversa_sdd/midia/requirements.md`], [`_reversa_sdd/midia/tasks.md`]
**Pergunta:** Bug ou comportamento intencional?

**Resposta:** Sempre deve verificar se está ativa.

**Ação aplicada:** Bug confirmado. `midia/requirements.md` atualizado: `is_active=false` bloqueia envio em todos os contextos. Task T-05 adicionada em `midia/tasks.md` como **Must**: corrigir verificação em `conversation.service.ts:259`.

---

## Pergunta 5 ✅ Respondida

**Contexto:** `killBrowserProcessesForSession()` só implementado para Windows.
**Spec afetada:** [`_reversa_sdd/whatsapp/tasks.md` — T-12]
**Pergunta:** Sistema precisa rodar em Linux/Mac?

**Resposta:** Precisamos testar em ambiente Linux para saber se será preciso.

**Ação aplicada:** Permanece 🟡. T-12 marcado como **Should** com nota: validação em ambiente Linux necessária antes de definir prioridade final. Estratégia sugerida: `pkill` por path de sessão.

---
