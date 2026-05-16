# Análise de Código — WhatsappAgenteIA (Agente Zap)

> Gerado pelo Arqueólogo (Reversa) em 2026-05-16
> Nível de documentação: Completo
> Organização: Por endpoint/contrato

---

## Visão Arquitetural

O sistema é um **agente de atendimento WhatsApp com IA local** composto por 3 serviços independentes:

```
[WhatsApp Web] ↔ [Backend Node.js/TS] ↔ [Ollama LLM local]
                        ↕                        ↕
                  [MariaDB]               [ChromaDB]
                        ↕
                [Whisper Service Python]
                        ↕
                [VM Lav API externa]
                        ↕
               [Frontend React]
```

**Fluxo principal:** Mensagem WhatsApp → `WhatsAppService` → debounce → `ConversationService` → `RAGService` → `OllamaService` → resposta enviada de volta ao WhatsApp.

---

## Módulo 1: `auth` — Autenticação

**Rota:** `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/profile`

### Funções principais

| Função | Arquivo | Descrição |
|--------|---------|-----------|
| `register(data)` | `auth.service.ts` | Cria usuário com hash bcrypt (salt=10), retorna JWT |
| `login(credentials)` | `auth.service.ts` | Valida senha com bcrypt.compare, retorna JWT |
| `generateToken(userId)` | `auth.service.ts` | Assina JWT com `JWT_SECRET`, expira em `JWT_EXPIRES_IN` (padrão: 7d) |
| `authenticateToken` | `middleware/auth.ts` | Middleware: aceita token no header `Authorization` OU na query string `?token=` |

### Regras de negócio — 🟢 CONFIRMADO
- Senha mínima: **6 caracteres** (validada no controller, não no service)
- Username e email devem ser **únicos** (verificado via query antes do INSERT)
- O token de sessão WhatsApp usa o mesmo `JWT_SECRET` (compartilhado)
- `req.user` é populado com os dados do banco a cada requisição autenticada (não apenas com payload do token)

### Algoritmo notável — hash de senha
```
bcrypt.hash(password, saltRounds=10) → armazenado em password_hash
bcrypt.compare(inputPassword, storedHash) → boolean
```

### Entidade: `User`
| Campo | Tipo SQL | Obrigatório | Padrão |
|-------|----------|-------------|--------|
| id | INT AUTO_INCREMENT | sim | — |
| username | VARCHAR | sim | — |
| email | VARCHAR | sim | — |
| password_hash | VARCHAR | sim | — |
| created_at | DATETIME | sim | NOW() |
| updated_at | DATETIME | sim | NOW() |

---

## Módulo 2: `whatsapp` — Integração WhatsApp

**Rota:** `POST /api/whatsapp/initialize`, `GET /api/whatsapp/status`, `GET /api/whatsapp/qrcode`, `POST /api/whatsapp/send`, `POST /api/whatsapp/disconnect`, `POST /api/whatsapp/logout`

### Padrão Singleton — WhatsAppManager
`WhatsAppManager` usa Singleton (`getInstance()`) e mantém um `Map<userId, WhatsAppService>`. Garante exatamente **uma instância por usuário** e previne inicializações simultâneas com um segundo `Map<userId, Promise>`.

### Funções principais

| Função | Arquivo | Descrição |
|--------|---------|-----------|
| `initializeService(userId)` | `whatsapp.manager.ts` | Inicializa cliente com proteção contra dupla inicialização |
| `initialize()` | `whatsapp.service.ts` | Cria `Client` whatsapp-web.js com `LocalAuth`, configura Puppeteer |
| `sendMessage(number, content)` | `whatsapp.service.ts` | Envia mensagem de texto via cliente |
| `getStatus()` | `whatsapp.service.ts` | Lê status da sessão no banco |
| `getQRCode()` | `whatsapp.service.ts` | Retorna QR code em memória (`lastQRCode`), valida se não é string "null" |
| `logout()` / `disconnect()` | `whatsapp.service.ts` | Destrói sessão, deleta arquivos, mata processos Chrome (Windows: PowerShell) |

### Estados da Sessão WhatsApp — 🟢 CONFIRMADO
```
disconnected → connecting → authenticated → connected
                                              ↓
                                        connection_failed
```

### Mecanismos de resiliência — 🟢 CONFIRMADO
- **QR code expiry:** timeout limpa `lastQRCode` e emite `qr_expired` via Socket.IO
- **Keep-alive:** interval verifica sessão a cada 15 min; após 4 erros (1h) marca `connection_failed`
- **Health check:** verifica consistência banco vs. cliente a cada 30 min (background job no index.ts)
- **Auto-reconnect no startup:** escaneia sessões do banco, valida arquivos físicos e reconecta
- **Debounce de mensagens:** acumula mensagens do mesmo contato por alguns segundos antes de processar com a IA (evita múltiplas chamadas ao LLM para mensagens fracionadas)

