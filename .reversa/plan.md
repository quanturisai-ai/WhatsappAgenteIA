# Plano de Exploração — WhatsappAgenteIA

> Criado pelo Reversa em 2026-05-16
> Marque cada tarefa com ✅ quando concluída.
> Você pode editar este plano antes de iniciar: adicione, remova ou reordene tarefas conforme necessário.

---

## Fase 1: Reconhecimento 🔍

- [x] ✅ **Scout** — Mapeamento de estrutura de pastas e tecnologias
- [x] ✅ **Scout** — Análise de dependências e gerenciadores de pacotes
- [x] ✅ **Scout** — Identificação de entry points, CI/CD e configurações

## Decisão de organização das specs 🗂️

> Entre o Scout e o Arqueólogo, o Reversa pergunta como você quer organizar as specs (por módulo, caso de uso, endpoint, híbrida, por features ou customizada). A escolha fica persistida em `.reversa/config.toml` na seção `[specs]` e não será reperguntada em execuções futuras. Para reapresentar o menu, remova manualmente a seção.

## Fase 2: Escavação 🏗️

- [x] ✅ **Arqueólogo** — Análise do módulo `auth`
- [x] ✅ **Arqueólogo** — Análise do módulo `whatsapp`
- [x] ✅ **Arqueólogo** — Análise do módulo `conversation`
- [x] ✅ **Arqueólogo** — Análise do módulo `document`
- [x] ✅ **Arqueólogo** — Análise do módulo `agentConfig`
- [x] ✅ **Arqueólogo** — Análise do módulo `media`
- [x] ✅ **Arqueólogo** — Análise do módulo `topic`
- [x] ✅ **Arqueólogo** — Análise do módulo `indexing`
- [x] ✅ **Arqueólogo** — Análise do módulo `testChat`
- [x] ✅ **Arqueólogo** — Análise do módulo `ollama`
- [x] ✅ **Arqueólogo** — Análise do módulo `humanAttendant`
- [x] ✅ **Arqueólogo** — Análise do módulo `vmLav`
- [x] ✅ **Arqueólogo** — Análise do módulo `fidelizacao`

## Fase 3: Interpretação 🧠

- [x] ✅ **Detetive** — Arqueologia Git e ADRs retroativos
- [x] ✅ **Detetive** — Regras de negócio implícitas e máquinas de estado
- [x] ✅ **Detetive** — Matriz de permissões (RBAC/ACL)
- [x] ✅ **Arquiteto** — Diagramas C4 (Contexto, Containers, Componentes)
- [x] ✅ **Arquiteto** — ERD completo e integrações externas
- [x] ✅ **Arquiteto** — Spec Impact Matrix

## Fase 4: Geração 📝

- [x] ✅ **Redator** — Specs SDD por componente (13 units, 52 arquivos canônicos + opcionais)
- [x] ✅ **Redator** — OpenAPI (`openapi/api.yaml`)
- [x] ✅ **Redator** — User Stories (`user-stories/fluxo-atendimento.md`, `user-stories/fluxo-fidelizacao.md`)
- [x] ✅ **Redator** — Code/Spec Matrix (`traceability/code-spec-matrix.md`)

## Fase 5: Revisão ✅

- [x] ✅ **Revisor** — Revisão cruzada de specs (13 units revisadas, 11 reclassificações)
- [x] ✅ **Revisor** — Resolução de lacunas com o usuário (5 perguntas, 5 respondidas)
- [x] ✅ **Revisor** — Relatório de confiança final (87% confiança geral)

---

## Agentes Independentes

> Execute estes agentes quando os recursos estiverem disponíveis — podem rodar em qualquer fase.

- [ ] **Visor** — Análise de interface via screenshots
- [ ] **Data Master** — Análise completa do banco de dados
- [ ] **Design System** — Extração de tokens de design
- [ ] **Tracer** — Análise dinâmica (requer sistema acessível)

---

## Próximo passo

Após o Time de Descoberta concluir e o `_reversa_sdd/` estar populado, você pode disparar um dos fluxos seguintes:

- `/reversa-migrate`: orquestrador do **Time de Migração** (Paradigm Advisor → Curator → Strategist → Designer → Screen Translator → Inspector). Gera as specs do sistema novo. Saída em `_reversa_sdd/migration/` e `_reversa_sdd/screens/`.
- `/reversa-reconstructor`: gera plano bottom-up para reimplementar o software a partir das specs do legado (uma tarefa por sessão).
