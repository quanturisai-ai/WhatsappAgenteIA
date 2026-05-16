# 🔍 ESTRATÉGIA: Melhorar Busca no ChromaDB

## 📊 PROBLEMA IDENTIFICADO

### Situação Atual:
- ❌ Busca retorna **todos os tópicos** independente da pergunta
- ❌ Não usa **trigger keywords** para filtrar
- ❌ Não tem **threshold de similaridade** (distância mínima)
- ❌ Não considera **prioridade** dos tópicos
- ❌ Não diferencia **tipo de conteúdo** (topics vs documents vs media)

### Causa Raiz:
1. **Busca apenas vetorial**: Usa apenas similaridade de embeddings
2. **Embeddings muito similares**: Tópicos do mesmo negócio têm embeddings parecidos
3. **Sem filtro por relevância**: Não verifica se a pergunta contém trigger keywords
4. **Sem threshold**: Retorna resultados mesmo com baixa similaridade

---

## 🎯 ESTRATÉGIAS PROPOSTAS

### **Estratégia 1: Busca Híbrida (RECOMENDADA)** ⭐

**Combina:**
1. Busca por **trigger keywords** (se a pergunta contém palavras-chave)
2. Busca **vetorial** com threshold de similaridade
3. **Re-ranking** considerando múltiplos fatores

**Vantagens:**
- ✅ Precisão alta (trigger keywords são muito específicos)
- ✅ Mantém busca vetorial para casos sem trigger keywords
- ✅ Considera prioridade e relevância
- ✅ Filtra resultados irrelevantes

**Implementação:**
```typescript
1. Extrair palavras da pergunta do cliente
2. Buscar tópicos cujas trigger keywords correspondem à pergunta
3. Buscar vetorialmente no ChromaDB (com threshold)
4. Combinar resultados
5. Re-ranking por:
   - Match de trigger keywords (peso: 0.5)
   - Similaridade vetorial (peso: 0.3)
   - Prioridade do tópico (peso: 0.2)
6. Retornar top N resultados
```

---

### **Estratégia 2: Busca em Duas Etapas**

**Fluxo:**
1. **Etapa 1**: Buscar tópicos com trigger keywords que correspondem à pergunta
   - Se encontrar: retornar apenas esses
2. **Etapa 2**: Se não encontrar, fazer busca vetorial com threshold

**Vantagens:**
- ✅ Simples de implementar
- ✅ Prioriza trigger keywords
- ✅ Fallback para busca vetorial

**Desvantagens:**
- ⚠️ Pode perder tópicos relevantes sem trigger keywords

---

### **Estratégia 3: Threshold de Similaridade**

**Implementação:**
- Filtrar resultados por distância máxima (ex: `distance < 0.8`)
- Só retornar resultados realmente similares

**Vantagens:**
- ✅ Simples
- ✅ Filtra resultados irrelevantes

**Desvantagens:**
- ⚠️ Não usa trigger keywords
- ⚠️ Pode filtrar resultados relevantes se threshold for muito restritivo

---

### **Estratégia 4: Metadata Filtering + Re-ranking**

**Implementação:**
- Usar filtros do ChromaDB para buscar apenas tópicos ativos
- Filtrar por tipo de conteúdo
- Re-ranking por prioridade

**Vantagens:**
- ✅ Usa recursos nativos do ChromaDB
- ✅ Filtra por tipo de conteúdo

**Desvantagens:**
- ⚠️ Não resolve o problema de similaridade

---

## 🏆 ESTRATÉGIA RECOMENDADA: Busca Híbrida

### **Implementação Detalhada:**

#### **1. Busca por Trigger Keywords**

```typescript
// Extrair palavras da pergunta (normalizar, remover stopwords)
const queryWords = normalizeQuery(userMessage);

// Buscar tópicos do MariaDB cujas trigger keywords correspondem
const topicsWithKeywords = await topicModel.findByUserId(userId)
  .filter(topic => 
    topic.trigger_keywords.some(keyword => 
      queryWords.some(word => 
        word.includes(keyword.toLowerCase()) || 
        keyword.toLowerCase().includes(word)
      )
    )
  );
```

#### **2. Busca Vetorial com Threshold**

```typescript
// Buscar no ChromaDB com threshold de similaridade
const vectorResults = await chromaService.query(
  userId, 
  queryEmbedding, 
  nResults: 10, // Buscar mais para depois filtrar
  maxDistance: 0.8 // Threshold de similaridade
);

// Filtrar por distância
const relevantResults = vectorResults.filter(r => r.distance < 0.8);
```

#### **3. Re-ranking**

```typescript
// Combinar resultados e calcular score
const scoredResults = [];

// Tópicos com trigger keywords (score alto)
for (const topic of topicsWithKeywords) {
  const vectorResult = vectorResults.find(r => r.id === `topic_${topic.id}`);
  const score = calculateScore({
    hasTriggerKeyword: true, // peso 0.5
    vectorSimilarity: vectorResult?.distance || 1.0, // peso 0.3
    priority: topic.priority, // peso 0.2
  });
  scoredResults.push({ topic, score, vectorResult });
}

// Outros resultados vetoriais (score médio)
for (const result of relevantResults) {
  if (!scoredResults.find(r => r.vectorResult?.id === result.id)) {
    const topic = await getTopicFromResult(result);
    const score = calculateScore({
      hasTriggerKeyword: false,
      vectorSimilarity: result.distance,
      priority: topic?.priority || 0,
    });
    scoredResults.push({ topic, score, vectorResult: result });
  }
}

// Ordenar por score e retornar top N
return scoredResults
  .sort((a, b) => b.score - a.score)
  .slice(0, 5)
  .map(r => r.vectorResult || r.topic);
```

