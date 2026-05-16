# 🔄 Fluxo: Como o Nome do Cliente Substitui o Número no Dashboard

## 📊 Visão Geral do Processo

O processo de substituir o número de telefone pelo nome do cliente no dashboard funciona em **4 etapas principais**:

```
1. Banco de Dados (SQL Query)
   ↓
2. Model (conversation.model.ts)
   ↓
3. Controller (conversation.controller.ts)
   ↓
4. Frontend (ConversationCard.tsx)
```

---

## 🔍 Etapa 1: Banco de Dados (SQL Query)

**Arquivo:** `backend/src/models/conversation.model.ts` - método `findByUserId()`

### O que acontece:
1. A query SQL faz um **LEFT JOIN** entre as tabelas:
   - `conversations` (tabela principal)
   - `vm_lav_clientes` (tabela de clientes do VM Lav)

2. **Normalização de telefones:**
   - Remove caracteres não numéricos de ambos os números
   - Converte número do cliente VM: `(62) 99670-7477` → `5562996707477` (adiciona código do país 55)
   - Normaliza número do WhatsApp: `5562996707477` → `5562996707477`

3. **Comparação:**
   ```sql
   CONCAT('55', REPLACE(...cl.telefone...)) = REPLACE(...c.contact_number...)
   ```

4. **Se encontrar correspondência:**
   - Extrai os **dois primeiros nomes** do cliente usando `SUBSTRING_INDEX`
   - Retorna no campo `contact_name`

5. **Se NÃO encontrar correspondência:**
   - Usa o `contact_name` original da tabela `conversations` (que geralmente é NULL)

### Exemplo de Query:
```sql
SELECT 
  c.id,
  c.contact_number,
  CASE 
    WHEN cl.nome IS NOT NULL AND cl.nome != '' THEN 
      CONCAT(
        SUBSTRING_INDEX(TRIM(cl.nome), ' ', 1),  -- Primeiro nome
        CASE 
          WHEN SUBSTRING_INDEX(TRIM(cl.nome), ' ', 2) != SUBSTRING_INDEX(TRIM(cl.nome), ' ', 1) 
          THEN CONCAT(' ', SUBSTRING_INDEX(SUBSTRING_INDEX(TRIM(cl.nome), ' ', 2), ' ', -1))  -- Segundo nome
          ELSE ''
        END
      )
    ELSE c.contact_name 
  END as contact_name
FROM conversations c
LEFT JOIN vm_lav_clientes cl ON 
  cl.user_id = c.user_id AND
  (CONCAT('55', REPLACE(...cl.telefone...)) = REPLACE(...c.contact_number...))
```

---

## 🔄 Etapa 2: Model (conversation.model.ts)

**Arquivo:** `backend/src/models/conversation.model.ts`

### O que acontece:
1. Recebe o resultado da query SQL
2. **Normaliza o `contact_name`:**
   - Remove espaços em branco no início/fim
   - Converte strings vazias para `null`
3. Retorna um array de objetos com `contact_name` já processado

### Código:
```typescript
return rows.map((row: any) => ({
  ...row,
  contact_name: row.contact_name && row.contact_name.trim() !== '' 
    ? row.contact_name.trim() 
    : (row.contact_name || null),
}));
```

---

## 🎯 Etapa 3: Controller (conversation.controller.ts)

**Arquivo:** `backend/src/controllers/conversation.controller.ts` - método `listConversations()`

### O que acontece:
1. Recebe as conversas do Model
2. **Enriquece cada conversa** com informações adicionais (última mensagem, contagem, etc.)
3. **Mapeia `contact_name` para `contactName`** (camelCase para o frontend)
4. Garante que `contactName` seja `null` se estiver vazio

### Código:
```typescript
const enrichedConv = {
  id: conv.id,
  contactNumber: conv.contact_number,
  contactName: conv.contact_name && conv.contact_name.trim() !== '' 
    ? conv.contact_name.trim() 
    : null,
  // ... outros campos
};
```

