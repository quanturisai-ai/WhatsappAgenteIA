/**
 * Script de teste para investigar diferentes métodos de detecção de conexão WhatsApp
 * Baseado na documentação oficial: https://docs.wwebjs.dev/
 * 
 * Este script NÃO altera o sistema principal - apenas testa abordagens diferentes
 */

import { Client, LocalAuth, WAState } from 'whatsapp-web.js';
import path from 'path';
import fs from 'fs';
import qrcode from 'qrcode-terminal';

const USER_ID = 1;
const SESSION_PATH = process.env.WHATSAPP_SESSION_PATH || './whatsapp_sessions';
const USE_TEST_SESSION = true; // ✅ Usar diretório de teste separado

// ✅ Usar diretório de teste para não interferir na sessão real
const userSessionPath = USE_TEST_SESSION 
  ? path.join(SESSION_PATH, `test_user_${USER_ID}`)
  : path.join(SESSION_PATH, `user_${USER_ID}`);
  
const clientId = USE_TEST_SESSION ? `test_user_${USER_ID}` : `user_${USER_ID}`;
const sessionDir = path.join(userSessionPath, `session-${clientId}`);

console.log('\n' + '='.repeat(80));
console.log('🧪 TESTE DE VALIDAÇÃO - NOVA IMPLEMENTAÇÃO');
console.log('='.repeat(80));
console.log(`📁 Data Path: ${userSessionPath}`);
console.log(`📁 Session Dir: ${sessionDir}`);
console.log(`🆔 Client ID: ${clientId}`);
console.log(`🔧 Modo: ${USE_TEST_SESSION ? 'TESTE (sessão isolada)' : 'PRODUÇÃO (sessão real)'}`);
console.log(`⏰ Início: ${new Date().toLocaleString()}`);
console.log('='.repeat(80) + '\n');

// ✅ CAMINHO CORRETO: session-test_user_1/.wwebjs_auth
const sessionAuthPath = path.join(sessionDir, '.wwebjs_auth');
const sessionAuthSessionPath = path.join(sessionAuthPath, 'session');
const hasExistingSession = fs.existsSync(sessionAuthSessionPath);

console.log(`📋 Verificação de sessão:`);
console.log(`   Diretório user: ${fs.existsSync(userSessionPath) ? '✅' : '❌'} ${userSessionPath}`);
console.log(`   Diretório session: ${fs.existsSync(sessionDir) ? '✅' : '❌'} ${sessionDir}`);
console.log(`   Diretório .wwebjs_auth: ${fs.existsSync(sessionAuthPath) ? '✅' : '❌'} ${sessionAuthPath}`);
console.log(`   Arquivo session: ${hasExistingSession ? '✅' : '❌'} ${sessionAuthSessionPath}`);

if (hasExistingSession) {
  console.log('\n✅ SESSÃO EXISTENTE ENCONTRADA!');
  console.log('   Tentando reconectar sem QR Code...');
  console.log('   TESTANDO: Detecção robusta de reconexão\n');
} else {
  console.log('\n❌ SESSÃO NÃO ENCONTRADA');
  console.log('   Será necessário escanear QR Code para criar nova sessão.');
  console.log('   TESTANDO: Nova conexão + Detecção robusta\n');
}

// Cliente de teste - MESMA configuração otimizada do sistema principal
const client = new Client({
  authStrategy: new LocalAuth({
    clientId: clientId,
    dataPath: userSessionPath,
  }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      // 🚀 Performance - Argumentos otimizados
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-sync',
      '--metrics-recording-only',
      '--mute-audio',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-breakpad',
      '--disable-component-extensions-with-background-pages',
      '--disable-features=TranslateUI',
      '--disable-ipc-flooding-protection',
      '--disable-renderer-backgrounding',
      '--disable-features=RendererCodeIntegrity',
      '--disable-password-manager',
      '--disable-features=PasswordManager',
    ],
    timeout: 60000, // 60s para inicialização e sincronização
  },
  // Configurações extras
  takeoverOnConflict: false,
  restartOnAuthFail: false,
  qrMaxRetries: 5,
});

// Contadores e flags
let qrCount = 0;
let stateChanges: string[] = [];
let loadingScreenUpdates: Array<{percent: any, message: string}> = [];
let isAuthenticated = false;
let isReady = false;
let lastState: WAState | null = null;
let loadingComplete = false; // Flag para indicar que loading_screen chegou a 100%