### Entidade: `WhatsAppSession`
| Campo | Tipo | Obrigatório | Padrão |
|-------|------|-------------|--------|
| id | INT | sim | — |
| user_id | INT | sim | — |
| session_data | TEXT | não | null |
| qr_code | TEXT | não | null |
| status | ENUM | sim | 'disconnected' |
| last_connected_at | DATETIME | não | null |
| last_ready_at | DATETIME | não | null |
| session_files_path | VARCHAR | não | null |
| session_files_hash | VARCHAR | não | null |

**Constraint:** `UNIQUE (user_id)` — exatamente 1 sessão por usuário.

---

## Módulo 3: `conversation` — Gestão de Conversas

**Rota:** `GET /api/conversations`, `GET /api/conversations/:id`, `POST /api/conversations/:id/pause`, `POST /api/conversations/:id/resume`, `GET /api/conversations/:id/messages`

### Funções principais

| Função | Arquivo | Descrição |
|--------|---------|-----------|
| `processIncomingMessage(userId, conversationId, content, wpService)` | `conversation.service.ts` | Pipeline completo: verifica auto-responding → envia mídias obrigatórias → chama RAG → processa comandos especiais → envia resposta |
| `isAutoResponding(conversationId)` | `conversation.service.ts` | Lê flag `auto_responding` do banco (retorna true se null — default ativo) |
| `pauseAutoResponding(conversationId)` | `conversation.service.ts` | Pausa IA para conversa específica |
| `finalizeOldConversations()` | `conversation.service.ts` | Finaliza conversas inativas há mais de `max_age_hours` (padrão 12h) |
| `extractAlertCommand(response)` | `conversation.service.ts` | Extrai comando `[ALERTA_ATENDENTE:mensagem]` da resposta da IA |
| `extractMediaCommands(response)` | `conversation.service.ts` | Extrai comandos `[ENVIAR_MIDIA:id]` da resposta da IA |
| `extractProactiveContactCommand(response)` | `conversation.service.ts` | Extrai comando `[CONTATO_PROATIVO:numero]` da resposta da IA |

### Comandos especiais embutidos na resposta da IA — 🟢 CONFIRMADO
A IA pode incluir comandos que o sistema interpreta e remove do texto antes de enviar ao usuário:

| Comando | Ação |
|---------|------|
| `[ALERTA_ATENDENTE:mensagem]` | Envia alerta ao número de atendente humano configurado |
| `[ENVIAR_MIDIA:id]` | Envia mídia com o ID correspondente via WhatsApp |
| `[CONTATO_PROATIVO:numero]` | Inicia contato proativo com número externo |
| `#contatoia` (na mensagem do cliente) | Omite histórico da conversa ao chamar o LLM |

### Entidade: `Conversation`
| Campo | Tipo | Obrigatório | Padrão |
|-------|------|-------------|--------|
| id | INT | sim | — |
| user_id | INT | sim | — |
| contact_number | VARCHAR | sim | — |
| contact_name | VARCHAR | não | null |
| lid | VARCHAR | não | null |
| status | ENUM | sim | 'new' |
| auto_responding | TINYINT(1) | não | true |
| last_message_at | DATETIME | não | null |
| needs_intervention | TINYINT(1) | não | false |
| intervention_resolved_at | DATETIME | não | null |

**JOIN especial:** `findById` faz LEFT JOIN com `vm_lav_clientes` via `normaliza_telefone()` (função SQL customizada) para trazer dados do cliente da lavanderia.

### Entidade: `Message`
| Campo | Tipo | Obrigatório |
|-------|------|-------------|
| id | INT | sim |
| conversation_id | INT | sim |
| message_id | VARCHAR | não |
| content | TEXT | sim |
| message_type | ENUM | não |
| media_id | INT | não |
| direction | ENUM | sim |
| is_from_ai | TINYINT(1) | sim |
| received_at | DATETIME | não |
| read_at | DATETIME | não |

---

## Módulo 4: `document` — Documentos Base de Conhecimento

**Rota:** `POST /api/documents/upload`, `GET /api/documents`, `DELETE /api/documents/:id`, `POST /api/documents/:id/index`

### Funções principais

