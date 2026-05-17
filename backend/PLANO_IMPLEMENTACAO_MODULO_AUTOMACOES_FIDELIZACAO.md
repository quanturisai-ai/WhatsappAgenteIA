# Plano de Implementação: Módulo de Automações de Relacionamento (Fidelização)

**Objetivo:** Incluir um submódulo parametrizável para envio automatizado de mensagens de relacionamento aos clientes, sem interferir no que já funciona (conquistas, progresso, notificações existentes).

**Princípio:** O novo módulo é **aditivo** — roda em paralelo ao fluxo atual.

---

## Índice

1. [Contexto e o que já existe](#1-contexto-e-o-que-já-existe)
2. [Banco de Dados](#2-banco-de-dados)
3. [Dados iniciais: tipos de gatilho](#3-dados-iniciais-tipos-de-gatilho)
4. [Arquitetura Backend](#4-arquitetura-backend)
5. [Motor de Regras (lógica de disparo)](#5-motor-de-regras-lógica-de-disparo)
6. [Anti-saturação (regras gerais)](#6-anti-saturação-regras-gerais)
7. [Pré-visualização de clientes afetados](#7-pré-visualização-de-clientes-afetados)
8. [Frontend](#8-frontend)
9. [API (rotas)](#9-api-rotas)
10. [Etapas de Implementação](#10-etapas-de-implementação)

---

## 1. Contexto e o que já existe

### 1.1 Componentes que NÃO devem ser alterados em comportamento

| Componente | Descrição |
|------------|-----------|
| `fidelizacao_config` | Configuração por usuário (notificar_conquistas, notificar_progresso, simulação, templates) |
| `fidelizacao_notificacoes` | Histórico de envios (CONQUISTA, PROGRESSO, ENTREGA, IGNORADO) |
| `FidelizacaoNotificacaoService` | Envia notificações de conquista/progresso via WhatsApp |
| `vmLavScheduler.ts` | Scheduler que sincroniza VM Lav e processa notificações existentes |
| `vm_lav_clientes` | Dados do cliente: nome, data_nascimento, cpf, telefone, data_ultima_compra, qtd_compras, etc. |
| `vm_lav_pedidos` | Pedidos com maquina_descricao, tipo_servico, data_venda, servico, etc. |

### 1.2 Integração

- O motor de automações será chamado **após** o processamento atual de notificações no scheduler (uma chamada adicional por usuário sincronizado).
- Novos envios gerados pelas regras serão registrados em `fidelizacao_notificacoes` com `regra_id` preenchido e `tipo_notificacao` correspondente.
- Os tipos de gatilho e suas queries SQL ficam na tabela `fidelizacao_tipos_gatilho`, tornando o sistema extensível sem alterar código.

---

## 2. Banco de Dados

### 2.1 Nova tabela: `fidelizacao_tipos_gatilho`

Armazena a definição de cada tipo de gatilho: SQL, schema de parâmetros e placeholders. Para criar novos tipos no futuro, basta INSERT nessa tabela.

```sql
CREATE TABLE IF NOT EXISTS fidelizacao_tipos_gatilho (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(50) NOT NULL UNIQUE COMMENT 'Código interno usado em fidelizacao_regras.tipo_gatilho',
    nome_exibicao VARCHAR(100) NOT NULL COMMENT 'Nome amigável para o frontend',
    descricao TEXT COMMENT 'Explicação do que o gatilho faz',
    query_template TEXT NOT NULL COMMENT 'SQL com placeholders nomeados :user_id, :param_dias, :data_ativacao, etc.',
    parametros_schema JSON NOT NULL COMMENT 'Schema dos campos de parâmetro para renderização dinâmica no frontend',
    placeholders_disponiveis JSON NOT NULL COMMENT 'Lista de placeholders que este gatilho suporta no template de mensagem',
    frequencia_minima_dias_default INT NOT NULL DEFAULT 30 COMMENT 'Valor sugerido de frequência ao criar uma regra deste tipo',
    ativo TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 2.2 Nova tabela: `fidelizacao_regras`

Armazena as regras configuráveis pelo administrador. Cada regra referencia um tipo de gatilho e tem horário de envio e data de ativação próprios.

```sql
CREATE TABLE IF NOT EXISTS fidelizacao_regras (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    tipo_gatilho_id INT NOT NULL COMMENT 'Referência ao tipo de gatilho em fidelizacao_tipos_gatilho',
    nome_regra VARCHAR(150) NOT NULL,
    parametros JSON NOT NULL COMMENT 'Valores dos parâmetros conforme o schema do tipo. Ex: {"dias": 30}',
    mensagem_template TEXT NOT NULL COMMENT 'Mensagem com placeholders. Ex: Olá {primeiro_nome}, faz {dias_ausente} dias...',
    frequencia_minima_dias INT NOT NULL DEFAULT 30 COMMENT 'Anti-spam: dias mínimos entre reenvios da MESMA regra para o MESMO cliente',
    horario_inicio TIME NOT NULL DEFAULT '08:00:00' COMMENT 'Hora mínima para envio desta regra',
    horario_fim TIME NOT NULL DEFAULT '20:00:00' COMMENT 'Hora máxima para envio desta regra',
    data_ativacao DATE NOT NULL DEFAULT (CURDATE()) COMMENT 'Regra só afeta clientes cadastrados ou pedidos realizados a partir desta data',
    ativo TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_fidelizacao_regras_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_fidelizacao_regras_tipo FOREIGN KEY (tipo_gatilho_id) REFERENCES fidelizacao_tipos_gatilho(id),
    INDEX idx_user_ativo (user_id, ativo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 2.3 Nova tabela: `fidelizacao_regras_config`

Configuração global do módulo de automações (anti-saturação).

```sql
CREATE TABLE IF NOT EXISTS fidelizacao_regras_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    ativo TINYINT(1) DEFAULT 0 COMMENT 'Módulo de automações ligado/desligado',
    max_mensagens_por_cliente_semana INT DEFAULT 2 COMMENT 'Máximo de mensagens de automação por cliente por semana',
    max_mensagens_por_cliente_mes INT DEFAULT 4 COMMENT 'Máximo de mensagens de automação por cliente por mês',
    simulacao TINYINT(1) DEFAULT 1 COMMENT 'Modo simulação (registra mas não envia WhatsApp)',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_fidelizacao_regras_config_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

> **Nota:** O horário de envio agora fica **por regra** (em `fidelizacao_regras`), não na config global. Isso permite que cada regra tenha sua própria janela de disparo.

### 2.4 Alterações na tabela existente `fidelizacao_notificacoes`

**2.4.1** Trocar ENUM por VARCHAR para extensibilidade (novos tipos sem ALTER TABLE):

```sql
ALTER TABLE fidelizacao_notificacoes
MODIFY COLUMN tipo_notificacao VARCHAR(50) NOT NULL;
```

> Os valores existentes (CONQUISTA, PROGRESSO, ENTREGA, IGNORADO) continuam funcionando normalmente, pois são strings válidas em VARCHAR. Nenhum dado existente é afetado.

**2.4.2** Adicionar coluna para vincular notificação à regra que a gerou:

```sql
ALTER TABLE fidelizacao_notificacoes
ADD COLUMN regra_id INT NULL COMMENT 'ID da regra de automação que gerou esta notificação (NULL para conquista/progresso/entrega)' AFTER pedido_id;

ALTER TABLE fidelizacao_notificacoes ADD INDEX idx_regra_id (regra_id);
ALTER TABLE fidelizacao_notificacoes ADD INDEX idx_regra_cpf_data (regra_id, cpf_cliente, data_envio);
```

> O índice composto `idx_regra_cpf_data` é essencial para a consulta de anti-spam por regra (frequência mínima por cliente).

---

## 3. Dados iniciais: tipos de gatilho

Após criar a tabela `fidelizacao_tipos_gatilho`, popular com os 5 tipos suportados. Cada registro contém o SQL, schema e placeholders.

### 3.1 INATIVIDADE

```sql
INSERT INTO fidelizacao_tipos_gatilho (codigo, nome_exibicao, descricao, query_template, parametros_schema, placeholders_disponiveis, frequencia_minima_dias_default) VALUES (
  'INATIVIDADE',
  'Inatividade',
  'Clientes que não realizam compras há X dias. Útil para campanhas de reativação e cupons de retorno.',
  'SELECT c.id, c.user_id, c.nome, c.cpf, c.telefone, c.data_nascimento, c.data_ultima_compra, c.qtd_compras, c.valor_total_compras, c.email, DATEDIFF(NOW(), c.data_ultima_compra) AS dias_ausente FROM vm_lav_clientes c WHERE c.user_id = :user_id AND c.data_ultima_compra <= NOW() - INTERVAL :param_dias DAY AND c.data_cadastro >= :data_ativacao AND c.telefone IS NOT NULL AND TRIM(c.telefone) != ''''',
  '{"campos": [{"nome": "dias", "tipo": "number", "label": "Dias sem compra", "obrigatorio": true, "default": 30, "min": 1, "max": 365, "placeholder_sql": ":param_dias"}]}',
  '["nome", "primeiro_nome", "dias_ausente", "data_ultima_visita", "qtd_compras", "valor_total"]',
  30
);
```

### 3.2 ANIVERSARIO

```sql
INSERT INTO fidelizacao_tipos_gatilho (codigo, nome_exibicao, descricao, query_template, parametros_schema, placeholders_disponiveis, frequencia_minima_dias_default) VALUES (
  'ANIVERSARIO',
  'Aniversário',
  'Clientes que fazem aniversário no dia de hoje. Ideal para mensagens de parabéns e ofertas especiais.',
  'SELECT c.id, c.user_id, c.nome, c.cpf, c.telefone, c.data_nascimento, c.data_ultima_compra, c.qtd_compras, c.valor_total_compras, c.email, DATEDIFF(NOW(), c.data_ultima_compra) AS dias_ausente FROM vm_lav_clientes c WHERE c.user_id = :user_id AND c.data_nascimento IS NOT NULL AND MONTH(c.data_nascimento) = MONTH(CURDATE()) AND DAY(c.data_nascimento) = DAY(CURDATE()) AND c.data_cadastro >= :data_ativacao AND c.telefone IS NOT NULL AND TRIM(c.telefone) != ''''',
  '{"campos": []}',
  '["nome", "primeiro_nome", "data_ultima_visita", "qtd_compras", "valor_total"]',
  365
);
```

### 3.3 REATIVACAO_TIPO_SERVICO

```sql
INSERT INTO fidelizacao_tipos_gatilho (codigo, nome_exibicao, descricao, query_template, parametros_schema, placeholders_disponiveis, frequencia_minima_dias_default) VALUES (
  'REATIVACAO_TIPO_SERVICO',
  'Reativação por tipo de serviço',
  'Clientes que usaram um tipo de máquina/serviço específico há mais de X dias e não usaram novamente desde então. Exemplo: lembrete de edredom, secadora grande, etc.',
  'SELECT DISTINCT c.id, c.user_id, c.nome, c.cpf, c.telefone, c.data_nascimento, c.data_ultima_compra, c.qtd_compras, c.valor_total_compras, c.email, DATEDIFF(NOW(), MAX(p.data_venda)) AS dias_ausente FROM vm_lav_clientes c JOIN vm_lav_pedidos p ON p.cliente_cpf = c.cpf AND p.user_id = c.user_id WHERE c.user_id = :user_id AND p.maquina_descricao LIKE CONCAT(''%'', :param_maquina_keyword, ''%'') AND p.situacao_venda = ''Sucesso'' AND p.data_venda >= :data_ativacao AND c.telefone IS NOT NULL AND TRIM(c.telefone) != '''' GROUP BY c.id, c.user_id, c.nome, c.cpf, c.telefone, c.data_nascimento, c.data_ultima_compra, c.qtd_compras, c.valor_total_compras, c.email HAVING MAX(p.data_venda) <= NOW() - INTERVAL :param_dias_apos_uso DAY',
  '{"campos": [{"nome": "dias_apos_uso", "tipo": "number", "label": "Dias desde último uso", "obrigatorio": true, "default": 21, "min": 1, "max": 365, "placeholder_sql": ":param_dias_apos_uso"}, {"nome": "maquina_keyword", "tipo": "text", "label": "Palavra-chave na máquina/serviço", "obrigatorio": true, "default": "", "placeholder": "Ex: Secadora Grande, Edredom", "placeholder_sql": ":param_maquina_keyword"}]}',
  '["nome", "primeiro_nome", "dias_ausente", "data_ultima_visita", "qtd_compras", "valor_total"]',
  30
);
```

### 3.4 DATA_FIXA

```sql
INSERT INTO fidelizacao_tipos_gatilho (codigo, nome_exibicao, descricao, query_template, parametros_schema, placeholders_disponiveis, frequencia_minima_dias_default) VALUES (
  'DATA_FIXA',
  'Data fixa',
  'Dispara em uma data específica do ano (mês e dia). Público: clientes ativos (com compra nos últimos 90 dias). Útil para início de estação, volta às aulas, datas comemorativas.',
  'SELECT c.id, c.user_id, c.nome, c.cpf, c.telefone, c.data_nascimento, c.data_ultima_compra, c.qtd_compras, c.valor_total_compras, c.email, DATEDIFF(NOW(), c.data_ultima_compra) AS dias_ausente FROM vm_lav_clientes c WHERE c.user_id = :user_id AND MONTH(CURDATE()) = :param_mes AND DAY(CURDATE()) = :param_dia AND c.data_ultima_compra >= NOW() - INTERVAL 90 DAY AND c.data_cadastro >= :data_ativacao AND c.telefone IS NOT NULL AND TRIM(c.telefone) != ''''',
  '{"campos": [{"nome": "mes", "tipo": "number", "label": "Mês (1-12)", "obrigatorio": true, "default": 1, "min": 1, "max": 12, "placeholder_sql": ":param_mes"}, {"nome": "dia", "tipo": "number", "label": "Dia (1-31)", "obrigatorio": true, "default": 1, "min": 1, "max": 31, "placeholder_sql": ":param_dia"}]}',
  '["nome", "primeiro_nome", "data_ultima_visita", "qtd_compras", "valor_total"]',
  365
);
```

### 3.5 QTD_COMPRAS

```sql
INSERT INTO fidelizacao_tipos_gatilho (codigo, nome_exibicao, descricao, query_template, parametros_schema, placeholders_disponiveis, frequencia_minima_dias_default) VALUES (
  'QTD_COMPRAS',
  'Quantidade de compras',
  'Clientes que atingiram uma quantidade mínima de compras. Útil para campanhas de indicação (promotores) ou boas-vindas pós-primeira compra.',
  'SELECT c.id, c.user_id, c.nome, c.cpf, c.telefone, c.data_nascimento, c.data_ultima_compra, c.qtd_compras, c.valor_total_compras, c.email, DATEDIFF(NOW(), c.data_ultima_compra) AS dias_ausente FROM vm_lav_clientes c WHERE c.user_id = :user_id AND c.qtd_compras >= :param_qtd_minima AND c.data_cadastro >= :data_ativacao AND c.telefone IS NOT NULL AND TRIM(c.telefone) != ''''',
  '{"campos": [{"nome": "qtd_minima", "tipo": "number", "label": "Quantidade mínima de compras", "obrigatorio": true, "default": 10, "min": 1, "max": 9999, "placeholder_sql": ":param_qtd_minima"}]}',
  '["nome", "primeiro_nome", "dias_ausente", "data_ultima_visita", "qtd_compras", "valor_total"]',
  30
);
```

### 3.6 Referência: como adicionar novos tipos no futuro

Para criar um novo tipo de gatilho no futuro, basta:

1. Escrever o SQL parametrizado (usando `:user_id`, `:data_ativacao` e `:param_*` para cada campo).
2. Definir o `parametros_schema` JSON (campos do formulário).
3. Listar os `placeholders_disponiveis` para o template.
4. Executar um INSERT na tabela `fidelizacao_tipos_gatilho`.
5. Nenhuma alteração de código backend ou frontend é necessária — o motor lê a query do banco e o frontend renderiza o formulário baseado no schema.

---

## 4. Arquitetura Backend

### 4.1 Novos arquivos

| Arquivo | Responsabilidade |
|---------|------------------|
| `src/config/migrations/add_fidelizacao_regras.sql` | CREATE TABLE + ALTER TABLE + INSERTs dos tipos de gatilho |
| `src/models/fidelizacaoTipoGatilho.model.ts` | Leitura da tabela `fidelizacao_tipos_gatilho` |
| `src/models/fidelizacaoRegra.model.ts` | CRUD da tabela `fidelizacao_regras` |
| `src/models/fidelizacaoRegrasConfig.model.ts` | CRUD da tabela `fidelizacao_regras_config` |
| `src/services/fidelizacaoRegras.service.ts` | Motor de regras: executa queries do banco, anti-spam, template, envio, preview |
| `src/controllers/fidelizacaoRegras.controller.ts` | Endpoints REST para tipos, regras, config e preview |
| `src/routes/fidelizacaoRegras.routes.ts` | Rotas do módulo |

### 4.2 Model: FidelizacaoTipoGatilho

- Interface: `id`, `codigo`, `nome_exibicao`, `descricao`, `query_template`, `parametros_schema` (objeto), `placeholders_disponiveis` (string[]), `frequencia_minima_dias_default`, `ativo`, `created_at`, `updated_at`.
- Métodos: `findAll()` (ativos), `findByCodigo(codigo)`, `findById(id)`.

### 4.3 Model: FidelizacaoRegra

- Interface: `id`, `user_id`, `tipo_gatilho_id`, `nome_regra`, `parametros` (objeto), `mensagem_template`, `frequencia_minima_dias`, `horario_inicio`, `horario_fim`, `data_ativacao`, `ativo`, `created_at`, `updated_at`.
- Métodos: `findByUserId(userId)`, `findById(id)`, `create(regra)`, `update(id, updates)`, `delete(id)`.

### 4.4 Model: FidelizacaoRegrasConfig

- Interface: `id`, `user_id`, `ativo`, `max_mensagens_por_cliente_semana`, `max_mensagens_por_cliente_mes`, `simulacao`, `created_at`, `updated_at`.
- Métodos: `findByUserId(userId)`, `getOrCreateDefault(userId)`, `upsert(config)`.

---

## 5. Motor de Regras (lógica de disparo)

### 5.1 Fluxo principal: `processarRegrasUsuario(userId)`

```
1. Buscar fidelizacao_regras_config do usuário
   → se ativo = false, retornar (módulo desligado)

2. Buscar todas as regras com ativo = 1 e user_id = userId

3. Para cada regra:
   a. Verificar HORÁRIO DA REGRA: se CURRENT_TIME < regra.horario_inicio
      ou CURRENT_TIME > regra.horario_fim, pular esta regra

   b. Buscar o tipo de gatilho (fidelizacao_tipos_gatilho) via tipo_gatilho_id

   c. Montar a query SQL:
      - Pegar query_template do tipo de gatilho
      - Substituir :user_id, :data_ativacao e cada :param_* pelos valores
        de regra.parametros (usando prepared statements / bind params)
      - Executar a query

   d. Para cada cliente retornado:
      i.   ANTI-SPAM POR REGRA: consultar fidelizacao_notificacoes onde
           regra_id = regra.id AND cpf_cliente = c.cpf
           AND data_envio > NOW() - INTERVAL regra.frequencia_minima_dias DAY
           → Se existir, pular cliente

      ii.  ANTI-SATURAÇÃO SEMANAL: contar notificações com regra_id IS NOT NULL
           para este cpf nos últimos 7 dias
           → Se count >= max_mensagens_por_cliente_semana, pular

      iii. ANTI-SATURAÇÃO MENSAL: idem para 30 dias
           → Se count >= max_mensagens_por_cliente_mes, pular

      iv.  PROCESSAR TEMPLATE: substituir placeholders ({nome}, {primeiro_nome},
           {dias_ausente}, {data_ultima_visita}, {qtd_compras}, {valor_total})
           pelos dados do cliente retornados na query

      v.   REGISTRAR + ENVIAR:
           - Se config.simulacao = true:
             INSERT em fidelizacao_notificacoes com enviado_whatsapp = 0
           - Se config.simulacao = false:
             Enviar via WhatsApp (WhatsAppManager.getServiceSync + sendMessage)
             INSERT com enviado_whatsapp = 1 (ou 0 + erro se falhar)

   e. Logar resumo da regra (qualificados, enviados, ignorados por anti-spam)

4. Logar resumo geral do usuário
```

### 5.2 Execução segura de queries do banco (anti-SQL-injection)

O motor **não** concatena valores diretamente na string SQL. O fluxo é:

1. Ler `query_template` do banco (ex.: `... WHERE c.user_id = :user_id AND c.data_ultima_compra <= NOW() - INTERVAL :param_dias DAY ...`).
2. Ler `parametros_schema` para saber quais `:param_*` existem e qual campo de `regra.parametros` mapeia para cada um.
3. Construir um mapa de substituições: `{":user_id": userId, ":data_ativacao": regra.data_ativacao, ":param_dias": regra.parametros.dias}`.
4. Substituir cada placeholder nomeado por `?` na string SQL, na mesma ordem.
5. Executar com `conn.query(sqlComInterrogacoes, arrayDeValores)` (prepared statement).

### 5.3 Placeholders suportados no template de mensagem

| Placeholder | Origem / Cálculo |
|-------------|-------------------|
| `{nome}` | `vm_lav_clientes.nome` (completo) ou "Cliente" se null |
| `{primeiro_nome}` | Primeiro nome extraído de `nome` |
| `{dias_ausente}` | Coluna calculada `dias_ausente` retornada pela query (DATEDIFF) |
| `{data_ultima_visita}` | `data_ultima_compra` formatada em pt-BR (dd/mm/aaaa) |
| `{qtd_compras}` | `vm_lav_clientes.qtd_compras` |
| `{valor_total}` | `vm_lav_clientes.valor_total_compras` formatado em R$ |

O service substitui apenas os placeholders presentes no template; placeholders sem dado correspondente são substituídos por string vazia.

### 5.4 Integração com o scheduler

No `vmLavScheduler.ts`, **após a etapa 7** (notificações de progresso/conquista), adicionar:

```typescript
// 8. Processar automações de relacionamento (módulo de regras)
try {
  await fidelizacaoRegrasService.processarRegrasUsuario(userId);
} catch (err: any) {
  logger.error(`Erro ao processar automações para usuário ${userId}: ${err.message}`);
}
```

---

## 6. Anti-saturação (regras gerais)

### 6.1 Três níveis de proteção

| Nível | Descrição | Configurado em | Consulta |
|-------|-----------|----------------|----------|
| 1. Por regra | Mesma regra para mesmo cliente: respeitar `frequencia_minima_dias` | `fidelizacao_regras.frequencia_minima_dias` | `WHERE regra_id = ? AND cpf_cliente = ? AND data_envio > NOW() - INTERVAL ? DAY` |
| 2. Global semanal | Total de automações (qualquer regra) por cliente por semana | `fidelizacao_regras_config.max_mensagens_por_cliente_semana` | `WHERE user_id = ? AND cpf_cliente = ? AND regra_id IS NOT NULL AND data_envio >= NOW() - INTERVAL 7 DAY` |
| 3. Global mensal | Total de automações por cliente por mês | `fidelizacao_regras_config.max_mensagens_por_cliente_mes` | `WHERE user_id = ? AND cpf_cliente = ? AND regra_id IS NOT NULL AND data_envio >= NOW() - INTERVAL 30 DAY` |

### 6.2 Horário por regra

Cada regra em `fidelizacao_regras` tem `horario_inicio` e `horario_fim`. O motor verifica `CURRENT_TIME` contra esses valores **antes** de executar a query daquela regra específica. Isso permite:

- Regra de **INATIVIDADE** disparando apenas entre **08:00 e 09:00** (horário de pico matinal).
- Regra de **QTD_COMPRAS** disparando entre **06:00 e 22:00** (janela ampla).
- Regra de **ANIVERSARIO** disparando entre **07:00 e 08:00** (mensagem de manhã cedo).

### 6.3 Data de ativação

O campo `data_ativacao` em `fidelizacao_regras` é passado para o placeholder `:data_ativacao` na query SQL do tipo de gatilho. Todas as queries incluem `AND c.data_cadastro >= :data_ativacao` (ou filtro equivalente por data de pedido), garantindo que:

- Ao criar uma regra **hoje**, apenas clientes cadastrados a partir de hoje (ou com pedidos a partir de hoje) serão afetados.
- Não há "disparo em massa" retroativo ao ativar uma nova regra.

---

## 7. Pré-visualização de clientes afetados

### 7.1 Endpoint de preview

Permite visualizar quais clientes seriam afetados por uma regra e qual mensagem cada um receberia, **sem enviar nada**.

**Rota:** `POST /fidelizacao/automacoes/regras/:id/preview` (regra já salva)
**Rota alternativa:** `POST /fidelizacao/automacoes/regras/preview` (body com dados da regra, para preview antes de salvar)

### 7.2 Fluxo do preview

1. Receber os dados da regra (do banco se `:id`, ou do body se preview antes de salvar).
2. Buscar o tipo de gatilho (`fidelizacao_tipos_gatilho`).
3. Montar e executar a query SQL (mesma lógica do motor, com `data_ativacao` e parâmetros).
4. Aplicar anti-spam por regra e anti-saturação global (para mostrar status real).
5. Processar o `mensagem_template` para cada cliente, substituindo placeholders.
6. Retornar:

```json
{
  "total_qualificados": 42,
  "total_bloqueados_antispam": 5,
  "clientes": [
    {
      "nome": "João Silva",
      "cpf": "123.456.789-00",
      "telefone": "5562991126970",
      "dias_ausente": 35,
      "data_ultima_visita": "27/12/2025",
      "mensagem_previa": "Olá João, faz 35 dias que não te vemos! Que tal passar aqui esta semana?",
      "status": "qualificado"
    },
    {
      "nome": "Maria Souza",
      "cpf": "987.654.321-00",
      "telefone": "5562994770224",
      "dias_ausente": 40,
      "data_ultima_visita": "22/12/2025",
      "mensagem_previa": "Olá Maria, faz 40 dias que não te vemos! ...",
      "status": "bloqueado_frequencia"
    }
  ]
}
```

### 7.3 Frontend

Botão **"Pré-visualizar"** no modal de criação/edição de regra. Ao clicar, mostra uma tabela/lista dos clientes afetados com:

- Nome, telefone, status (qualificado / bloqueado por anti-spam).
- Mensagem que seria enviada (expandível ou em tooltip).

---

## 8. Frontend

### 8.1 Aba no Fidelização

No componente `FidelizacaoTab.tsx`, adicionar sub-aba **"Automações"**.

```typescript
type FidelizacaoSubTab = 'premios' | 'clientes' | 'conquistas' | 'notificacoes' | 'automacoes';
```

### 8.2 Tela de Automações

**Bloco 1 — Configurações gerais do módulo (card no topo)**

- Switch: "Módulo de automações ativo" → `fidelizacao_regras_config.ativo`.
- Switch: "Modo simulação" → `simulacao`.
- Número: "Máx. mensagens por cliente por semana" (default 2).
- Número: "Máx. mensagens por cliente por mês" (default 4).

**Bloco 2 — Lista de regras (tabela)**

| Nome | Tipo de gatilho | Parâmetro | Horário | Freq. mín. | Data ativação | Status | Ações |
|------|-----------------|-----------|---------|------------|---------------|--------|-------|
| Saudades | Inatividade | 30 dias | 08:00-09:00 | 30 dias | 01/02/2026 | Ativa | Pré-visualizar / Editar / Desativar |
| Aniversário | Aniversário | — | 07:00-08:00 | 365 dias | 01/02/2026 | Ativa | Pré-visualizar / Editar / Desativar |

**Bloco 3 — Modal "Nova regra" / "Editar regra"**

- **Nome da regra** (texto).
- **Tipo de gatilho** (select dinâmico — carregado de `GET /fidelizacao/automacoes/tipos`):
  - Ao selecionar, os campos de parâmetro são renderizados dinamicamente usando `parametros_schema` do tipo.
  - Os placeholders disponíveis para a mensagem são mostrados como dica, vindos de `placeholders_disponiveis`.
- **Campos dinâmicos** (renderizados conforme `parametros_schema`):
  - Inatividade → "Dias sem compra" (number).
  - Aniversário → nenhum campo extra.
  - Reativação por serviço → "Dias desde último uso" (number), "Palavra-chave" (text).
  - Data fixa → "Mês" (1–12), "Dia" (1–31).
  - Qtd. compras → "Quantidade mínima" (number).
- **Horário de envio:** "Das [___] às [___]" (time inputs).
- **Data de ativação:** date picker (default: hoje).
- **Mensagem** (textarea) com dica de placeholders disponíveis para o tipo selecionado.
- **Frequência mínima** (dias): "Não reenviar para o mesmo cliente antes de [___] dias" (pré-preenchido com `frequencia_minima_dias_default` do tipo).
- **Botão "Pré-visualizar"**: chama endpoint de preview e mostra a lista de clientes afetados com mensagem prévia.
- **Botões:** Salvar, Cancelar.

### 8.3 Serviço frontend

Criar `fidelizacaoRegras.service.ts` no frontend com chamadas para:

- `GET /fidelizacao/automacoes/tipos` — Listar tipos de gatilho disponíveis.
- `GET /fidelizacao/automacoes/config` — Buscar config global.
- `PUT /fidelizacao/automacoes/config` — Salvar config global.
- `GET /fidelizacao/automacoes/regras` — Listar regras do usuário.
- `POST /fidelizacao/automacoes/regras` — Criar regra.
- `PUT /fidelizacao/automacoes/regras/:id` — Editar regra.
- `DELETE /fidelizacao/automacoes/regras/:id` — Excluir regra.
- `PATCH /fidelizacao/automacoes/regras/:id/toggle` — Ativar/desativar.
- `POST /fidelizacao/automacoes/regras/:id/preview` — Pré-visualizar clientes afetados.
- `POST /fidelizacao/automacoes/regras/preview` — Preview antes de salvar (body com dados da regra).

---

## 9. API (rotas)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/fidelizacao/automacoes/tipos` | Lista tipos de gatilho disponíveis (de `fidelizacao_tipos_gatilho`) |
| GET | `/fidelizacao/automacoes/config` | Retorna config do módulo para o usuário autenticado |
| PUT | `/fidelizacao/automacoes/config` | Atualiza config (ativo, limites, simulação) |
| GET | `/fidelizacao/automacoes/regras` | Lista regras do usuário |
| POST | `/fidelizacao/automacoes/regras` | Cria nova regra |
| GET | `/fidelizacao/automacoes/regras/:id` | Detalhe de uma regra |
| PUT | `/fidelizacao/automacoes/regras/:id` | Atualiza regra |
| DELETE | `/fidelizacao/automacoes/regras/:id` | Remove regra |
| PATCH | `/fidelizacao/automacoes/regras/:id/toggle` | Alterna ativo (1/0) |
| POST | `/fidelizacao/automacoes/regras/:id/preview` | Pré-visualiza clientes afetados por regra salva |
| POST | `/fidelizacao/automacoes/regras/preview` | Pré-visualiza clientes afetados (body com dados da regra, antes de salvar) |

Todas as rotas exigem autenticação e escopam por `user_id` do token.

---

## 10. Etapas de Implementação

### Etapa 1 — Banco de dados, tipos de gatilho e models

**Objetivo:** Ter todas as tabelas criadas, tipos de gatilho populados e acesso via código.

1. Criar arquivo de migration `add_fidelizacao_regras.sql` com:
   - `CREATE TABLE fidelizacao_tipos_gatilho`
   - `CREATE TABLE fidelizacao_regras`
   - `CREATE TABLE fidelizacao_regras_config`
   - `ALTER TABLE fidelizacao_notificacoes` (VARCHAR + coluna `regra_id` + índices)
   - INSERTs dos 5 tipos de gatilho (INATIVIDADE, ANIVERSARIO, REATIVACAO_TIPO_SERVICO, DATA_FIXA, QTD_COMPRAS)
2. Executar a migration no ambiente de desenvolvimento.
3. Implementar `FidelizacaoTipoGatilho.model.ts` (leitura).
4. Implementar `FidelizacaoRegra.model.ts` (CRUD).
5. Implementar `FidelizacaoRegrasConfig.model.ts` (getOrCreateDefault, upsert).
6. Atualizar tipo `TipoNotificacao` em `fidelizacaoNotificacao.model.ts` para aceitar os novos valores (trocar para `string` em vez de tipo literal, compatível com VARCHAR) e adicionar campo `regra_id` na interface.

**Critério de conclusão:** Migrations aplicadas; models testados (criar/ler tipos, criar/ler/atualizar regra e config).

---

### Etapa 2 — Motor de regras (service)

**Objetivo:** Lógica de disparo funcionando em modo simulação.

1. Criar `fidelizacaoRegras.service.ts` com:
   - `processarRegrasUsuario(userId)` — fluxo completo descrito na seção 5.1.
   - Parser de `query_template`: substitui placeholders nomeados (`:user_id`, `:param_*`, `:data_ativacao`) por `?` e monta array de bind params (seção 5.2).
   - Função de anti-spam por regra (consulta `fidelizacao_notificacoes`).
   - Função de anti-saturação global (contagem 7 e 30 dias).
   - Função de processamento de template (substituição de placeholders de mensagem).
   - Registro em `fidelizacao_notificacoes` com `regra_id`, `tipo_notificacao` (= tipo_gatilho.codigo) e `enviado_whatsapp` conforme simulação.
   - Envio via `WhatsAppManager.getServiceSync(userId)` + `sendMessage` quando `simulacao = false`.
2. Garantir que, em simulação, nenhuma mensagem seja enviada ao WhatsApp.
3. Tratar CPF de forma consistente (normalização).

**Critério de conclusão:** Com uma regra de inatividade (30 dias) e config em simulação, ao chamar `processarRegrasUsuario(userId)` são criados registros em `fidelizacao_notificacoes` com `regra_id` e tipo correto, sem envio real. Anti-spam e anti-saturação respeitados.

---

### Etapa 3 — Endpoint de preview

**Objetivo:** API de pré-visualização de clientes afetados por uma regra.

1. Implementar no service o método `previewRegra(userId, dadosRegra)` que:
   - Executa a mesma query do motor (com parâmetros e `data_ativacao`).
   - Aplica anti-spam e anti-saturação para cada cliente (marcando status).
   - Processa o template para cada cliente.
   - Retorna lista de clientes com mensagem prévia e status.
2. Criar endpoints no controller:
   - `POST .../regras/:id/preview` (regra salva).
   - `POST .../regras/preview` (body com dados antes de salvar).

**Critério de conclusão:** Chamada ao endpoint retorna lista de clientes com mensagem processada e status (qualificado / bloqueado).

---

### Etapa 4 — Controller e rotas

**Objetivo:** API REST completa para tipos, regras e config.

1. Criar `fidelizacaoRegras.controller.ts` com handlers para:
   - GET tipos de gatilho.
   - GET/PUT config.
   - CRUD regras + toggle + preview.
2. Criar `fidelizacaoRegras.routes.ts` e registrar no roteador com middleware de autenticação.
3. Validar dados de entrada (frequência positiva, tipo de gatilho existente, parâmetros compatíveis com o schema do tipo, horário início < fim, etc.).

**Critério de conclusão:** Todas as rotas da seção 9 funcionando e testáveis via Postman.

---

### Etapa 5 — Integração no scheduler

**Objetivo:** Automações rodando automaticamente após cada ciclo de sincronização.

1. No `vmLavScheduler.ts`, após o bloco de notificações de progresso/conquista, adicionar chamada a `fidelizacaoRegrasService.processarRegrasUsuario(userId)` com try/catch.
2. Garantir que falhas não interrompam o scheduler.

**Critério de conclusão:** Em um run completo do scheduler (sync + notificações + regras), as regras são processadas e registros aparecem em `fidelizacao_notificacoes`.

---

### Etapa 6 — Frontend: config, listagem e tipos

**Objetivo:** Tela de automações com config global, lista de regras e tipos carregados do banco.

1. Adicionar sub-aba "Automações" em `FidelizacaoTab.tsx`.
2. Criar componente da tela de Automações com:
   - Card de configurações gerais (ativo, simulação, max semana/mês). Carregar via GET config, salvar via PUT.
   - Tabela de regras (GET regras) com colunas: nome, tipo, parâmetro, horário, freq. mínima, data ativação, status, ações.
3. Criar serviço frontend com chamadas à API.
4. Carregar tipos de gatilho (GET tipos) para uso no formulário.

**Critério de conclusão:** Tela exibe config e lista de regras; tipos carregados para o select do formulário.

---

### Etapa 7 — Frontend: CRUD de regras e preview

**Objetivo:** Criar/editar regras e pré-visualizar clientes afetados.

1. Modal "Nova regra" / "Editar regra" com:
   - Select de tipo de gatilho (carregado de `fidelizacao_tipos_gatilho`).
   - Campos dinâmicos renderizados conforme `parametros_schema` do tipo selecionado.
   - Placeholders disponíveis mostrados como dica, vindos de `placeholders_disponiveis`.
   - Campos de horário (inicio/fim), data de ativação, frequência mínima.
   - Textarea de mensagem.
2. Botão "Pré-visualizar" que chama endpoint de preview e exibe tabela com clientes afetados e mensagem prévia.
3. Ações na tabela: Editar, Ativar/Desativar (toggle), Excluir (com confirmação), Pré-visualizar.

**Critério de conclusão:** Usuário consegue criar regra, pré-visualizar afetados, editar, desativar e excluir.

---

### Etapa 8 — Testes e ajustes finais

**Objetivo:** Estabilidade e comportamento correto.

1. Testar cenários:
   - Duas regras ativas para o mesmo cliente: verificar anti-saturação semanal/mensal.
   - Horário por regra: regra com 08:00-09:00 não dispara às 10:00.
   - Data de ativação: regra criada hoje não afeta clientes antigos.
   - Simulação: registros criados sem envio; ao desativar simulação, envio real.
   - Preview: lista correta com mensagens processadas e status de anti-spam.
2. Verificar que notificações geradas pelas regras aparecem na tela existente de Notificações.
3. Ajustes de UX, loading states, mensagens de erro/sucesso.

**Critério de conclusão:** Módulo de automações funcionando de ponta a ponta sem afetar fluxos existentes (conquista, progresso, entrega).

---

## Resumo das etapas

| # | Etapa | Entregável principal |
|---|-------|----------------------|
| 1 | Banco de dados, tipos de gatilho e models | Migration + 3 tabelas + INSERTs tipos + 3 models |
| 2 | Motor de regras (service) | processarRegrasUsuario + parser SQL + anti-spam + template |
| 3 | Endpoint de preview | previewRegra + rotas de preview |
| 4 | Controller e rotas | API REST completa (tipos, config, regras, toggle, preview) |
| 5 | Integração no scheduler | Chamada a processarRegrasUsuario no vmLavScheduler |
| 6 | Frontend: config, listagem e tipos | Sub-aba Automações + card config + tabela regras + select tipos |
| 7 | Frontend: CRUD de regras e preview | Modal dinâmico + pré-visualização de clientes afetados |
| 8 | Testes e ajustes finais | Anti-saturação, horário por regra, data ativação, simulação, preview |

---

*Documento gerado para o projeto WhatsappAgenteIA — Módulo de Automações de Fidelização.*
*Atualizado com: horário por regra, data de ativação, pré-visualização de clientes, tipos de gatilho no banco de dados.*
