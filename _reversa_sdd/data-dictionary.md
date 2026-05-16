# Dicionário de Dados — WhatsappAgenteIA (Agente Zap)

> Gerado pelo Arqueólogo (Reversa) em 2026-05-16
> Fonte: `backend/src/types/index.ts`, models e schema SQL

---

## Entidade: `users`

| Campo | Tipo TypeScript | Tipo SQL | Obrigatório | Padrão | Descrição |
|-------|----------------|----------|-------------|--------|-----------|
| id | number | INT AUTO_INCREMENT | sim | — | PK |
| username | string | VARCHAR(255) | sim | — | Login do usuário, único |
| email | string | VARCHAR(255) | sim | — | Email, único |
| password_hash | string | VARCHAR(255) | sim | — | Senha hasheada com bcrypt (salt=10) |
| created_at | Date | DATETIME | sim | NOW() | — |
| updated_at | Date | DATETIME | sim | NOW() | — |

---

## Entidade: `whatsapp_sessions`

| Campo | Tipo TypeScript | Tipo SQL | Obrigatório | Padrão | Descrição |
|-------|----------------|----------|-------------|--------|-----------|
| id | number | INT | sim | — | PK |
| user_id | number | INT | sim | — | FK → users.id, UNIQUE |
| session_data | string \| null | TEXT | não | null | Dados de sessão serializados |
| qr_code | string \| null | TEXT | não | null | QR code atual em base64/string |
| status | string | ENUM | sim | 'disconnected' | disconnected \| connecting \| connected \| authenticated \| connection_failed |
| last_connected_at | Date \| null | DATETIME | não | null | Última conexão bem-sucedida |
| last_ready_at | Date \| null | DATETIME | não | null | Última vez que ficou pronto |
| session_files_path | string \| null | VARCHAR | não | null | Caminho dos arquivos LocalAuth |
| session_files_hash | string \| null | VARCHAR | não | null | Hash dos arquivos para detectar mudanças |
| created_at | Date | DATETIME | sim | — | — |
| updated_at | Date | DATETIME | sim | — | — |

---

## Entidade: `conversations`

| Campo | Tipo TypeScript | Tipo SQL | Obrigatório | Padrão | Descrição |
|-------|----------------|----------|-------------|--------|-----------|
| id | number | INT | sim | — | PK |
| user_id | number | INT | sim | — | FK → users.id |
| contact_number | string | VARCHAR | sim | — | Número WhatsApp do contato |
| contact_name | string | VARCHAR | não | null | Nome do contato (WhatsApp ou VM Lav) |
| lid | string \| null | VARCHAR | não | null | LID interno do WhatsApp |
| status | string | ENUM | sim | 'new' | new \| in_progress \| paused \| finished |
| auto_responding | boolean \| number | TINYINT(1) | não | 1 (true) | Se IA deve responder automaticamente |
| last_message_at | Date | DATETIME | não | null | Última mensagem recebida |
| needs_intervention | boolean | TINYINT(1) | não | 0 | Flag: IA pediu atendente humano |
| intervention_resolved_at | Date \| null | DATETIME | não | null | Quando intervenção foi resolvida |
| created_at | Date | DATETIME | sim | — | — |
| updated_at | Date | DATETIME | sim | — | — |

**Campos virtuais (via JOIN com vm_lav_clientes):** `cliente_id`, `cliente_nome_completo`, `cliente_cpf`, `cliente_telefone`, `cliente_email`, `cliente_ultima_compra`, `cliente_data_cadastro`, `cliente_total_compras`, `cliente_valor_total_compras`

---

## Entidade: `messages`

| Campo | Tipo TypeScript | Tipo SQL | Obrigatório | Padrão | Descrição |
|-------|----------------|----------|-------------|--------|-----------|
| id | number | INT | sim | — | PK |
| conversation_id | number | INT | sim | — | FK → conversations.id |
| message_id | string | VARCHAR(100) | não | null | ID serializado do WhatsApp |
| content | string | TEXT | sim | — | Conteúdo da mensagem |
| message_type | string | ENUM | não | 'text' | text \| audio \| media \| reaction \| system \| location \| contact \| other |
| media_id | number \| null | INT | não | null | FK → medias.id |
| direction | string | ENUM | sim | — | incoming \| outgoing |
| is_from_ai | boolean | TINYINT(1) | sim | 0 | Se foi gerada pela IA |
| received_at | Date \| null | DATETIME | não | null | Quando ack=1 (entregue) |
| read_at | Date \| null | DATETIME | não | null | Quando ack=2 (lida) |
| created_at | Date | DATETIME | sim | — | — |

---