| Função | Arquivo | Descrição |
|--------|---------|-----------|
| `extractText(filePath, fileType)` | `document.service.ts` | Extrai texto de .txt / .pdf (pdf-parse) / .docx (mammoth) |
| `chunkText(text, chunkSize=1000)` | `document.service.ts` | Divide texto em chunks de 1000 caracteres para indexação |
| `indexDocument(documentId, userId)` | `document.service.ts` | Gera embeddings via Ollama e insere no ChromaDB |

### Regras — 🟢 CONFIRMADO
- Tipos permitidos: `.txt`, `.pdf`, `.docx`
- Limite de tamanho: **10 MB** por arquivo
- Chunk size: **1000 caracteres** (hardcoded)
- Arquivos físicos armazenados em `uploads/` com nome `{timestamp}-{originalname}`

---

## Módulo 5: `agentConfig` — Configuração do Agente IA

**Rota:** `GET /api/agent-config`, `PUT /api/agent-config`

### Entidade: `AgentConfig` — 🟢 CONFIRMADO
| Campo | Tipo | Padrão | Descrição |
|-------|------|--------|-----------|
| business_name | TEXT | null | Nome do negócio injetado no prompt |
| business_info | TEXT | null | Descrição do negócio |
| services | TEXT | null | Serviços oferecidos |
| hours | TEXT | null | Horário de funcionamento |
| personality | TEXT | null | Personalidade/tom do agente |
| greeting_message | TEXT | null | Mensagem de saudação inicial |
| farewell_message | TEXT | null | Mensagem de despedida |
| absence_message | TEXT | null | Mensagem fora do horário |
| specific_instructions | TEXT | null | Instruções adicionais ao LLM |
| embedding_model | VARCHAR | 'deepseek-r1' | Modelo para gerar embeddings |
| generation_model | VARCHAR | 'deepseek-r1' | Modelo para gerar respostas |
| temperature | FLOAT | 0.7 | Criatividade do LLM (0.0–2.0) |
| top_p | FLOAT | 0.9 | Nucleus sampling |
| top_k | INT | 40 | Tokens candidatos |
| repeat_penalty | FLOAT | 1.1 | Penalidade de repetição |
| max_age_hours | INT | 12 | Tempo máximo de inatividade de uma conversa |

---

## Módulo 6: `media` — Mídias Automáticas

**Rota:** `POST /api/medias/upload`, `GET /api/medias`, `PUT /api/medias/:id`, `DELETE /api/medias/:id`

### Entidade: `Media` — 🟢 CONFIRMADO
| Campo | Tipo | Descrição |
|-------|------|-----------|
| file_type | ENUM | 'video', 'image', 'document', 'audio' |
| source | ENUM | 'outgoing' (enviada), 'incoming' (recebida do WhatsApp) |
| mandatory_send | TINYINT | Se true, enviada automaticamente no início de toda conversa |
| is_active | TINYINT | Controla se está disponível para envio |
| indexing_status | ENUM | Estado da indexação no ChromaDB |

**Flag `mandatory_send`:** mídias marcadas com `mandatory_send=true` são enviadas **antes** da resposta da IA em toda conversa (via `sendMandatoryMedias()`).

---

## Módulo 7: `topic` — Tópicos/Base de Conhecimento Estruturada

**Rota:** `GET /api/topics`, `POST /api/topics`, `PUT /api/topics/:id`, `DELETE /api/topics/:id`

### Entidade: `Topic` — 🟢 CONFIRMADO
| Campo | Tipo | Descrição |
|-------|------|-----------|
| title | VARCHAR | Nome do tópico |
| description | TEXT | Conteúdo injetado no prompt |
| trigger_keywords | JSON | Palavras-chave que ativam o tópico |
| context | ENUM | 'greeting', 'farewell', 'absence', 'special_date', 'custom' |
| priority | INT | Peso no re-ranking (0–100) |
| is_active | TINYINT | Ativo/inativo |
| indexing_status | ENUM | Estado no ChromaDB |

---

## Módulo 8: `indexing` — Indexação RAG

**Rota:** `POST /api/indexing/reindex`, `GET /api/indexing/status`

### RAGService — algoritmo de busca híbrida — 🟢 CONFIRMADO

O `RAGService` implementa um sistema de **re-ranking híbrido** com 3 componentes:

```
Score = (0.5 × trigger_keyword_match) + (0.3 × vector_similarity) + (0.2 × topic_priority)
```

**Pesos:**
- `TRIGGER_KEYWORD_WEIGHT = 0.5` — maior peso para match de palavras-chave
- `VECTOR_SIMILARITY_WEIGHT = 0.3` — similaridade vetorial (distância ChromaDB → similaridade)
- `PRIORITY_WEIGHT = 0.2` — prioridade configurada pelo usuário

