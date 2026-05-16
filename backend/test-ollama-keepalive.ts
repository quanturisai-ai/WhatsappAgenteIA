// backend/test-ollama-keepalive.ts
import axios, { AxiosInstance } from 'axios';
import http from 'http';
import https from 'https';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'gpt-oss:20b';

interface TestResult {
  testName: string;
  firstRequestTime: number;
  subsequentRequestTimes: number[];
  averageSubsequentTime: number;
  improvement: number;
  headers?: any;
  body?: any;
}

// Criar agentes HTTP com keep-alive
const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 5,
  maxFreeSockets: 2,
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 5,
  maxFreeSockets: 2,
});

// Instância compartilhada do axios com keep-alive HTTP
const sharedAxiosInstance = axios.create({
  baseURL: OLLAMA_BASE_URL,
  httpAgent,
  httpsAgent,
  headers: {
    'Connection': 'keep-alive',
    'Content-Type': 'application/json',
  },
  timeout: 60000,
});

async function measureRequestTime(
  axiosInstance: AxiosInstance | typeof axios,
  endpoint: string,
  body: any,
  testName: string
): Promise<number> {
  const startTime = Date.now();
  
  try {
    if (axiosInstance === axios) {
      await axiosInstance.post(`${OLLAMA_BASE_URL}${endpoint}`, body, {
        httpAgent,
        httpsAgent,
        headers: {
          'Connection': 'keep-alive',
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      });
    } else {
      await axiosInstance.post(endpoint, body);
    }
    
    const endTime = Date.now();
    return endTime - startTime;
  } catch (error: any) {
    console.error(`❌ Erro em ${testName}:`, error.message);
    throw error;
  }
}

async function runTest(
  testName: string,
  axiosInstance: AxiosInstance | typeof axios,
  useKeepAlive: boolean,
  useSharedInstance: boolean
): Promise<TestResult> {
  console.log(`\n🧪 ${testName}`);
  console.log(`   - Instância compartilhada: ${useSharedInstance}`);
  console.log(`   - Keep-alive no body: ${useKeepAlive}`);
  
  const keepAliveValue = useKeepAlive ? '5m' : undefined;
  const body = {
    model: MODEL,
    prompt: 'Responda apenas: OK',
    stream: false,
    ...(keepAliveValue && { keep_alive: keepAliveValue }),
  };

  // Primeira requisição (pode carregar o modelo)
  console.log('   📡 Primeira requisição (pode carregar modelo)...');
  const firstRequestTime = await measureRequestTime(
    axiosInstance,
    '/api/generate',
    body,
    `${testName} - Primeira`
  );
  console.log(`   ⏱️  Tempo: ${firstRequestTime}ms`);

  // Aguardar um pouco
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Requisições subsequentes (modelo já deveria estar carregado)
  const subsequentTimes: number[] = [];
  const numSubsequentRequests = 5;

  console.log(`   📡 Executando ${numSubsequentRequests} requisições subsequentes...`);
  for (let i = 0; i < numSubsequentRequests; i++) {
    const time = await measureRequestTime(
      axiosInstance,
      '/api/generate',
      body,
      `${testName} - Subsequente ${i + 1}`
    );
    subsequentTimes.push(time);
    console.log(`   ⏱️  Requisição ${i + 1}: ${time}ms`);
    
    // Pequeno intervalo entre requisições
    if (i < numSubsequentRequests - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  const averageSubsequentTime = subsequentTimes.reduce((a, b) => a + b, 0) / subsequentTimes.length;
  const improvement = ((firstRequestTime - averageSubsequentTime) / firstRequestTime) * 100;

  return {
    testName,
    firstRequestTime,
    subsequentRequestTimes: subsequentTimes,
    averageSubsequentTime,
    improvement,
    body,
  };
}

async function testOllamaShow(): Promise<void> {
  console.log('\n📊 Verificando status do modelo via /api/show...');
  try {
    const response = await axios.post(`${OLLAMA_BASE_URL}/api/show`, {
      name: MODEL,
    });
    
    console.log('   ✅ Modelo encontrado');
    if (response.data) {
      console.log(`   📝 Modelfile: ${response.data.modelfile ? 'Presente' : 'Ausente'}`);
      console.log(`   📦 Parâmetros: ${JSON.stringify(response.data.parameters || {})}`);
    }
  } catch (error: any) {
    console.log(`   ⚠️  Erro ao verificar modelo: ${error.message}`);
  }
}

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔬 TESTE DE KEEP-ALIVE E SESSÕES DO OLLAMA');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📍 Base URL: ${OLLAMA_BASE_URL}`);
  console.log(`🤖 Modelo: ${MODEL}\n`);

  // Verificar se o Ollama está disponível
  try {
    await axios.get(`${OLLAMA_BASE_URL}/api/tags`);
    console.log('✅ Ollama está disponível\n');
  } catch (error: any) {
    console.error('❌ Ollama não está disponível:', error.message);
    process.exit(1);
  }

  const results: TestResult[] = [];

  // Teste 1: Axios direto, SEM keep_alive, SEM instância compartilhada
  try {
    const result1 = await runTest(
      'Teste 1: Axios direto, SEM keep_alive',
      axios,
      false,
      false
    );
    results.push(result1);
  } catch (error: any) {
    console.error('❌ Erro no Teste 1:', error.message);
  }

  // Teste 2: Axios direto, COM keep_alive, SEM instância compartilhada
  try {
    const result2 = await runTest(
      'Teste 2: Axios direto, COM keep_alive',
      axios,
      true,
      false
    );
    results.push(result2);
  } catch (error: any) {
    console.error('❌ Erro no Teste 2:', error.message);
  }

  // Teste 3: Instância compartilhada, SEM keep_alive
  try {
    const result3 = await runTest(
      'Teste 3: Instância compartilhada, SEM keep_alive',
      sharedAxiosInstance,
      false,
      true
    );
    results.push(result3);
  } catch (error: any) {
    console.error('❌ Erro no Teste 3:', error.message);
  }

  // Teste 4: Instância compartilhada, COM keep_alive
  try {
    const result4 = await runTest(
      'Teste 4: Instância compartilhada, COM keep_alive',
      sharedAxiosInstance,
      true,
      true
    );
    results.push(result4);
  } catch (error: any) {
    console.error('❌ Erro no Teste 4:', error.message);
  }

  // Verificar status do modelo
  await testOllamaShow();

  // Relatório final
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 RELATÓRIO FINAL');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  results.forEach((result, index) => {
    console.log(`${index + 1}. ${result.testName}`);
    console.log(`   Primeira requisição: ${result.firstRequestTime}ms`);
    console.log(`   Média das subsequentes: ${result.averageSubsequentTime.toFixed(2)}ms`);
    console.log(`   Melhoria: ${result.improvement.toFixed(2)}%`);
    console.log(`   Tempos subsequentes: ${result.subsequentRequestTimes.map(t => `${t}ms`).join(', ')}`);
    
    if (result.improvement < 10) {
      console.log(`   ⚠️  ATENÇÃO: Melhoria baixa! Modelo pode estar sendo recarregado.`);
    } else if (result.improvement > 50) {
      console.log(`   ✅ EXCELENTE: Modelo permanece carregado!`);
    }
    console.log('');
  });

  // Análise
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💡 ANÁLISE E RECOMENDAÇÕES');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (results.length === 0) {
    console.log('❌ Nenhum teste foi executado com sucesso.');
    process.exit(1);
  }

  const bestResult = results.reduce((best, current) => 
    current.improvement > best.improvement ? current : best
  );

  console.log(`✅ Melhor configuração: ${bestResult.testName}`);
  console.log(`   Melhoria: ${bestResult.improvement.toFixed(2)}%\n`);

  if (bestResult.improvement < 20) {
    console.log('⚠️  PROBLEMA IDENTIFICADO:');
    console.log('   O modelo está sendo recarregado a cada requisição.');
    console.log('   Possíveis causas:');
    console.log('   1. O parâmetro keep_alive não está funcionando corretamente');
    console.log('   2. O Ollama está descarregando o modelo por falta de memória');
    console.log('   3. Há múltiplas instâncias do Ollama rodando');
    console.log('   4. O modelo está sendo usado por outro processo');
    console.log('   5. O Ollama pode estar usando um timeout padrão muito curto\n');
  } else {
    console.log('✅ SUCESSO:');
    console.log(`   A configuração "${bestResult.testName}" está funcionando corretamente.`);
    console.log('   O modelo permanece carregado entre requisições.\n');
  }

  console.log('📝 Próximos passos:');
  console.log('   1. Use a melhor configuração identificada no código');
  console.log('   2. Monitore o uso de memória da GPU com: nvidia-smi');
  console.log('   3. Verifique os logs do Ollama para mais detalhes');
  console.log('   4. Considere aumentar o keep_alive se necessário\n');
}

main().catch(error => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});

