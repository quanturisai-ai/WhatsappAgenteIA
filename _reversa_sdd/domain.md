# Domínio de Negócio — WhatsappAgenteIA (Agente Zap)

> Gerado pelo Detetive (Reversa) em 2026-05-16
> Nível de documentação: Completo

---

## Visão do Domínio

O **Agente Zap** é um sistema de atendimento WhatsApp automatizado com IA local, especializado para lavanderias que usam o sistema VM Lavanderia. Ele combina:
- Atendimento conversacional via WhatsApp (bot com IA)
- Programa de fidelidade por pontos (lavagens/secagens)
- Automações de marketing (disparos parametrizáveis por gatilhos)
- Integração bidirecional com a plataforma VM Lavanderia (clientes, pedidos, vouchers)

---

## Glossário de Domínio

| Termo | Definição | Módulo | Confiança |
|-------|-----------|--------|-----------|
| **Agente / Bot** | Instância de IA que responde automaticamente às mensagens WhatsApp de clientes da lavanderia | `agentConfig`, `conversation` | 🟢 CONFIRMADO |
| **Conversa** | Canal de comunicação entre o agente e um número WhatsApp específico; persiste entre sessões | `conversation` | 🟢 CONFIRMADO |
| **Auto-resposta** | Flag por conversa (`auto_responding`) que habilita/desabilita respostas automáticas da IA | `conversation` | 🟢 CONFIRMADO |
| **Sessão WhatsApp** | Conexão ativa do cliente WhatsApp Web de um usuário do sistema; uma por usuário | `whatsapp` | 🟢 CONFIRMADO |
| **RAG** | Retrieval-Augmented Generation — busca semântica + geração de resposta com contexto de documentos e tópicos indexados | `indexing`, `ollama` | 🟢 CONFIRMADO |
| **Tópico** | Trecho de conhecimento estruturado (ex: horário de funcionamento, promoções) indexado no ChromaDB e injetado no prompt | `topic` | 🟢 CONFIRMADO |
| **Documento** | Arquivo (PDF, DOCX, TXT) cujo conteúdo é fragmentado em chunks e indexado no ChromaDB como base de conhecimento | `document` | 🟢 CONFIRMADO |
| **Chunk** | Fragmento de texto de até 1000 caracteres gerado a partir de um documento, indexado individualmente no ChromaDB | `document` | 🟢 CONFIRMADO |
| **Mídia Obrigatória** | Arquivo de imagem/vídeo/áudio enviado automaticamente no início de cada nova interação com um cliente (`mandatory_send=true`) | `media` | 🟢 CONFIRMADO |
| **Atendente Humano** | Número WhatsApp de um operador humano que recebe alertas quando a IA solicita intervenção | `humanAttendant` | 🟢 CONFIRMADO |
| **Intervenção** | Estado de uma conversa onde a IA sinalizou necessidade de atendente humano (`needs_intervention=true`) | `conversation` | 🟢 CONFIRMADO |
| **VM Lavanderia / VM Lav** | Plataforma externa de gestão de lavanderias (vmtecnologia.io); fornece dados de clientes, pedidos e vouchers | `vmLav` | 🟢 CONFIRMADO |
| **Cliente** | Pessoa física cadastrada na VM Lavanderia, identificada por CPF; não é usuário do sistema Agente Zap | `vmLav`, `fidelizacao` | 🟢 CONFIRMADO |
| **Usuário** | Operador/dono da lavanderia que tem conta no Agente Zap e é proprietário de todos os recursos do sistema | `auth` | 🟢 CONFIRMADO |
| **Utilização** | Pedido de serviço (lavagem ou secagem) realizado por um cliente na lavanderia com `situacao_venda='Sucesso'` e `pago_com_fidelidade=0` | `fidelizacao` | 🟢 CONFIRMADO |
| **Prêmio** | Benefício (ex: lavagem grátis, desconto) que um cliente conquista ao atingir um número mínimo de utilizações | `fidelizacao` | 🟢 CONFIRMADO |
| **Saldo de Fidelidade** | Número de utilizações acumuladas por um cliente em relação à meta do próximo prêmio | `fidelizacao` | 🟢 CONFIRMADO |
| **Voucher** | Código de desconto gerado na API VM Lav quando um cliente conquista um prêmio | `fidelizacao`, `vmLav` | 🟢 CONFIRMADO |
| **Gatilho** | Tipo de evento de negócio (inatividade, aniversário, data fixa, etc.) que dispara envio de mensagem automática via WhatsApp | `fidelizacao` | 🟢 CONFIRMADO |
| **Regra de Automação** | Configuração de disparo automático baseada em um tipo de gatilho, mensagem template, horário e segmentação de público | `fidelizacao` | 🟢 CONFIRMADO |
| **Simulação** | Modo de teste onde as automações são registradas no banco mas não enviadas pelo WhatsApp (`config.simulacao=true`) | `fidelizacao` | 🟢 CONFIRMADO |
| **Embedding** | Vetor numérico representando um texto, gerado pelo modelo Ollama, usado para busca semântica | `indexing`, `ollama` | 🟢 CONFIRMADO |
| **Re-ranking híbrido** | Algoritmo que combina score de keyword (0.5), similaridade vetorial (0.3) e prioridade de tópico (0.2) para ordenar resultados RAG | `indexing` | 🟢 CONFIRMADO |
| **#contatoia** | Comando especial que o cliente digita na conversa para que o histórico seja omitido ao chamar o LLM | `conversation` | 🟢 CONFIRMADO |
| **Contato Proativo** | Mensagem iniciada pelo bot para um número WhatsApp externo à conversa atual, a pedido da IA (`[CONTATO_PROATIVO:...]`) | `conversation` | 🟢 CONFIRMADO |