// Estágios de conexão
let connectionStage: 'disconnected' | 'connected' | 'ready' = 'disconnected';
const startTime = Date.now();

// ============================================================================
// MONITORAMENTO DE TODOS OS EVENTOS
// ============================================================================

// Evento: loading_screen (progresso de carregamento)
client.on('loading_screen', async (percent, message) => {
  loadingScreenUpdates.push({percent, message});
  console.log(`\n📊 [loading_screen] ${percent}% - ${message}`);
  
  if (String(percent) === '100' && !loadingComplete) {
    loadingComplete = true;
    console.log('✅ [loading_screen] Carregamento completo (100%)!');
    console.log('   (Progresso de sincronização continua em background)');
  }
});

// Evento: change_state (mudanças de estado)
client.on('change_state', async (state) => {
  const stateStr = String(state);
  stateChanges.push(stateStr);
  lastState = state as WAState;
  
  console.log(`\n🔄 [change_state] Novo estado: ${stateStr}`);
  console.log(`   Histórico de estados: ${stateChanges.join(' → ')}`);
  
  // Verificar se é estado conectado
  if (stateStr === 'CONNECTED') {
    console.log('✅✅✅ [change_state] ESTADO CONNECTED DETECTADO!');
    console.log('   Aguardando 5s para verificar se evento ready será disparado...');
    
    setTimeout(async () => {
      if (!isReady) {
        console.log('\n⚠️ [ANÁLISE] 5s após CONNECTED, evento ready NÃO foi disparado!');
        console.log('   Tentando métodos alternativos de validação...');
        await testAlternativeMethods();
      }
    }, 5000);
  }
});

// Evento: qr (QR Code gerado)
client.on('qr', (qr) => {
  qrCount++;
  console.log(`\n📱 [qr] QR Code ${qrCount} gerado`);
  console.log(`   Tamanho: ${qr.length} caracteres`);
  console.log(`   Primeiros 50 chars: ${qr.substring(0, 50)}...`);
  
  // Exibir QR Code visualmente no terminal
  console.log('\n' + '='.repeat(60));
  console.log('📱 ESCANEIE O QR CODE ABAIXO COM SEU CELULAR:');
  console.log('='.repeat(60) + '\n');
  qrcode.generate(qr, { small: true });
  console.log('\n' + '='.repeat(60));
  
  if (qrCount > 1) {
    console.log(`   ⚠️ Múltiplos QR Codes gerados (${qrCount})`);
  }
});

// Flag para prevenir múltiplas execuções de waitForConnectionReady
let waitingForReady = false;

// Evento: authenticated (autenticação bem-sucedida)
client.on('authenticated', async () => {
  // ✅ Evitar múltiplas execuções
  if (connectionStage !== 'disconnected' || waitingForReady) {
    console.log('⚠️ [authenticated] Ignorando execução duplicada');
    return;
  }
  
  waitingForReady = true;
  isAuthenticated = true;
  console.log('\n' + '='.repeat(80));
  console.log('✅ AUTENTICAÇÃO BEM-SUCEDIDA!');
  console.log('='.repeat(80));
  console.log('   🎉 QR Code escaneado / Sessão reutilizada');
  console.log('   ⏰ Tempo: ' + Math.round((Date.now() - startTime) / 1000) + 's');
  
  // 🚀 TESTAR: Detecção robusta de conexão (mesma lógica do sistema principal)
  console.log('\n🔍 [TESTE] Iniciando detecção robusta de conexão...');
  console.log('   (Não depende do evento ready)\n');
  
  await waitForConnectionReady();
});

// Evento: ready (cliente pronto) - FALLBACK
client.on('ready', async () => {
  console.log('\n' + '='.repeat(80));
  console.log('🎉 EVENTO READY DISPAROU!');
  console.log('='.repeat(80));
  console.log('   ℹ️ Evento ready é raro em reconexões (mas funciona com fork hotfix)');
  
  if (connectionStage === 'ready') {
    console.log('   ✅ Detecção robusta já completou, ignorando ready...');
    return;
  }
  
  // Marcar como pronto
  connectionStage = 'ready';
  loadingComplete = true;
  
  try {
    const state = await client.getState();
    const info = client.info;
    
    console.log('\n📋 Informações (via ready):');
    console.log(`   Estado: ${state}`);
    console.log(`   WID: ${info?.wid?.user}`);
    console.log(`   Nome: ${info?.pushname}`);
    console.log(`   Tempo total: ${Math.round((Date.now() - startTime) / 1000)}s`);
    
    console.log('\n✅ [TESTE] Evento ready funcionou! (Fork hotfix está OK)');
    
    // Se ready disparou antes da detecção robusta completar
    if (!isReady) {
      await sendTestMessage();
    }
    
  } catch (error: any) {
    console.error(`\n❌ Erro: ${error.message}`);
  }
});

