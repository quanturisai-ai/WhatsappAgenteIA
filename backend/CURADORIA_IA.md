# 📝 Sistema de Curadoria de IA

Este documento explica como funciona o sistema de log automático para curadoria das interações de teste com a IA.

## 🎯 Objetivo

Sempre que você enviar uma mensagem através do **Chat de Teste** (botão "Testar IA"), o sistema automaticamente registra:

1. **Mensagem do usuário** (a pergunta que você fez)
2. **Prompt completo** enviado à IA (com todo o contexto, histórico, data/hora, etc.)
3. **Resposta bruta da IA** (antes de qualquer limpeza ou formatação)

Isso permite que você faça **curadoria** e análise de como o agente está respondendo.

## 📂 Localização do Log

O arquivo de log é criado automaticamente em:

```
backend/logs/test-chat.log
```

## 📋 Formato do Log

Cada interação é registrada no seguinte formato:

```
====================================================================================================
📅 DATA/HORA: 2025-11-08T23:00:00.000Z
👤 USUÁRIO ID: 1

💬 MENSAGEM DO USUÁRIO:
Quanto custa a lavagem?

📝 PROMPT COMPLETO ENVIADO À IA:
====================================================================================================
Hoje é sábado, dia 8 de novembro de 2025 e agora são 20:00.

Você é um assistente de atendimento da empresa Lavateria Lozandes.

Informações sobre o negócio:
...

Contexto relevante dos documentos:
...

Histórico da conversa:
Cliente: Olá
Agente: Olá! Seja bem-vindo...

Cliente: Quanto custa a lavagem?

Agente:
====================================================================================================

🤖 RESPOSTA DA IA (SEM LIMPEZA):
====================================================================================================
A lavagem custa R$ 16,95 e leva aproximadamente 30 minutos.
====================================================================================================

```

## 🔍 Como Usar para Curadoria

### 1. Realizar Testes

- Abra o Chat de Teste clicando no botão "Testar IA" no Dashboard
- Faça perguntas simulando um cliente real
- Cada mensagem é automaticamente registrada

### 2. Analisar os Logs

```bash
# Ver as últimas interações
cd backend/logs
cat test-chat.log

# Ver apenas as últimas 50 linhas
tail -n 50 test-chat.log

# Buscar por palavra-chave
grep -A 10 "preço" test-chat.log
```

### 3. Identificar Melhorias

Ao revisar o log, você pode:

- ✅ Verificar se o **prompt** está incluindo as informações corretas
- ✅ Analisar se o **contexto** recuperado do ChromaDB é relevante
- ✅ Identificar se a **resposta** está clara e adequada
- ✅ Detectar problemas de formatação ou repetições
- ✅ Avaliar se a IA está seguindo a personalidade configurada

### 4. Ajustar a Base de Conhecimento

Com base na análise:

1. **Adicionar/editar Tópicos** se a IA não souber responder algo
2. **Melhorar a Personality** se as respostas não estiverem no tom correto
3. **Adicionar Documentos** se faltar informação específica
4. **Ajustar Instruções Específicas** se a IA não seguir regras

## 🛠️ Funcionalidades Adicionais

### Obter Informações do Log via API

```bash
GET http://localhost:3002/api/test-chat/log-info

Response:
{
  "logFilePath": "C:\\Projetos\\Agente Zap\\backend\\logs\\test-chat.log",
  "message": "As interações de teste são logadas automaticamente neste arquivo para curadoria"
}
```

### Limpar Histórico de Teste

Para começar uma nova conversa de teste (não afeta o log de curadoria):

```bash
DELETE http://localhost:3002/api/test-chat/
```

## 📊 Exemplo de Análise

### Problema Identificado:
```
💬 MENSAGEM DO USUÁRIO:
Vocês abrem aos domingos?

🤖 RESPOSTA DA IA:
Desculpe, não tenho essa informação.
```

### Solução:
- Verificar no log se o contexto "Horários de atendimento" foi recuperado
- Se não foi recuperado, reindexar o agent_config ou criar um tópico específico
- Se foi recuperado mas a IA não usou, melhorar as instruções da Personality

## 🔒 Segurança

- O log contém apenas dados de **teste**, não de conversas reais do WhatsApp
- O arquivo é local e não é exposto pela API
- Recomenda-se não commitar o arquivo no repositório (já está no .gitignore)

## 📈 Melhoria Contínua

Use este log para:

1. **Identificar padrões** de perguntas mal respondidas
2. **Testar melhorias** antes de aplicá-las em produção
3. **Documentar** o comportamento esperado vs. real
4. **Treinar** a base de conhecimento de forma iterativa

---

💡 **Dica**: Faça testes regulares simulando diferentes tipos de clientes e situações para garantir que o agente está sempre preparado!