---

## Regras de Negócio

### RN-01 — Auto-resposta: default ativo 🟢 CONFIRMADO
Toda nova conversa começa com `auto_responding=true`. Se o campo for `null` ou `undefined` no banco, o sistema assume `true`. Em caso de erro ao verificar, o sistema mantém `true` como fallback seguro para não bloquear o atendimento.

### RN-02 — Sessão WhatsApp: uma por usuário 🟢 CONFIRMADO
Um usuário do sistema só pode ter exatamente uma sessão WhatsApp ativa ao mesmo tempo (`UNIQUE(user_id)` na tabela `whatsapp_sessions`). O `WhatsAppManager` usa um Map singleton para garantir isso em memória, com proteção adicional contra dupla inicialização via segundo Map de Promises.

### RN-03 — QR Code: não é string "null" 🟢 CONFIRMADO
Ao retornar o QR code, o sistema verifica explicitamente se o valor não é a string literal `"null"` (comportamento do driver MariaDB que pode serializar null como `"null"`). Se for, retorna null para o cliente.

### RN-04 — Keep-alive WhatsApp: 4 falhas = connection_failed 🟢 CONFIRMADO
O health check verifica a sessão a cada 15 min. Após **4 erros consecutivos** (totalizando ~1 hora sem conexão bem-sucedida), o status é marcado como `connection_failed`.

### RN-05 — Debounce de mensagens antes do LLM 🟢 CONFIRMADO
Mensagens do mesmo contato são acumuladas por alguns segundos antes de serem processadas pelo LLM. Isso evita múltiplas chamadas ao Ollama para mensagens fracionadas (ex: usuário enviando texto em partes). O debounce é implementado no `WhatsAppService`.

### RN-06 — Timeout de processamento RAG: 60 segundos 🟢 CONFIRMADO
A chamada ao RAG/LLM tem timeout máximo de 60 segundos via `Promise.race`. Após este tempo, a mensagem falha silenciosamente (sem resposta ao cliente) — não há retry.

### RN-07 — Comandos inline da IA: regex extraction 🟢 CONFIRMADO
A IA pode embutir comandos especiais em sua resposta usando a sintaxe `[COMANDO:valor]`. O `ConversationService` extrai e remove esses comandos antes de enviar o texto ao cliente. Os comandos são processados antes do envio:
- `[ALERTAR_ATENDENTE:mensagem]` — aciona alerta para atendente humano e marca `needs_intervention=true`
- `[ENVIAR_MIDIA:id]` — envia arquivo de mídia pelo WhatsApp
- `[CONTATO_PROATIVO: {"numero": "...", "mensagem": "..."}]` — inicia conversa com número externo

### RN-08 — Mídia obrigatória: não reenviar dentro do mesmo ciclo 🟢 CONFIRMADO
Mídias marcadas com `mandatory_send=true` são enviadas uma vez por "nova interação". Uma interação é considerada nova se: (a) for a primeira mensagem do cliente na conversa, OU (b) a penúltima mensagem do cliente ocorreu há mais de `max_age_hours`. O rastreamento usa a tabela `media_sent_tracking`.

### RN-09 — Finalização automática de conversas: por max_age_hours 🟢 CONFIRMADO
Um scheduler a cada 1 hora verifica conversas com status `new` ou `in_progress` e finaliza as que estão sem atividade há mais de `max_age_hours` (padrão: 12h, configurável por usuário). Ao finalizar manualmente, `auto_responding` é resetado para `true` (para que a IA retome ao próximo contato do cliente).

### RN-10 — Fidelidade: apenas pedidos válidos contam 🟢 CONFIRMADO
Para o cálculo de saldo de fidelidade, apenas pedidos com `situacao_venda='Sucesso'` E `pago_com_fidelidade=0` são contados. Pedidos pagos com fidelidade (uso de prêmio) não contam para o acúmulo de novos pontos.

### RN-11 — Prêmio ÚNICO vs PERPÉTUO 🟢 CONFIRMADO
- **ÚNICO**: pode ser conquistado apenas uma vez por cliente. Após a conquista, o prêmio não aparece mais na contagem.
- **PERPÉTUO**: pode ser conquistado ilimitadas vezes. A cada nova conquista, as utilizações já usadas são subtraídas (ex: meta=10, com 25 utilizações e 2 conquistas, o saldo atual é 25 - 20 = 5).

