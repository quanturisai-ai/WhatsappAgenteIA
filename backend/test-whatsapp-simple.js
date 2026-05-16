const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');
const fs = require('fs');

console.log('='.repeat(60));
console.log('TESTE SIMPLES - WhatsApp Web.js');
console.log('='.repeat(60));

// Detectar Google Chrome
const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(process.env.PROGRAMFILES || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
];

let chromeExec = null;
for (const p of CHROME_CANDIDATES) {
  if (fs.existsSync(p)) {
    chromeExec = p;
    break;
  }
}

if (chromeExec) {
  console.log(`✅ Chrome encontrado: ${chromeExec}`);
} else {
  console.log('⚠️  Chrome não encontrado. Usando Chromium do Puppeteer.');
}

// Configuração do Puppeteer
// IMPORTANTE: headless: true é mais estável para WhatsApp Web
const puppeteerConfig = {
  headless: true, // Headless é mais estável
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-setuid-sandbox',
    '--disable-accelerated-2d-canvas',
    '--disable-gpu'
  ]
};

if (chromeExec) {
  puppeteerConfig.executablePath = chromeExec;
  console.log(`📦 Usando: Google Chrome`);
} else {
  console.log(`📦 Usando: Chromium (Puppeteer)`);
}

// Limpar sessão anterior se existir (para teste limpo)
const testSessionPath = path.join(__dirname, 'test_session');
if (fs.existsSync(testSessionPath)) {
  console.log('\n⚠️  Sessão anterior encontrada. Deletando para teste limpo...');
  try {
    fs.rmSync(testSessionPath, { recursive: true, force: true });
    console.log('✅ Sessão anterior deletada');
  } catch (error) {
    console.warn('⚠️  Não foi possível deletar sessão anterior:', error.message);
    console.warn('   Tente deletar manualmente a pasta: test_session');
  }
}

// Criar cliente
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: testSessionPath
  }),
  puppeteer: puppeteerConfig
});

// Eventos
client.on('loading_screen', (percent, message) => {
  console.log(`\n📱 Carregando: ${percent}% - ${message}`);
});

client.on('qr', (qr) => {
  console.log('\n' + '='.repeat(60));
  console.log('📱 QR CODE RECEBIDO - ESCANEIE COM SEU WHATSAPP');
  console.log('='.repeat(60));
  console.log('⚠️  IMPORTANTE:');
  console.log('   1. Abra o WhatsApp no seu celular');
  console.log('   2. Vá em Configurações > Aparelhos conectados');
  console.log('   3. Desconecte TODAS as sessões WhatsApp Web ativas');
  console.log('   4. Escaneie este QR code');
  console.log('='.repeat(60));
  qrcode.generate(qr, { small: true });
  console.log('\nQR Code String:', qr);
  console.log('='.repeat(60));
  console.log('⏳ Aguardando escaneamento...');
});

client.on('authenticated', () => {
  console.log('\n✅ AUTENTICADO - Aguardando sincronização...');
});

client.on('auth_failure', (msg) => {
  console.error('\n❌ FALHA NA AUTENTICAÇÃO:', msg);
});

client.on('ready', () => {
  console.log('\n' + '='.repeat(60));
  console.log('✅ WHATSAPP PRONTO E CONECTADO!');
  console.log('='.repeat(60));
  console.log('Pressione Ctrl+C para sair');
});

client.on('disconnected', (reason) => {
  console.log('\n⚠️  DESCONECTADO:', reason);
  if (reason === 'LOGOUT') {
    console.log('⚠️  LOGOUT detectado - isso pode indicar:');
    console.log('   1. WhatsApp detectou múltiplas conexões');
    console.log('   2. Sessão anterior ainda ativa');
    console.log('   3. Problema com arquivos de sessão');
    console.log('\n💡 Tente:');
    console.log('   - Desconectar todas as sessões WhatsApp Web no seu celular');
    console.log('   - Deletar a pasta test_session e tentar novamente');
  }
});

client.on('change_state', (state) => {
  console.log(`\n🔄 Estado mudou: ${state}`);
});

// Inicializar
console.log('\n🚀 Iniciando cliente WhatsApp...\n');
client.initialize().catch((error) => {
  console.error('\n❌ ERRO ao inicializar:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
});

// Tratamento de erros não capturados
process.on('unhandledRejection', (reason, promise) => {
  if (reason && reason.message && reason.message.includes('EBUSY')) {
    console.warn('\n⚠️  Erro EBUSY (arquivo em uso) - normal no Windows durante logout');
    console.warn('   Isso não afeta a funcionalidade');
  } else {
    console.error('\n❌ Unhandled Rejection:', reason);
  }
});

process.on('SIGINT', async () => {
  console.log('\n\n🛑 Encerrando...');
  try {
    await client.destroy();
  } catch (error) {
    console.error('Erro ao destruir cliente:', error.message);
  }
  process.exit(0);
});

