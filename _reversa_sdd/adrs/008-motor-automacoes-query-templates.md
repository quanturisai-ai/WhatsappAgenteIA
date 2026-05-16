# ADR-008 — Motor de Automações com Query Templates Dinâmicos

> Status: Ativo
> Data: 🟢 CONFIRMADO — migration `add_fidelizacao_regras.sql`
> Confiança: 🟢 CONFIRMADO

## Contexto

O sistema de fidelização precisa disparar mensagens automáticas via WhatsApp para clientes baseado em múltiplos tipos de evento (inatividade, aniversário, data fixa, quantidade de compras, etc.). Cada tipo de gatilho tem sua própria lógica de seleção de público. Novos tipos de gatilho devem poder ser adicionados sem deploys de código.

## Decisão

Armazenar **query templates SQL** diretamente no banco de dados na tabela `fidelizacao_tipos_gatilho`. Cada tipo de gatilho tem:
- `query_template`: SQL parametrizado com placeholders `:user_id`, `:param_*`
- `parametros_schema`: JSON Schema dos parâmetros configuráveis pelo usuário
- `placeholders_disponiveis`: variáveis disponíveis para uso no template da mensagem

O motor (`FidelizacaoRegrasService.executarQueryGatilho()`) interpola os parâmetros e executa a query para obter a lista de clientes afetados.

## Justificativa

- **Extensibilidade sem código**: novos tipos de gatilho podem ser adicionados via INSERT no banco
- **Flexibilidade**: queries arbitrárias permitem segmentações complexas (ex: % de pedidos no fim de semana)
- **Configurabilidade**: cada regra instanciada pelo usuário define seus próprios parâmetros (ex: quantos dias de inatividade)

## Consequências

**Positivas:**
- Adicionar novo tipo de gatilho = INSERT + UPDATE, sem deploy
- Motor genérico reutilizado para todos os tipos
- Modo simulação integrado — testável antes de envio real

**Negativas/Riscos:**
- 🔴 **SQL Injection**: se os parâmetros não forem sanitizados corretamente antes da interpolação, há risco de injeção. A implementação usa placeholders nomeados `:param_*`, mas a sanitização precisa ser verificada
- 🟡 **Manutenção complexa**: queries SQL no banco são difíceis de testar, versionar e debugar
- 🟡 **Sem validação de tipo**: os `parametros_schema` definem os tipos esperados, mas se a implementação não validar, dados inválidos podem gerar SQL quebrado
- Queries removeram `:data_ativacao` em migration posterior (`add_vigencia_segmentacao_incentivo_dia_util.sql`) — evidência de evolução/correção do design inicial

## Alternativas Consideradas

- **Código TypeScript por tipo de gatilho**: mais seguro mas requer deploy para novos tipos
- **DSL customizada de filtros**: mais seguro que SQL livre mas requer parser — 🔴 LACUNA, não avaliado