## Entidade: `reactions`

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| id | INT | sim | PK |
| message_id | VARCHAR(100) | sim | ID serializado da mensagem reagida |
| reaction_emoji | VARCHAR | sim | Emoji da reação |
| reacted_by | VARCHAR | sim | Número WhatsApp de quem reagiu |
| created_at | DATETIME | sim | — |

---

## Entidade: `agent_config`

| Campo | Tipo TypeScript | Tipo SQL | Padrão | Descrição |
|-------|----------------|----------|--------|-----------|
| id | number | INT | — | PK |
| user_id | number | INT | — | FK → users.id, UNIQUE |
| business_name | string | TEXT | null | Nome do negócio |
| business_info | string | TEXT | null | Descrição do negócio |
| services | string | TEXT | null | Serviços oferecidos |
| hours | string | TEXT | null | Horário de funcionamento |
| personality | string | TEXT | null | Tom/personalidade do agente |
| greeting_message | string | TEXT | null | Mensagem de saudação |
| farewell_message | string | TEXT | null | Mensagem de despedida |
| absence_message | string | TEXT | null | Mensagem fora do horário |
| specific_instructions | string | TEXT | null | Instruções especiais ao LLM |
| embedding_model | string | VARCHAR | 'deepseek-r1' | Modelo de embedding (Ollama) |
| generation_model | string | VARCHAR | 'deepseek-r1' | Modelo de geração (Ollama) |
| temperature | number | FLOAT | 0.7 | Criatividade (0.0–2.0) |
| top_p | number | FLOAT | 0.9 | Nucleus sampling (0.0–1.0) |
| top_k | number | INT | 40 | Tokens candidatos (1–100) |
| repeat_penalty | number | FLOAT | 1.1 | Penalidade de repetição (0.0–2.0) |
| max_age_hours | number | INT | 12 | Inatividade máxima de conversa (horas) |
| last_indexed_at | Date | DATETIME | null | Última indexação no ChromaDB |
| indexing_status | string | ENUM | null | pending \| indexing \| indexed \| error |
| content_hash | string | VARCHAR | null | Hash do conteúdo para detectar mudanças |

---

## Entidade: `documents`

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| id | INT | sim | PK |
| user_id | INT | sim | FK → users.id |
| filename | VARCHAR | sim | Nome original do arquivo |
| file_type | VARCHAR | sim | Extensão: .txt, .pdf, .docx |
| file_path | VARCHAR | sim | Caminho físico em uploads/ |
| file_size | INT | sim | Tamanho em bytes |
| status | ENUM | sim | pending \| processing \| completed \| error |
| error_message | TEXT | não | Mensagem de erro se status=error |

---

## Entidade: `document_chunks`

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| id | INT | sim | PK |
| document_id | INT | sim | FK → documents.id |
| chunk_text | TEXT | sim | Trecho do documento (≤1000 chars) |
| chunk_index | INT | sim | Posição do chunk no documento |
| embedding | TEXT | não | Vetor serializado (armazenado no ChromaDB) |

---

## Entidade: `medias`

| Campo | Tipo | Obrigatório | Padrão | Descrição |
|-------|------|-------------|--------|-----------|
| id | INT | sim | — | PK |
| user_id | INT | sim | — | FK → users.id |
| filename | VARCHAR | sim | — | Nome do arquivo |
| file_path | VARCHAR | sim | — | Caminho em uploads/medias/ |
| file_type | ENUM | sim | — | video \| image \| document \| audio |
| source | ENUM | não | 'outgoing' | outgoing \| incoming |
| file_size | INT | sim | — | Bytes |
| title | VARCHAR | sim | — | Título da mídia |
| description | TEXT | sim | — | Descrição/instruções de uso |
| caption | TEXT | não | null | Legenda enviada com a mídia |
| is_active | TINYINT(1) | sim | 1 | Ativo/inativo |
| mandatory_send | TINYINT(1) | não | 0 | Enviada automaticamente em toda conversa |
| indexing_status | ENUM | não | null | pending \| indexing \| indexed \| error |
| content_hash | VARCHAR | não | null | Hash para detectar mudanças |

---

## Entidade: `topics`

| Campo | Tipo | Obrigatório | Padrão | Descrição |
|-------|------|-------------|--------|-----------|
| id | INT | sim | — | PK |
| user_id | INT | sim | — | FK → users.id |
| title | VARCHAR | sim | — | Nome do tópico |
| description | TEXT | sim | — | Conteúdo injetado no prompt |
| trigger_keywords | JSON | sim | [] | Palavras-chave que ativam o tópico |
| context | ENUM | sim | — | greeting \| farewell \| absence \| special_date \| custom |
| priority | INT | sim | 0 | Peso no re-ranking (0–100) |
| is_active | TINYINT(1) | sim | 1 | Ativo/inativo |
| indexing_status | ENUM | não | null | pending \| indexing \| indexed \| error |
| content_hash | VARCHAR | não | null | — |

