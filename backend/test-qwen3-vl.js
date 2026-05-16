const axios = require('axios');

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const MODEL = 'qwen3:30b'; // Testando qwen3:30b (sem -vl)

async function testModel() {
  console.log('🧪 Testando modelo qwen3 no Ollama...\n');
  console.log(`📍 Base URL: ${OLLAMA_BASE_URL}`);
  console.log(`🤖 Modelo: ${MODEL}\n`);

  // Teste 1: Verificar se o modelo está disponível
  console.log('1️⃣ Verificando se o modelo está disponível...');
  try {
    const tagsResponse = await axios.get(`${OLLAMA_BASE_URL}/api/tags`);
    const models = tagsResponse.data.models || [];
    const modelExists = models.some(m => m.name === MODEL || m.name.startsWith(MODEL));
    
    if (modelExists) {
      const modelInfo = models.find(m => m.name === MODEL || m.name.startsWith(MODEL));
      console.log(`✅ Modelo encontrado: ${modelInfo.name}`);
      console.log(`   Tamanho: ${(modelInfo.size / 1024 / 1024 / 1024).toFixed(2)} GB\n`);
    } else {
      console.log(`❌ Modelo ${MODEL} não encontrado!`);
      console.log(`   Modelos disponíveis:`);
      models.forEach(m => console.log(`   - ${m.name}`));
      console.log('\n💡 Para instalar: ollama pull qwen3-vl\n');
      process.exit(1);
    }
  } catch (error) {
    console.log(`❌ Erro ao verificar modelos: ${error.message}`);
    console.log(`   Certifique-se de que o Ollama está rodando em ${OLLAMA_BASE_URL}\n`);
    process.exit(1);
  }

  // Teste 2: Testar geração de resposta (generate)
  console.log('2️⃣ Testando geração de resposta (generate)...');
  try {
    const generateResponse = await axios.post(`${OLLAMA_BASE_URL}/api/generate`, {
      model: MODEL,
      prompt: 'Olá, você está funcionando? Responda apenas "Sim, estou funcionando!"',
      stream: false,
    }, {
      timeout: 30000, // 30 segundos
    });

    if (generateResponse.data && generateResponse.data.response) {
      console.log(`✅ Geração de resposta funcionando!`);
      console.log(`   Resposta: ${generateResponse.data.response.substring(0, 100)}...\n`);
    } else {
      console.log(`❌ Resposta inválida do Ollama\n`);
      process.exit(1);
    }
  } catch (error) {
    console.log(`❌ Erro ao gerar resposta: ${error.message}`);
    if (error.response) {
      console.log(`   Status: ${error.response.status}`);
      console.log(`   Dados: ${JSON.stringify(error.response.data)}\n`);
    }
    process.exit(1);
  }

  // Teste 3: Testar geração de embeddings (CRÍTICO para o RAG)
  console.log('3️⃣ Testando geração de embeddings (CRÍTICO para RAG)...');
  try {
    const embeddingResponse = await axios.post(`${OLLAMA_BASE_URL}/api/embeddings`, {
      model: MODEL,
      prompt: 'teste de embedding',
    }, {
      timeout: 30000, // 30 segundos
    });

    if (embeddingResponse.data && embeddingResponse.data.embedding) {
      const embedding = embeddingResponse.data.embedding;
      console.log(`✅ Geração de embeddings funcionando!`);
      console.log(`   Dimensão do embedding: ${embedding.length}`);
      console.log(`   Primeiros valores: [${embedding.slice(0, 5).join(', ')}...]\n`);
    } else {
      console.log(`❌ Resposta de embedding inválida do Ollama\n`);
      process.exit(1);
    }
  } catch (error) {
    console.log(`❌ Erro ao gerar embedding: ${error.message}`);
    if (error.response) {
      console.log(`   Status: ${error.response.status}`);
      console.log(`   Dados: ${JSON.stringify(error.response.data)}\n`);
    }
    console.log(`\n⚠️  ATENÇÃO: O modelo ${MODEL} pode não suportar embeddings!`);
    console.log(`   Isso significa que o sistema RAG não funcionará com este modelo.\n`);
    process.exit(1);
  }

  // Resumo final
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ TODOS OS TESTES PASSARAM!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📝 Próximos passos:');
  console.log('   1. Atualize o arquivo .env: OLLAMA_MODEL=qwen3-vl');
  console.log('   2. Reinicie o servidor backend');
  console.log('   3. O sistema estará pronto para usar o qwen3-vl!\n');
}

testModel().catch(error => {
  console.error('❌ Erro fatal:', error.message);
  process.exit(1);
});