### RN-12 — Voucher: apenas para LAVAGEM ou SECAGEM 🟢 CONFIRMADO
Vouchers via API VM Lav só podem ser gerados para prêmios de tipo `LAVAGEM` ou `SECAGEM`. Prêmios do tipo `TOTAL` não suportam geração de voucher automático.

### RN-13 — Anti-spam nas automações: 3 camadas 🟢 CONFIRMADO
As automações de fidelização aplicam 3 camadas de proteção contra spam:
1. **`frequencia_minima_dias` por regra**: intervalo mínimo entre disparos da mesma regra para o mesmo cliente
2. **`max_mensagens_por_cliente_semana`**: limite semanal global por cliente (padrão: 2)
3. **`max_mensagens_por_cliente_mes`**: limite mensal global por cliente (padrão: 4)

### RN-14 — Automações em modo simulação por default 🟢 CONFIRMADO
Novas configurações de automação são criadas com `simulacao=true`. Nesse modo, as mensagens são registradas no banco como "enviadas" mas o WhatsApp não é acionado. O usuário deve explicitamente desativar o modo simulação para iniciar envios reais.

### RN-15 — Normalização de CPF e telefone: necessária para joins 🟢 CONFIRMADO
Dados da VM Lav chegam com formatação variável (CPF com/sem pontos, telefone com/sem DDI). O sistema usa a função SQL `normaliza_telefone()` e utilitários TypeScript (`normalizeCpfToDigits()`) para joins entre `conversations` e `vm_lav_clientes`, evitando falsos negativos por diferença de formato.

### RN-16 — Configuração de agente: um por usuário 🟢 CONFIRMADO
Cada usuário tem exatamente uma configuração de agente (`UNIQUE(user_id)` em `agent_config`). Inclui parâmetros do LLM (temperatura, top_p, top_k, repeat_penalty), modelo Ollama, e textos de negócio (nome, serviços, horários).

### RN-17 — Autenticação VM Lav: token por sessão com renovação automática 🟡 INFERIDO
A autenticação na API VM Lav usa Puppeteer para simular login (incluindo resolução de captcha), obtendo um JWT via localStorage do browser. O `VmLavConnectionManager` gerencia a renovação automática desse token quando expirado.

### RN-18 — Sincronização VM Lav: mutex por usuário 🟢 CONFIRMADO
O scheduler de sincronização (a cada 10 min) usa um `Map<userId, boolean>` para garantir que não haja duas sincronizações simultâneas do mesmo usuário. Isso previne race conditions e dados duplicados.

### RN-19 — Pausar conversa = assumir manualmente 🟢 CONFIRMADO
Quando um atendente humano "assume" uma conversa, o sistema chama `pauseAutoResponding()` + atualiza status para `in_progress`. A IA para de responder nessa conversa. O atendente pode retomar a auto-resposta explicitamente.

### RN-20 — Taxa de confiança do RAG: pesos fixos hardcoded 🟢 CONFIRMADO
O algoritmo de re-ranking usa pesos fixos imutáveis: keyword (0.5) + vector (0.3) + priority (0.2). Esses valores não são configuráveis pelo usuário.

---

## Invariantes do Sistema

| Invariante | Verificação | Confiança |
|-----------|-------------|-----------|
| Um usuário tem no máximo 1 sessão WhatsApp | `UNIQUE(user_id)` + Singleton em memória | 🟢 CONFIRMADO |
| Um usuário tem exatamente 1 configuração de agente | `UNIQUE(user_id)` em `agent_config` | 🟢 CONFIRMADO |
| Pedidos pagos com fidelidade não acumulam pontos | `pago_com_fidelidade=0` filtrado em todas as queries | 🟢 CONFIRMADO |
| Respostas da IA nunca chegam ao cliente com comandos inline | Extração + remoção antes de `sendMessage()` | 🟢 CONFIRMADO |
| Coleções ChromaDB são isoladas por usuário | Prefixo `user_{userId}` em toda query | 🟢 CONFIRMADO |

---

## Lacunas de Domínio 🔴

| ID | Descrição |
|----|-----------|
| D-01 | Comportamento não especificado quando múltiplos atendentes humanos estão ativos. O código envia alerta ao primeiro ativo encontrado? A todos? |
| D-02 | Regra de negócio para quando a IA falha (timeout 60s): o cliente fica sem resposta? Há fallback configurável? |
| D-03 | Multi-tenant não documentado: o sistema suporta múltiplos usuários mas não há RBAC entre usuários ou roles de admin. |
| D-04 | Validade padrão de voucher é `validadeDias ?? 34` — o valor 34 parece arbitrário. Não há documentação do porquê. |
| D-05 | Regras de tipo de atendimento fora de horário: o campo `hours` em `agent_config` está presente mas não há verificação de horário implementada no pipeline de mensagens. |
