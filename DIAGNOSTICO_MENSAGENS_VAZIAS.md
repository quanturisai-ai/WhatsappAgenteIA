# Diagnóstico: Mensagens sem Texto no Banco de Dados

## Data do Diagnóstico
2025-11-11

## Problema Identificado
Mensagens na tabela `messages` estão sendo salvas sem conteúdo de texto (`content` vazio ou null).

## Análise do Código

### 1. Fluxo de Salvamento de Mensagens

**Arquivo:** `backend/src/services/whatsapp.service.ts`
**Função:** `handleIncomingMessage()`
**Linhas:** 1245-1258

```typescript
// Salvar mensagem no banco
try {
  const savedMessage = await this.messageModel.create({
    conversation_id: conversation.id,
    message_id: msg.id._serialized,
    content: msg.body,  // ⚠️ PROBLEMA: msg.body pode ser null/undefined/vazio
    direction: 'incoming',
    is_from_ai: false,
  });
  logger.info(`Mensagem salva no banco: ID=${savedMessage.id}, conversation_id=${conversation.id}, content="${msg.body.substring(0, 50)}..."`);
} catch (error: any) {
  logger.error(`Erro ao salvar mensagem no banco: ${error.message}`);
}
```

### 2. Problemas Identificados

#### Problema 1: Falta de Validação do `msg.body`
- O código salva `msg.body` diretamente sem verificar se está vazio, null ou undefined
- Se `msg.body` for `null` ou `undefined`, será salvo como string vazia ou causar erro
- O log na linha 1254 pode causar erro se `msg.body` for null (tentativa de usar `.substring()`)

#### Problema 2: Não há Filtro para Tipos Especiais de Mensagens
O código apenas ignora:
- Mensagens de status (`msg.isStatus`)
- Mensagens de grupos (`msg.from.includes('@g.us')`)

**NÃO há verificação para:**
- Reações/curtidas (emoji reactions)
- Mensagens de sistema
- Mensagens apenas com mídia (sem texto)
- Mensagens de localização
- Mensagens de contato
- Outros tipos especiais

#### Problema 3: Estrutura da Tabela
**Arquivo:** `backend/src/config/database.schema.sql`
**Linha:** 54

```sql
content TEXT NOT NULL,
```

- O campo `content` é `NOT NULL`, mas permite string vazia
- Não há campo para armazenar tipo de mensagem
- Não há campo para armazenar informações de reações

### 3. Possíveis Causas das Mensagens Vazias

#### Causa 1: Reações/Emojis
Quando um cliente reage a uma mensagem (curtir com emoji), o WhatsApp pode enviar um evento de mensagem, mas:
- `msg.body` pode ser `null` ou vazio
- A reação pode estar em outra propriedade (ex: `msg.hasReaction`, `msg.reaction`)
- O whatsapp-web.js pode não expor reações diretamente no objeto Message

#### Causa 2: Mensagens Apenas com Mídia
Mensagens que contêm apenas imagem/vídeo/áudio sem legenda:
- `msg.body` pode ser `null` ou string vazia
- A mídia está em `msg.hasMedia` ou `msg.type`

#### Causa 3: Mensagens de Sistema
Alguns tipos de mensagens do WhatsApp não têm corpo de texto:
- Mensagens de chamada perdida
- Mensagens de sistema
- Atualizações de status

#### Causa 4: Erro no Log
Na linha 1254, há um log que tenta fazer `msg.body.substring(0, 50)`, mas se `msg.body` for `null` ou `undefined`, isso causará erro:
```typescript
logger.info(`Mensagem salva no banco: ID=${savedMessage.id}, conversation_id=${conversation.id}, content="${msg.body.substring(0, 50)}..."`);
```

### 4. Evidências nos Logs

Nos logs encontrados, há várias mensagens com `msg.body="..."`:
```
Processando mensagem recebida de 556284732205. msg.from=556284732205@c.us, msg.body="..."
Processando mensagem recebida de 556295395041. msg.from=556295395041@c.us, msg.body="..."
```

Isso indica que `msg.body` está presente mas vazio (string vazia `""`), não `null`.

### 5. O que o whatsapp-web.js Retorna

Baseado na documentação do whatsapp-web.js:
- O objeto `Message` tem propriedade `body` que pode ser `null` ou string vazia
- Para reações, pode haver propriedades como `hasReaction` ou `reaction`
- Para mídia, há `hasMedia`, `type`, `mediaKey`, etc.
- O código atual **não verifica nenhuma dessas propriedades**

## Recomendações (Apenas Diagnóstico - Não Implementado)

### 1. Adicionar Validação Antes de Salvar
```typescript
// Verificar se a mensagem tem conteúdo válido
if (!msg.body || msg.body.trim() === '') {
  // Verificar se é mídia, reação, ou outro tipo especial
  if (msg.hasMedia) {
    // Salvar como mensagem de mídia
  } else if (msg.hasReaction) {
    // Salvar como reação (ou ignorar)
  } else {
    // Ignorar mensagem sem conteúdo
    logger.debug('Mensagem sem conteúdo ignorada');
    return;
  }
}
```

### 2. Adicionar Campo de Tipo na Tabela
```sql
ALTER TABLE messages ADD COLUMN message_type ENUM('text', 'media', 'reaction', 'system', 'location', 'contact') DEFAULT 'text';
```

### 3. Corrigir o Log
```typescript
logger.info(`Mensagem salva no banco: ID=${savedMessage.id}, conversation_id=${conversation.id}, content="${(msg.body || '').substring(0, 50)}..."`);
```

### 4. Investigar Propriedades do Objeto Message
Verificar quais propriedades o whatsapp-web.js expõe para:
- Reações: `msg.hasReaction`, `msg.reaction`, `msg._data.reaction`
- Mídia: `msg.hasMedia`, `msg.type`, `msg.mediaKey`
- Outros tipos: `msg.type`, `msg.location`, `msg.contact`

## Conclusão

As mensagens vazias provavelmente são:
1. **Reações/curtidas** - O cliente reagindo a mensagens da IA
2. **Mensagens apenas com mídia** - Sem legenda de texto
3. **Mensagens de sistema** - Que não têm corpo de texto

O código atual não diferencia esses tipos e salva todas as mensagens, mesmo quando `msg.body` está vazio.

## Próximos Passos Sugeridos

1. Verificar no banco de dados quantas mensagens têm `content` vazio
2. Verificar se essas mensagens têm `message_id` válido
3. Investigar as propriedades do objeto `Message` do whatsapp-web.js para reações
4. Decidir se reações devem ser salvas (com tipo especial) ou ignoradas
5. Implementar validação e filtros apropriados

