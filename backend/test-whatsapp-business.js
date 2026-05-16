const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

console.log("=".repeat(60));
console.log("TESTE WHATSAPP BUSINESS - WhatsApp Web.js");
console.log("=".repeat(60));
console.log("Este teste é específico para contas WhatsApp Business");
console.log("=".repeat(60));

// Função para fechar processos do Chrome no Windows
function closeChromeProcesses() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve();
      return;
    }
    
    // Verificar se há processos do Chrome rodando
    exec('tasklist /FI "IMAGENAME eq chrome.exe" 2>nul', (error, stdout) => {
      if (!error && stdout && stdout.includes('chrome.exe')) {
        console.log('⚠️  Processos do Chrome encontrados. Fechando...');
        
        // Fechar todos os processos do Chrome
        exec('taskkill /F /IM chrome.exe 2>nul', (killError) => {
          if (killError) {
            console.log('⚠️  Alguns processos do Chrome podem ainda estar rodando');
          } else {
            console.log('✅ Processos do Chrome fechados');
          }
          
          // Aguardar um pouco para garantir que os processos foram fechados
          setTimeout(() => resolve(), 3000);
        });
      } else {
        resolve();
      }
    });
  });
}

// Limpar sessão anterior se existir (para teste limpo)
async function cleanupSession(testSessionPath) {
  if (fs.existsSync(testSessionPath)) {
    console.log('\n⚠️  Sessão anterior encontrada. Limpando...');
    
    // Fechar processos do Chrome primeiro
    await closeChromeProcesses();
    
    // Tentar deletar com retry em caso de EBUSY
    let retries = 5;
    while (retries > 0) {
      try {
        fs.rmSync(testSessionPath, { recursive: true, force: true });
        console.log('✅ Sessão anterior deletada');
        break;
      } catch (error) {
        retries--;
        if (error.code === 'EBUSY' && retries > 0) {
          console.log(`⚠️  Arquivos em uso (EBUSY), aguardando e tentando novamente... (${retries} tentativas restantes)`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        } else {
          console.warn('⚠️  Não foi possível deletar sessão anterior:', error.message);
          console.warn('   Tente deletar manualmente a pasta: test_business_session');
          console.warn('   Ou feche todos os processos do Chrome e tente novamente');
          break;
        }
      }
    }
  }
}

// Função principal assíncrona
async function main() {
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

  // Limpar sessão anterior
  const testSessionPath = path.join(__dirname, 'test_business_session');
  await cleanupSession(testSessionPath);

  console.log("\n⚠️  INSTRUÇÕES IMPORTANTES PARA WHATSAPP BUSINESS:");
  console.log("   1. Abra o WhatsApp Business no seu celular");
  console.log("   2. Vá em Configurações > Aparelhos conectados");
  console.log("   3. Desconecte TODAS as sessões WhatsApp Web ativas");
  console.log("   4. Aguarde alguns segundos antes de escanear o QR code");
  console.log("   5. Certifique-se de que o WhatsApp Business está atualizado");
  console.log("=".repeat(60));

  // Configuração do Puppeteer otimizada para WhatsApp Business
  const puppeteerConfig = {
    headless: true, // Headless é mais estável
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      // '--single-process', // Descomente se tiver problemas de inicialização no Windows
      '--disable-gpu'
    ],
  };

  if (chromeExec) {
    puppeteerConfig.executablePath = chromeExec;
    console.log(`📦 Usando: Google Chrome`);
  } else {
    console.log(`📦 Usando: Chromium (Puppeteer)`);
  }

  // Criar cliente com estratégia de autenticação local
  // A pasta 'test_business_session' será criada para guardar os dados da sessão
  const client = new Client({
    authStrategy: new LocalAuth({
      dataPath: testSessionPath
    }),
    puppeteer: puppeteerConfig,
  });

  // 1. Evento disparado para gerar o QR Code
  client.on('qr', (qr) => {
    console.log("\n" + "=".repeat(60));
    console.log("📱 QR CODE RECEBIDO - ESCANEIE COM SEU WHATSAPP BUSINESS");
    console.log("=".repeat(60));
    console.log("⚠️  IMPORTANTE:");
    console.log("   1. Abra o WhatsApp Business no seu celular");
    console.log("   2. Vá em Configurações > Aparelhos conectados");
    console.log("   3. Desconecte TODAS as sessões WhatsApp Web ativas");
    console.log("   4. Escaneie este QR code");
    console.log("=".repeat(60));
    // Gera o QR Code diretamente no terminal
    qrcode.generate(qr, { small: true });
    console.log("\nQR Code String:", qr);
    console.log("=".repeat(60));
    console.log("⏳ Aguardando escaneamento...");
  });

  // Evento de tela de carregamento
  client.on('loading_screen', (percent, message) => {
    console.log(`\n📱 Carregando: ${percent}% - ${message}`);
  });

  // 2. Evento disparado quando a autenticação é bem-sucedida
  client.on('authenticated', () => {
    console.log('\n✅ Autenticado com sucesso!');
    console.log('⏳ Aguardando sincronização completa...');
  });

  // 3. Evento disparado quando o cliente está pronto para uso
  client.on('ready', () => {
    console.log('\n' + "=".repeat(60));
    console.log('🚀 CLIENTE PRONTO! O bot está online.');
    console.log("=".repeat(60));
    
    // Verificar informações da conta
    client.getState().then(state => {
      console.log(`📊 Estado da conexão: ${state}`);
    }).catch(err => {
      console.warn(`⚠️  Não foi possível verificar o estado: ${err.message}`);
    });

    // Obter informações do número conectado
    client.info.then(info => {
      console.log(`📱 Número conectado: ${info.wid.user}`);
      console.log(`📱 Nome: ${info.pushname || 'Não disponível'}`);
      console.log(`📱 Plataforma: ${info.platform || 'Não disponível'}`);
      
      // Verificar se é conta Business
      if (info.businessProfile) {
        console.log(`✅ Conta Business detectada!`);
        console.log(`   Nome do negócio: ${info.businessProfile.businessName || 'Não configurado'}`);
      } else {
        console.log(`ℹ️  Informações de Business não disponíveis (pode ser conta Business sem perfil configurado)`);
      }
    }).catch(err => {
      console.warn(`⚠️  Não foi possível obter informações da conta: ${err.message}`);
    });

    console.log('\n💡 TESTE DE ENVIO DE MENSAGEM:');
    console.log('   Para testar o envio de mensagem, descomente e configure');
    console.log('   o código abaixo com um número válido.');
    console.log('='.repeat(60));

    // --- CONFIGURE A MENSAGEM DE TESTE ---
    // IMPORTANTE: Substitua '55119XXXXXXXX' pelo seu número pessoal para o teste.
    // O formato é: [código do país][DDD][número]@c.us
    // DESCOMENTE AS LINHAS ABAIXO PARA TESTAR O ENVIO:
    /*
    const numeroDestino = '55119XXXXXXXX@c.us';
    const mensagem = 'Olá! Esta é uma mensagem de teste automatizada do seu bot com a conta Business. 🤖';

    client.sendMessage(numeroDestino, mensagem).then(response => {
      if (response.id.fromMe) {
        console.log('🎉 Mensagem de teste enviada com sucesso!');
        console.log(`   ID da mensagem: ${response.id._serialized}`);
      }
    }).catch(err => {
      console.error('❌ Erro ao enviar mensagem:', err);
      console.error('   Verifique se o número de destino está correto e se você tem uma conversa recente com ele.');
    });
    */

    console.log('\n✅ WhatsApp Business conectado e pronto!');
    console.log('Pressione Ctrl+C para sair');
  });

  // Evento para lidar com falhas na autenticação
  client.on('auth_failure', msg => {
    console.error('\n❌ FALHA NA AUTENTICAÇÃO:', msg);
    console.error('Isso pode acontecer se:');
    console.error('   1. A sessão for revogada no celular');
    console.error('   2. Múltiplas conexões simultâneas foram detectadas');
    console.error('   3. O QR code expirou antes de ser escaneado');
    console.error('\n💡 SOLUÇÃO:');
    console.error('   - Delete a pasta test_business_session e tente novamente');
    console.error('   - Desconecte todas as sessões WhatsApp Web no celular');
    console.error('   - Certifique-se de que o WhatsApp Business está atualizado');
  });

  // Evento para lidar com a desconexão
  client.on('disconnected', (reason) => {
    console.log('\n🔌 Cliente foi desconectado:', reason);
    
    if (reason === 'LOGOUT') {
      console.log('\n⚠️  LOGOUT detectado - isso pode indicar:');
      console.log('   1. WhatsApp detectou múltiplas conexões');
      console.log('   2. Sessão foi desconectada no celular');
      console.log('   3. Problema com arquivos de sessão');
      console.log('   4. WhatsApp Business pode ter restrições adicionais');
      console.log('\n💡 Tente:');
      console.log('   - Desconectar todas as sessões WhatsApp Web no celular');
      console.log('   - Deletar a pasta test_business_session e tentar novamente');
      console.log('   - Verificar se há outras instâncias do bot rodando');
    } else if (reason === 'NAVIGATION') {
      console.log('\n⚠️  NAVIGATION - Navegação interrompida');
      console.log('   Isso pode indicar problemas de conexão ou mudanças no WhatsApp Web');
    } else if (reason === 'CONFLICT') {
      console.log('\n⚠️  CONFLICT - Conflito de sessão detectado');
      console.log('   Outra sessão pode estar ativa');
    }
  });

  // Evento de mudança de estado
  client.on('change_state', (state) => {
    console.log(`\n🔄 Estado mudou: ${state}`);
    
    if (state === 'PAIRING') {
      console.log('   Aguardando pareamento (QR code)...');
    } else if (state === 'UNPAIRED') {
      console.log('   Não pareado - QR code necessário');
    } else if (state === 'UNPAIRED_IDLE') {
      console.log('   Aguardando pareamento (idle)...');
    } else if (state === 'CONNECTED') {
      console.log('   ✅ Conectado!');
    } else if (state === 'TIMEOUT') {
      console.log('   ⏱️  Timeout - reconectando...');
    } else if (state === 'CONFLICT') {
      console.log('   ⚠️  Conflito detectado - outra sessão pode estar ativa');
    } else if (state === 'UNLAUNCHED') {
      console.log('   ⚠️  Não iniciado');
    } else if (state === 'PROXYBLOCK') {
      console.log('   ⚠️  Proxy bloqueado');
    } else if (state === 'TOS_BLOCK') {
      console.log('   ⚠️  Bloqueado por Termos de Serviço');
    } else if (state === 'SMB_TOS_BLOCK') {
      console.log('   ⚠️  Bloqueado por Termos de Serviço (SMB)');
    } else if (state === 'DEPRECATED_VERSION') {
      console.log('   ⚠️  Versão deprecada');
    }
  });

  // Evento de erro
  client.on('error', (error) => {
    console.error('\n❌ Erro no cliente:', error.message);
    console.error('Stack:', error.stack);
  });

  // Inicia o cliente
  console.log("\n🚀 Inicializando cliente WhatsApp Business...\n");
  try {
    await client.initialize();
  } catch (err) {
    console.error("\n❌ Erro fatal ao inicializar o cliente:", err.message);
    console.error("Stack:", err.stack);
    
    if (err.message.includes('Failed to launch') || err.message.includes('browser process')) {
      console.error('\n💡 SOLUÇÃO:');
      console.error('   - Instale o Google Chrome ou execute: npm install puppeteer --save');
      console.error('   - Verifique se o Chromium foi baixado corretamente pelo Puppeteer');
      console.error('   - Feche todos os processos do Chrome e tente novamente');
    }
    
    process.exit(1);
  }

  // Tratamento de erros não capturados
  process.on('unhandledRejection', (reason, promise) => {
    if (reason && reason.message && reason.message.includes('EBUSY')) {
      console.warn('\n⚠️  Erro EBUSY (arquivo em uso) - normal no Windows durante logout');
      console.warn('   Isso não afeta a funcionalidade');
    } else {
      console.error('\n❌ Unhandled Rejection:', reason);
    }
  });

  // Tratamento de sinal de interrupção (Ctrl+C)
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Encerrando...');
    try {
      if (client) {
        await client.destroy();
        console.log('✅ Cliente destruído com sucesso');
      }
    } catch (error) {
      console.error('❌ Erro ao destruir cliente:', error.message);
    }
    process.exit(0);
  });
}

// Executar função principal
main().catch(error => {
  console.error('\n❌ Erro fatal:', error);
  process.exit(1);
});