5. Retorna JSON para o frontend:
```json
{
  "conversations": [
    {
      "id": 1,
      "contactNumber": "5562996707477",
      "contactName": "João Silva",  // ou null se não encontrou
      ...
    }
  ]
}
```

---

## 🎨 Etapa 4: Frontend (ConversationCard.tsx)

**Arquivo:** `frontend/src/components/ConversationCard.tsx`

### O que acontece:
1. Recebe o objeto `conversation` com `contactName` e `contactNumber`
2. **Usa fallback:** Se `contactName` for `null` ou vazio, usa `contactNumber`
3. Exibe no card:
   - **Título (h4):** `{conversation.contactName || conversation.contactNumber}`
   - **Subtítulo (p):** `{conversation.contactNumber}` (sempre mostra o número)

### Código:
```tsx
<h4 className="font-semibold text-gray-900">
  {conversation.contactName || conversation.contactNumber}
</h4>
<p className="text-sm text-gray-500">{conversation.contactNumber}</p>
```

---

## 🐛 Como Debugar Problemas

### 1. Verificar se a query SQL está encontrando correspondência:

**No backend, verifique os logs:**
```
findByUserId - Primeira conversa: id=1, contact_name="João Silva", contact_number="5562996707477"
```

**Se `contact_name` for `NULL`:**
- O JOIN não encontrou correspondência
- Verifique se os números estão no formato correto
- Verifique se há clientes na tabela `vm_lav_clientes` com `user_id` correto

### 2. Verificar se o controller está mapeando corretamente:

**No backend, verifique os logs:**
```
Conversa 1: contact_name="João Silva", contact_number="5562996707477"
Conversa 1 enriquecida: contactName="João Silva", contactNumber="5562996707477"
```

### 3. Verificar se o frontend está recebendo:

**No console do navegador (F12), verifique:**
```javascript
📋 Conversas recebidas do backend: [
  {
    id: 1,
    contactName: "João Silva",  // ou "NULL/VAZIO" se não encontrou
    contactNumber: "5562996707477",
    usandoNome: true  // ou false se não encontrou
  }
]
```

### 4. Verificar se o componente está renderizando:

**No código do ConversationCard:**
- Se `contactName` existir → mostra o nome
- Se `contactName` for `null` → mostra o número (fallback)

---

## ✅ Checklist de Verificação

- [ ] Há clientes na tabela `vm_lav_clientes` com `user_id` correto?
- [ ] Os números de telefone estão no formato correto?
  - Cliente VM: `(62) 99670-7477` ou similar
  - WhatsApp: `5562996707477` ou similar
- [ ] A query SQL está retornando `contact_name` não-nulo?
- [ ] O controller está mapeando `contactName` corretamente?
- [ ] O frontend está recebendo `contactName` no JSON?
- [ ] O componente está usando `contactName || contactNumber`?

---

## 🔧 Possíveis Problemas e Soluções

### Problema 1: `contact_name` sempre NULL
**Causa:** JOIN não está encontrando correspondência
**Solução:**
- Verifique se os números estão normalizados corretamente
- Verifique se há clientes na tabela `vm_lav_clientes`
- Verifique se o `user_id` está correto

### Problema 2: `contact_name` vem do banco mas não aparece no frontend
**Causa:** Problema no mapeamento do controller
**Solução:**
- Verifique os logs do controller
- Verifique se `contactName` está sendo enviado no JSON

### Problema 3: Nome aparece mas está errado
**Causa:** Problema na extração dos dois primeiros nomes
**Solução:**
- Verifique a lógica de `SUBSTRING_INDEX` na query SQL
- Verifique se o nome completo está correto na tabela `vm_lav_clientes`

---

## 📝 Notas Importantes

1. **LEFT JOIN:** Se não encontrar correspondência, `contact_name` será o valor original da tabela `conversations` (geralmente NULL)

2. **Normalização de telefones:** É crucial que ambos os números sejam normalizados da mesma forma para a comparação funcionar

3. **Fallback no frontend:** O código `{conversation.contactName || conversation.contactNumber}` garante que sempre haverá algo para exibir

4. **Logs de debug:** Foram adicionados logs em todas as etapas para facilitar o debug