---

## Entidade: `human_attendants`

| Campo | Tipo | Obrigatório | Padrão | Descrição |
|-------|------|-------------|--------|-----------|
| id | INT | sim | — | PK |
| user_id | INT | sim | — | FK → users.id |
| phone_number | VARCHAR | sim | — | Número WhatsApp do atendente |
| name | VARCHAR | não | null | Nome opcional |
| is_active | TINYINT(1) | sim | 1 | Ativo/inativo |

---

## Entidades VM Lav

### `vm_lav_credentials`
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | INT | PK |
| user_id | INT | FK → users.id |
| email | VARCHAR | Login VM Lav |
| senha | VARCHAR | Senha (🔴 provavelmente em texto plano) |
| token | TEXT | JWT da API VM Lav |
| token_expires_at | DATETIME | Expiração do token |

### `vm_lav_clientes`
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | INT | PK |
| user_id | INT | FK → users.id |
| nome | VARCHAR | Nome do cliente |
| cpf | VARCHAR | CPF (pode vir formatado ou apenas dígitos) |
| telefone | VARCHAR | Telefone de contato |
| email | VARCHAR | Email |
| data_nascimento | DATE | — |
| data_ultima_compra | DATETIME | — |
| data_cadastro | DATETIME | — |
| qtd_compras | INT | Total de compras |
| valor_total_compras | DECIMAL | Valor total acumulado |

### `vm_lav_pedidos`
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | INT | PK |
| user_id | INT | FK → users.id |
| cliente_cpf | VARCHAR | CPF do cliente (normalizado) |
| tipo_servico | VARCHAR | 'Lavagem' ou 'Secagem' |
| situacao_venda | VARCHAR | 'Sucesso', 'Cancelado', etc. |
| data_venda | DATETIME | Data do serviço |
| pago_com_fidelidade | TINYINT(1) | Se foi pago com ponto de fidelidade |

### `vm_lav_vouchers`
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | INT | PK interno |
| id_voucher_vm | VARCHAR | ID do voucher na API VM Lav |
| user_id | INT | FK → users.id |
| cliente_cpf | VARCHAR | CPF do titular |
| descricao | TEXT | Descrição do voucher |
| data_criacao | DATETIME | — |
| data_validade | DATETIME | — |
| utilizado | TINYINT(1) | Se já foi resgatado |

---

## Entidades Fidelização

### `premios`
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | INT | PK |
| user_id | INT | FK → users.id |
| descricao | VARCHAR | Nome do prêmio |
| meta | INT | Quantidade de utilizações para atingir |
| tipo_servico | ENUM | 'Lavagem', 'Secagem', ou 'Total' |
| is_active | TINYINT(1) | — |

### `premios_clientes`
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | INT | PK |
| user_id | INT | FK → users.id |
| cliente_cpf | VARCHAR | CPF do cliente |
| premio_id | INT | FK → premios.id |
| data_conquista | DATETIME | — |
| data_validade | DATETIME | — |
| utilizado | TINYINT(1) | — |

### `fidelizacao_regras`
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | INT | PK |
| user_id | INT | FK → users.id |
| tipo_gatilho_id | INT | FK → fidelizacao_tipos_gatilho.id |
| template_mensagem | TEXT | Mensagem com variáveis |
| is_ativo | TINYINT(1) | — |
| vigencia_inicio | DATETIME | Início da vigência |
| vigencia_fim | DATETIME | Fim da vigência |
| segmentacao_publico | JSON | Filtros de público-alvo |
| intervalo_verificacao | INT | Intervalo mínimo entre disparos (horas) |

### `fidelizacao_notificacoes`
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | INT | PK |
| user_id | INT | — |
| regra_id | INT | FK → fidelizacao_regras.id |
| cliente_cpf | VARCHAR | — |
| telefone | VARCHAR | — |
| mensagem | TEXT | Mensagem enviada |
| status | ENUM | — |
| pedido_id | INT | FK → vm_lav_pedidos (opcional) |
| enviado_em | DATETIME | — |

---

## Tipos TypeScript compartilhados (`types/index.ts`)

| Interface | Usado em |
|-----------|----------|
| User | auth, middleware |
| WhatsAppSession | whatsapp |
| Conversation | conversation, whatsapp |
| Message | conversation, whatsapp |
| Reaction | conversation, whatsapp |
| AgentConfig | agentConfig, rag, indexing |
| Document | document |
| DocumentChunk | document, indexing |
| Media | media, conversation |
| Topic | topic, rag |
| HumanAttendant | humanAttendant |
| AttendantAlert | humanAttendant, conversation |