**Pipeline de normalização de query:**
1. Lowercase + remove pontuação
2. Remove stopwords PT-BR (lista de ~50 palavras)
3. Filtra palavras com `length > 2`

**Timeout de processamento:** 60 segundos (Promise.race com rejeição por timeout).

### ChromaDB — coleções por usuário
Cada usuário tem uma coleção isolada: `user_{userId}`. Itens indexados: documentos (chunks), tópicos, mídias.

---

## Módulo 9: `ollama` — LLM Local

**Rota:** `GET /api/ollama/models`, `POST /api/ollama/generate`

### OllamaService — 🟢 CONFIRMADO

| Função | Endpoint Ollama | Descrição |
|--------|----------------|-----------|
| `generateEmbedding(text, model?)` | `POST /api/embeddings` | Gera vetor de embedding |
| `generateResponse(prompt, model?, options?)` | `POST /api/generate` | Gera resposta de texto |
| `listModels()` | `GET /api/tags` | Lista modelos disponíveis |

**Otimizações:**
- HTTP keep-alive (reutiliza conexões TCP: maxSockets=5, keepAliveMsecs=1000ms)
- `keep_alive: '5m'` — mantém o modelo carregado em memória por 5 min após uso
- Timeout: 60 segundos por requisição
- URL configurável via `OLLAMA_BASE_URL` (padrão: `http://localhost:11434`)

---

## Módulo 10: `humanAttendant` — Atendente Humano

**Rota:** `GET /api/human-attendant`, `POST /api/human-attendant`, `PUT /api/human-attendant/:id`, `DELETE /api/human-attendant/:id`

### Entidade: `HumanAttendant` — 🟢 CONFIRMADO
| Campo | Tipo | Descrição |
|-------|------|-----------|
| phone_number | VARCHAR | Número WhatsApp do atendente |
| name | VARCHAR | Nome opcional |
| is_active | TINYINT | Ativo/inativo |

**Fluxo de alerta:** Quando a IA insere `[ALERTA_ATENDENTE:mensagem]` na resposta, o `HumanAttendantService.sendAlert()` envia uma mensagem WhatsApp diretamente ao número do atendente ativo.

---

## Módulo 11: `vmLav` — Integração VM Lavanderia

**Rota:** `POST /api/vmlav/credentials`, `GET /api/vmlav/status`, `POST /api/vmlav/sync`, `GET /api/vmlav/clients`, `GET /api/vmlav/orders`

### VmLavService — integração com API externa — 🟢 CONFIRMADO

**URLs da API externa (hardcoded):**
- Login: `https://apps.vmhub.vmtecnologia.io/conta/api/v1/contas-usuarios/login`
- Clientes: `https://apps.vmhub.vmtecnologia.io/vmlav/api/v1/relatorios/clientes`
- Pedidos: `https://apps.vmhub.vmtecnologia.io/vmlav/api/v1/relatorios/pedidos`
- Vouchers: `https://apps.vmhub.vmtecnologia.io/wallet/api/v1/vouchers/listaVoucher`
- Criar Voucher: `https://apps.vmhub.vmtecnologia.io/wallet/api/v1/vouchers`

**Constantes hardcoded:**
- `idEmpresa = 1737`
- `empresaLocalizador = 'lavateriajdnovomundo'`
- Serviços: `LAVAGEM (id=3837)`, `SECAGEM (id=3838)`

**Autenticação:** Login inicial via Puppeteer (scraping da tela de login com captcha), token JWT obtido via localStorage após login bem-sucedido. Renovação automática gerenciada por `VmLavConnectionManager`.

**Sincronização:** Scheduler executa a cada 10 minutos (`vmLavScheduler.ts`), sincroniza clientes e pedidos. Usa `Map<userId, boolean>` para prevenir execuções simultâneas.

### Entidades VM Lav — 🟢 CONFIRMADO
- `VmLavCliente`: clientes da lavanderia (nome, cpf, telefone, email, compras)
- `VmLavPedido`: pedidos/serviços (tipo_servico, situacao_venda, data_venda, pago_com_fidelidade)
- `VmLavCredentials`: credenciais de acesso à API
- `VmLavSincronizacaoLog`: log de sincronizações

---

## Módulo 12: `fidelizacao` — Programa de Fidelidade

**Rota:** `GET /api/fidelizacao/saldo/:cpf`, `POST /api/fidelizacao/premios`, `GET /api/fidelizacao/regras`, `POST /api/fidelizacao/regras`, `POST /api/fidelizacao/regras/:id/executar`

Este é o módulo mais complexo do sistema — gerencia um programa de pontos/utilizations para clientes da lavanderia.