---

## 📋 PLANO DE IMPLEMENTAÇÃO

### **Fase 1: Adicionar Threshold de Similaridade**

1. Modificar `ChromaDBService.query()` para aceitar `maxDistance`
2. Filtrar resultados por distância
3. Testar com diferentes thresholds (0.7, 0.8, 0.9)

### **Fase 2: Busca por Trigger Keywords**

1. Criar método `findTopicsByTriggerKeywords()` no `TopicModel`
2. Normalizar pergunta do cliente (lowercase, remover stopwords)
3. Buscar tópicos cujas trigger keywords correspondem

### **Fase 3: Re-ranking**

1. Implementar função `calculateScore()`
2. Combinar resultados de trigger keywords + busca vetorial
3. Ordenar por score

### **Fase 4: Integrar no RAGService**

1. Modificar `retrieveContext()` para usar busca híbrida
2. Testar com diferentes perguntas
3. Ajustar pesos do score

---

## 🔧 MUDANÇAS NECESSÁRIAS

### **1. ChromaDBService.query()**

```typescript
async query(
  userId: number,
  queryEmbedding: number[],
  nResults: number = 5,
  maxDistance?: number // NOVO: threshold de similaridade
): Promise<Array<{ id: string; text: string; distance: number; metadata?: Record<string, any> }>> {
  // ... código atual ...
  
  // Filtrar por distância se fornecido
  if (maxDistance !== undefined) {
    documents = documents.filter(doc => doc.distance < maxDistance);
  }
  
  return documents;
}
```

### **2. TopicModel - Novo Método**

```typescript
async findByTriggerKeywords(userId: number, queryWords: string[]): Promise<Topic[]> {
  // Buscar tópicos ativos
  const topics = await this.findActiveByUserId(userId);
  
  // Filtrar por trigger keywords
  return topics.filter(topic => {
    if (!topic.trigger_keywords || topic.trigger_keywords.length === 0) {
      return false;
    }
    
    return topic.trigger_keywords.some(keyword => {
      const normalizedKeyword = keyword.toLowerCase().trim();
      return queryWords.some(word => 
        word.includes(normalizedKeyword) || 
        normalizedKeyword.includes(word)
      );
    });
  });
}
```

### **3. RAGService.retrieveContext() - Refatorar**

```typescript
private async retrieveContext(
  userId: number, 
  query: string, 
  nResults: number = 5
): Promise<string> {
  // 1. Normalizar query
  const queryWords = this.normalizeQuery(query);
  
  // 2. Buscar tópicos por trigger keywords
  const topicModel = new TopicModel();
  const topicsWithKeywords = await topicModel.findByTriggerKeywords(userId, queryWords);
  
  // 3. Busca vetorial com threshold
  const queryEmbedding = await this.ollamaService.generateEmbedding(query);
  const vectorResults = await this.chromaService.query(
    userId, 
    queryEmbedding, 
    nResults: 10, // Buscar mais para depois filtrar
    maxDistance: 0.8 // Threshold
  );
  
  // 4. Re-ranking
  const scoredResults = this.rankResults(
    topicsWithKeywords,
    vectorResults,
    queryWords
  );
  
  // 5. Retornar top N
  const topResults = scoredResults.slice(0, nResults);
  return topResults.map(r => r.text).join('\n\n');
}
```

---

## ⚙️ CONFIGURAÇÕES RECOMENDADAS

### **Threshold de Similaridade:**
- **Inicial**: `0.8` (pode ajustar entre 0.7 e 0.9)
- **Muito restritivo**: `0.7` (menos resultados, mais precisos)
- **Menos restritivo**: `0.9` (mais resultados, menos precisos)

### **Pesos do Score:**
- **Trigger Keywords**: `0.5` (mais importante)
- **Similaridade Vetorial**: `0.3` (importante)
- **Prioridade**: `0.2` (complementar)

### **Número de Resultados:**
- **Busca vetorial inicial**: `10` (buscar mais para depois filtrar)
- **Resultados finais**: `5` (top 5 mais relevantes)

---

## 🧪 TESTES SUGERIDOS

1. **Pergunta com trigger keyword específico**
   - Deve retornar apenas tópicos com essa keyword

2. **Pergunta genérica**
   - Deve retornar tópicos mais relevantes por similaridade

3. **Pergunta sem correspondência**
   - Deve retornar vazio ou tópicos muito genéricos

4. **Múltiplos tópicos com mesma keyword**
   - Deve ordenar por prioridade e similaridade

---

## 📊 RESULTADO ESPERADO

### **Antes:**
- Pergunta: "qual horario de funcionamento"
- Retorna: **Todos os tópicos** (10+ tópicos)

### **Depois:**
- Pergunta: "qual horario de funcionamento"
- Retorna: **Apenas tópicos relevantes** (1-3 tópicos)
  - Tópico com trigger keyword "horario" ou "funcionamento"
  - Tópicos com alta similaridade vetorial
  - Ordenados por relevância

---

## 🚀 PRÓXIMOS PASSOS

1. ✅ Implementar threshold de similaridade
2. ✅ Implementar busca por trigger keywords
3. ✅ Implementar re-ranking
4. ✅ Testar com diferentes perguntas
5. ✅ Ajustar pesos e thresholds baseado em testes

---

## ❓ DECISÃO

**Qual estratégia você prefere?**

1. **Busca Híbrida** (Recomendada) - Mais completa, melhor precisão
2. **Busca em Duas Etapas** - Mais simples, prioriza trigger keywords
3. **Threshold de Similaridade** - Mais simples, apenas filtra por distância
4. **Metadata Filtering** - Usa recursos nativos do ChromaDB

**Minha recomendação: Busca Híbrida** 🏆