// Evento: auth_failure (falha de autenticação)
client.on('auth_failure', (message) => {
  console.log(`\n❌ [auth_failure] Falha de autenticação: ${message}`);
});

// Evento: disconnected (desconectado)
client.on('disconnected', (reason) => {
  console.log(`\n⚠️ [disconnected] Desconectado. Razão: ${reason}`);
});

// ============================================================================
// DETECÇÃO ROBUSTA DE CONEXÃO (mesma lógica do sistema principal)
// ============================================================================

async function waitForConnectionReady(): Promise<void> {
  console.log('⏳ [Detecção Robusta] Aguardando 5s para estabilização...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Delays com backoff exponencial: 5s, 10s, 15s, 20s, 30s, 45s, 60s
  const delays = [5000, 10000, 15000, 20000, 30000, 45000, 60000];
  
  for (let attempt = 0; attempt < delays.length; attempt++) {
    // Se evento ready já disparou, encerrar
    if (connectionStage === 'ready') {
      console.log('✅ [Detecção Robusta] Evento ready disparou! Encerrando detecção alternativa.');
      return;
    }

    try {
      console.log(`\n🔄 [Detecção Robusta] Tentativa ${attempt + 1}/${delays.length}`);
      
      // 1. Verificar estado
      const state = await client.getState();
      const stateStr = String(state);
      console.log(`   Estado: ${stateStr}`);

      if (stateStr !== 'CONNECTED') {
        console.log(`   ⚠️ Estado não é CONNECTED, aguardando ${delays[attempt]/1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delays[attempt]));
        continue;
      }

      // 2. Verificar client.info
      const info = client.info;
      if (!info) {
        console.log(`   ⚠️ client.info não disponível, aguardando ${delays[attempt]/1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delays[attempt]));
        continue;
      }

      // 3. Testar conexão real com getChats()
      console.log(`   🔍 Testando conexão real com getChats()...`);
      const chats = await client.getChats();
      
      // ✅ SUCESSO! Cliente está realmente pronto
      console.log('\n' + '='.repeat(80));
      console.log('🎉🎉🎉 CLIENTE PRONTO VIA DETECÇÃO ROBUSTA!');
      console.log('='.repeat(80));
      console.log(`✅ Chats carregados: ${chats.length}`);
      console.log(`✅ WID: ${info.wid?.user}`);
      console.log(`✅ Nome: ${info.pushname}`);
      console.log(`✅ Plataforma: ${info.platform}`);
      console.log(`✅ Tempo total: ${Math.round((Date.now() - startTime) / 1000)}s`);
      console.log(`✅ Tentativas necessárias: ${attempt + 1}/${delays.length}`);
      console.log('='.repeat(80));

      connectionStage = 'ready';
      
      // Enviar mensagem de teste
      await sendTestMessage();
      return;

    } catch (error: any) {
      const errorMsg = error.message.substring(0, 100);
      console.log(`   ❌ Falha: ${errorMsg}`);
      
      if (attempt < delays.length - 1) {
        console.log(`   ⏭️ Próxima tentativa em ${delays[attempt]/1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delays[attempt]));
      } else {
        console.log(`\n⚠️ [Detecção Robusta] Todas as ${delays.length} tentativas falharam.`);
        console.log('   Aguardando evento ready como fallback...');
      }
    }
  }
}

// ============================================================================
// ENVIAR MENSAGEM DE TESTE
// ============================================================================

async function sendTestMessage(): Promise<void> {
  console.log('\n' + '='.repeat(80));
  console.log('📤 ENVIANDO MENSAGEM DE TESTE');
  console.log('='.repeat(80));
  
  const testNumber = '5561981935443@c.us';
  const message = `✅ *Validação Nova Implementação*

🚀 Sistema funcionando com detecção robusta!
⏱️ Tempo: ${Math.round((Date.now() - startTime) / 1000)}s
📅 ${new Date().toLocaleString('pt-BR')}`;
  
  console.log(`📱 Para: 5561981935443`);
  console.log(`📝 Enviando...\n`);
  
  try {
    const result = await client.sendMessage(testNumber, message);
    
    console.log('='.repeat(80));
    console.log('✅✅✅ TESTE COMPLETO - SUCESSO!');
    console.log('='.repeat(80));
    console.log(`📨 Mensagem enviada: ${result.id._serialized}`);
    console.log(`⏱️ Tempo total: ${Math.round((Date.now() - startTime) / 1000)}s`);
    console.log('\n💡 Conclusões:');
    console.log('   ✅ Detecção robusta funcionou');
    console.log('   ✅ Sincronização completa');
    console.log('   ✅ Sistema operacional');
    console.log('='.repeat(80));
    
    // Encerrar
    setTimeout(() => {
      console.log('\n🏁 Encerrando...');
      clearInterval(stateCheckInterval);
      process.exit(0);
    }, 3000);
    
  } catch (error: any) {
    console.error('\n❌ ERRO AO ENVIAR: ' + error.message.substring(0, 100));
    
    if (error.message.includes('markedUnread') || error.message.includes('undefined')) {
      console.error('\n⚠️ Chats ainda sincronizando. Aguardando 15s...');
      await new Promise(resolve => setTimeout(resolve, 15000));
      
      try {
        const result = await client.sendMessage(testNumber, message);
        console.log('✅ Sucesso na 2ª tentativa: ' + result.id._serialized);
      } catch (retryError: any) {
        console.error('❌ 2ª tentativa falhou: ' + retryError.message.substring(0, 100));
      }
    }
    
    setTimeout(() => {
      console.log('\n🏁 Encerrando com erro...');
      clearInterval(stateCheckInterval);
      process.exit(1);
    }, 3000);
  }
}


// ============================================================================
// MÉTODOS ALTERNATIVOS DE DETECÇÃO
// ============================================================================

async function testAlternativeMethods() {
  console.log('\n' + '='.repeat(80));
  console.log('🔍 TESTANDO MÉTODOS ALTERNATIVOS DE DETECÇÃO');
  console.log('='.repeat(80));
  
  try {
    // Método 1: client.getState()
    console.log('\n1️⃣ Testando client.getState()...');
    const state = await client.getState();
    console.log(`   Estado retornado: ${state}`);
    console.log(`   É CONNECTED? ${state === WAState.CONNECTED}`);
    
    if (state === WAState.CONNECTED) {
      console.log('   ✅ Estado é CONNECTED!');
      
      // Método 2: Verificar client.info
      console.log('\n2️⃣ Testando client.info...');
      const info = client.info;
      if (info) {
        console.log('   ✅ client.info disponível:');
        console.log(`      WID: ${info.wid?.user}`);
        console.log(`      Nome: ${info.pushname}`);
        console.log(`      Plataforma: ${info.platform}`);
      } else {
        console.log('   ⚠️ client.info é null/undefined');
      }
      
      // Método 3: Tentar obter chats
      console.log('\n3️⃣ Testando client.getChats()...');
      try {
        const chats = await client.getChats();
        console.log(`   ✅ Conseguiu obter chats: ${chats.length} chat(s)`);
      } catch (error: any) {
        console.log(`   ❌ Erro ao obter chats: ${error.message}`);
      }
      
      // Método 4: Verificar pupPage
      console.log('\n4️⃣ Testando client.pupPage...');
      if (client.pupPage) {
        console.log('   ✅ pupPage disponível');
        try {
          const url = client.pupPage.url();
          console.log(`      URL: ${url}`);
        } catch (error: any) {
          console.log(`   ⚠️ Erro ao obter URL: ${error.message}`);
        }
      } else {
        console.log('   ⚠️ pupPage não disponível');
      }
      
      console.log('\n' + '='.repeat(80));
      console.log('📊 RESUMO DOS MÉTODOS ALTERNATIVOS:');
      console.log('='.repeat(80));
      console.log(`✅ getState() = CONNECTED: SIM`);
      console.log(`${info ? '✅' : '❌'} client.info disponível: ${info ? 'SIM' : 'NÃO'}`);
      console.log(`${client.pupPage ? '✅' : '❌'} pupPage disponível: ${client.pupPage ? 'SIM' : 'NÃO'}`);
      
      console.log('\n💡 CONCLUSÃO:');
      if (state === WAState.CONNECTED && !isReady) {
        console.log('⚠️ Estado é CONNECTED mas evento ready NÃO foi disparado!');
        console.log('   Possíveis causas:');
        console.log('   1. Evento ready demora mais que o esperado');
        console.log('   2. Algum listener está bloqueando/ignorando o evento');
        console.log('   3. Evento ready não é disparado em reconexões de sessão');
        console.log('\n💡 SOLUÇÃO PROPOSTA:');
        console.log('   Usar getState() === CONNECTED como critério de validação');
        console.log('   em vez de depender apenas do evento ready');
      }
    } else {
      console.log(`   ⚠️ Estado ainda não é CONNECTED: ${state}`);
    }
    
  } catch (error: any) {
    console.error(`\n❌ Erro nos métodos alternativos: ${error.message}`);
    console.error(`   Stack: ${error.stack}`);
  }
}

// ============================================================================
// MONITORAMENTO PERIÓDICO DE ESTADO
// ============================================================================

let checkCount = 0;
let stateCheckInterval: NodeJS.Timeout;

stateCheckInterval = setInterval(async () => {
  checkCount++;
  
  try {
    const state = await client.getState();
    const stateStr = String(state);
    
    // Só logar se estado mudou
    if (stateStr !== String(lastState)) {
      console.log(`\n🔄 [Verificação #${checkCount}] Estado mudou: ${lastState} → ${stateStr}`);
      lastState = state as WAState;
    }
    
    // Se conectado mas ready não disparou
    if (stateStr === 'CONNECTED' && !isReady) {
      console.log(`\n⚠️ [Verificação #${checkCount}] ALERTA: Estado CONNECTED mas ready=false`);
      console.log('   Tempo desde detecção de CONNECTED...');
    }
    
  } catch (error: any) {
    // Ignorar erros antes da inicialização completa
    if (checkCount > 5) {
      console.log(`\n⚠️ [Verificação #${checkCount}] Erro ao verificar estado: ${error.message}`);
    }
  }
}, 5000); // A cada 5 segundos

// ============================================================================
// TIMEOUT DE SEGURANÇA
// ============================================================================

setTimeout(() => {
  console.log('\n' + '='.repeat(80));
  console.log('⏰ TIMEOUT: 5 minutos decorridos');
  console.log('='.repeat(80));
  
  console.log('\n📊 ESTATÍSTICAS FINAIS:');
  console.log(`   QR Codes gerados: ${qrCount}`);
  console.log(`   Mudanças de estado: ${stateChanges.length} (${stateChanges.join(' → ')})`);
  console.log(`   Updates de loading: ${loadingScreenUpdates.length}`);
  console.log(`   Autenticado: ${isAuthenticated ? 'SIM' : 'NÃO'}`);
  console.log(`   Ready: ${isReady ? 'SIM' : 'NÃO'}`);
  console.log(`   Estado final: ${lastState || 'N/A'}`);
  
  if (isAuthenticated && !isReady) {
    console.log('\n⚠️ PROBLEMA DETECTADO:');
    console.log('   - Evento authenticated disparou ✅');
    console.log('   - Evento ready NÃO disparou ❌');
    console.log('   - Estado: ' + (lastState || 'desconhecido'));
  }
  
  if (lastState === WAState.CONNECTED && !isReady) {
    console.log('\n🔴 FALHA CRÍTICA CONFIRMADA:');
    console.log('   Estado é CONNECTED mas evento ready não disparou!');
    console.log('   Investigar código que pode estar bloqueando o evento.');
  }
  
  clearInterval(stateCheckInterval);
  console.log('\n🏁 Encerrando teste...');
  process.exit(0);
}, 5 * 60 * 1000); // 5 minutos

// ============================================================================
// INICIALIZAÇÃO
// ============================================================================

console.log('🚀 Inicializando cliente WhatsApp...\n');

client.initialize().catch((error) => {
  console.error(`\n❌ Erro durante inicialização: ${error.message}`);
  console.error(`   Stack: ${error.stack}`);
  process.exit(1);
});

// Capturar CTRL+C
process.on('SIGINT', () => {
  console.log('\n\n⚠️ CTRL+C detectado. Encerrando...');
  clearInterval(stateCheckInterval);
  client.destroy().then(() => {
    process.exit(0);
  });
});