### FidelizacaoService — cálculo de saldo — 🟢 CONFIRMADO

```typescript
SaldoFidelidade {
  atual: number;           // utilizações acumuladas
  proximoObjetivo: number; // meta do próximo prêmio
  faltam: number;          // faltam N para o próximo prêmio
  proximoPremio: string;   // descrição do próximo prêmio
  conquistas: number;      // prêmios já conquistados
}
```

**Regra de contagem:** apenas pedidos com `situacao_venda = 'Sucesso'` e `pago_com_fidelidade = 0` são contados.

### FidelizacaoRegrasService — motor de automação — 🟢 CONFIRMADO

Motor de disparo baseado em **gatilhos** (tipos: reativação, aniversário, séries especiais, voucher automático, etc.).

**Filtros de segurança anti-spam:**
- `intervalo_verificacao_automacoes`: intervalo mínimo entre execuções da mesma regra por cliente
- `vigencia_inicio` / `vigencia_fim`: janela temporal da regra
- `segmentacao_publico`: filtros de público-alvo (ex: sem compras há N dias)
- Status `bloqueado_antispam`, `bloqueado_semanal`, `bloqueado_mensal` previnem reenvios

**Notificações:** `FidelizacaoNotificacaoService` rastreia notificações enviadas para evitar duplicatas.

**Vouchers automáticos:** `FidelizacaoVoucherAutoService` gera vouchers na API VM Lav quando cliente atinge meta.

### Entidades — 🟢 CONFIRMADO
- `FidelizacaoTipoGatilho`: tipos de gatilho disponíveis
- `FidelizacaoRegra`: regras configuradas pelo usuário (ativas/inativas, vigência, segmentação)
- `FidelizacaoRegrasConfig`: configuração global do módulo (ativo/inativo por usuário)
- `FidelizacaoNotificacao`: histórico de notificações enviadas
- `Premio`: prêmios disponíveis (metas, descrição, tipo_servico)
- `PremioCliente`: prêmios conquistados por clientes

---

## Módulo 13: `testChat` — Chat de Testes

**Rota:** `POST /api/test-chat/message`

Módulo utilitário para testar o pipeline RAG sem envio real pelo WhatsApp. Recebe uma mensagem e retorna a resposta que seria gerada pelo agente, com logs detalhados do processo de busca e geração.

---

## Algoritmos e Padrões Transversais

### Normalização de CPF — `cpfUtils.ts` — 🟢 CONFIRMADO
- `normalizeCpfToDigits(cpf)` → remove formatação, retorna apenas dígitos
- `normalizeCpfColumnSql(coluna)` → expressão SQL que normaliza CPF no banco
- Usada em joins entre `conversations` e `vm_lav_clientes` e no programa de fidelidade

### Normalização de Telefone — `phoneUtils.ts` — 🟢 CONFIRMADO
- Função SQL `normaliza_telefone()` criada no banco para joins entre contatos WhatsApp e clientes VM Lav
- Padroniza formatos com/sem DDI, com/sem traço/parênteses

### Tratamento de resultados MariaDB — 🟡 INFERIDO
O driver MariaDB v3 pode retornar dados de formas diferentes (`[rows, metadata]`, array direto, objeto). Todos os models implementam lógica defensiva de detecção do formato antes de desestruturar — padrão repetido em todos os 20+ models.

### Pattern de comunicação IA → Ação — 🟢 CONFIRMADO
A IA embute comandos no texto da resposta usando sintaxe `[COMANDO:valor]`. O `ConversationService` extrai e remove esses comandos antes de enviar a resposta final ao usuário. Padrão: regex extraction + string replacement.

---

## Lacunas e Riscos Identificados

| Item | Nível | Descrição |
|------|-------|-----------|
| Ausência de testes | 🔴 | Zero cobertura de testes automatizados |
| URLs VM Lav hardcoded | 🔴 | `idEmpresa=1737`, `empresaLocalizador='lavateriajdnovomundo'` hardcoded no código |
| JWT_SECRET padrão inseguro | 🔴 | Fallback `'default-secret'` usado se env não configurado |
| Scraping via Puppeteer | 🔴 | Autenticação VM Lav via automação de browser — frágil a mudanças de UI |
| Sem rate limiting | 🟡 | API sem proteção contra abuso (nenhum middleware de rate limit) |
| Sem retry no Ollama | 🟡 | Se o LLM falhar, a mensagem não é reprocessada |
| MariaDB result parsing | 🟡 | Lógica defensiva repetida em todos os models — alto custo de manutenção |
| Configuração multi-tenant incompleta | 🟡 | Sistema suporta múltiplos users mas UI parece single-user |
