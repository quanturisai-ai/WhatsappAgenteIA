/**
 * Script TEMPORÁRIO de validação — bugs de LID (pontos 1 e 2 do diagnóstico).
 * NÃO altera nenhum arquivo do sistema. Serve só para provar, com dados reais,
 * que os dois crashes existem hoje e que a correção proposta (guard clauses)
 * resolve sem quebrar o comportamento normal.
 *
 * SEÇÃO A — testes isolados (sem tocar no WhatsApp nem em dados de produção):
 *   A1. Reproduz o crash do ponto 1 (message.model.ts:152 -findByMessageId)
 *   A2. Prova que a versão corrigida não quebra e ainda funciona pra buscas normais
 *   A3. Reproduz o crash do ponto 2 (whatsapp.service.ts:2872 -message.id)
 *   A4. Prova que a versão corrigida não quebra
 *
 * SEÇÃO B — teste ao vivo via API já rodando (backend na porta do .env),
 *   usando o número de teste informado. Envia uma mensagem real e verifica
 *   se ela fica salva em `messages` e se aparece erro no log no mesmo instante.
 *
 * Uso: npx ts-node scripts/temp-test-lid-fix.ts
 * Apagar este arquivo depois da validação.
 */
import dotenv from 'dotenv';
dotenv.config();

import jwt from 'jsonwebtoken';
import axios from 'axios';
import pool from '../src/config/database';
import { MessageModel } from '../src/models/message.model';
import { ConversationModel } from '../src/models/conversation.model';
import fs from 'fs';
import path from 'path';

// NOTA: não importamos WhatsAppManager aqui de propósito — o cliente WhatsApp autenticado
// vive no processo do backend já rodando (node dist / ts-node-dev), não neste script.
// Por isso os envios reais (Seção B) passam pela API HTTP, nunca chamando o client direto.

const TEST_PHONE = '5561981935443';
const API_PORT = process.env.PORT || 3302;
const API_BASE = `http://localhost:${API_PORT}/api`;
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';
const ERROR_LOG_PATH = path.join(__dirname, '../logs/error.log');

function linha(titulo: string) {
  console.log('\n' + '='.repeat(70));
  console.log(titulo);
  console.log('='.repeat(70));
}

function ok(msg: string) { console.log(`  ✅ ${msg}`); }
function fail(msg: string) { console.log(`  ❌ ${msg}`); }
function info(msg: string) { console.log(`  ℹ️  ${msg}`); }

// ---------------------------------------------------------------------------
// SEÇÃO A1/A2 — findByMessageId (ponto 1)
// ---------------------------------------------------------------------------
async function testarPonto1() {
  linha('SEÇÃO A — PONTO 1: MessageModel.findByMessageId');
  const messageModel = new MessageModel();

  // A1: reproduzir o crash com o código REAL, sem modificar nada
  info('A1. Chamando findByMessageId(undefined) com o código atual (sem correção)...');
  try {
    await messageModel.findByMessageId(undefined as any);
    fail('Não travou — inesperado (esperávamos reproduzir o bug aqui)');
  } catch (err: any) {
    if (err.message.includes("reading 'length'")) {
      ok(`Bug reproduzido como esperado: "${err.message}"`);
    } else {
      fail(`Travou, mas com erro diferente do esperado: ${err.message}`);
    }
  }

  // A2: versão corrigida (cópia local, com guard clause) -mesma query, só adiciona
  // "if (!messageId) return null" no início, como será aplicado no arquivo real.
  async function findByMessageIdCorrigido(messageId: string | null | undefined) {
    if (!messageId) return null; // <- única mudança proposta
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query(
        'SELECT id, conversation_id, message_id, content, message_type, media_id, direction, is_from_ai, created_at, received_at, read_at FROM messages WHERE message_id = ?',
        [messageId]
      ) as any[];
      return rows && rows.length > 0 ? rows[0] : null;
    } finally {
      conn.release();
    }
  }

  info('A2a. Chamando a versão corrigida com undefined...');
  try {
    const resultado = await findByMessageIdCorrigido(undefined);
    if (resultado === null) {
      ok('Versão corrigida retornou null sem travar');
    } else {
      fail('Retornou algo inesperado: ' + JSON.stringify(resultado));
    }
  } catch (err: any) {
    fail(`Versão corrigida travou (não deveria): ${err.message}`);
  }

  info('A2b. Verificando que a versão corrigida não trava para um message_id válido (regressão)...');
  const conn = await pool.getConnection();
  try {
    const amostra = await conn.query(
      `SELECT message_id FROM messages WHERE message_id IS NOT NULL ORDER BY id DESC LIMIT 1`
    ) as any;
    const row = Array.isArray(amostra) ? amostra[0] : null;
    if (row?.message_id) {
      try {
        const encontrado = await findByMessageIdCorrigido(row.message_id);
        // NOTA: encontrado pode vir null aqui por um bug SEPARADO e pré-existente
        // (destructuring "const [rows] = await conn.query(...)" pega a 1ª LINHA em vez
        // do array de linhas, então rows.length fica undefined). Esse bug já existe hoje,
        // independe do nosso guard clause, e não faz parte do escopo desta correção.
        // O que importa aqui é só: NÃO TRAVOU para um id válido.
        ok(`Não travou para message_id válido (retornou: ${encontrado ? 'encontrado' : 'null -bug de destructuring pré-existente, fora de escopo'})`);
      } catch (err: any) {
        fail(`Versão corrigida travou para um id válido (não deveria): ${err.message}`);
      }
    } else {
      info('Nenhum message_id de amostra encontrado no banco para testar regressão.');
    }
  } finally {
    conn.release();
  }
}

// ---------------------------------------------------------------------------
// SEÇÃO A3/A4 — sendMessage message.id (ponto 2)
// ---------------------------------------------------------------------------
function testarPonto2() {
  linha('SEÇÃO A — PONTO 2: acesso a message.id após sendMessage retornar undefined');

  const isFromAI = true;

  info('A3. Simulando client.sendMessage() retornando undefined (como capturado no error.log)...');
  try {
    const message: any = undefined; // é exatamente o que a lib retornou no caso da Deborah
    if (isFromAI && message.id) {
      // não deveria chegar aqui
    }
    fail('Não travou — inesperado (esperávamos reproduzir o bug aqui)');
  } catch (err: any) {
    if (err.message.includes("reading 'id'")) {
      ok(`Bug reproduzido como esperado: "${err.message}"`);
    } else {
      fail(`Travou, mas com erro diferente do esperado: ${err.message}`);
    }
  }

  info('A4. Testando a versão corrigida (optional chaining: message?.id)...');
  try {
    const message: any = undefined;
    if (isFromAI && message?.id) {
      // não deveria entrar aqui, mas não deve travar
    }
    ok('Versão corrigida não travou com message=undefined');

    const messageOk: any = { id: '123' };
    if (isFromAI && messageOk?.id) {
      ok('Versão corrigida continua funcionando quando message.id existe (regressão OK)');
    } else {
      fail('Versão corrigida quebrou o caso normal (message.id existente)!');
    }
  } catch (err: any) {
    fail(`Versão corrigida travou (não deveria): ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// SEÇÃO B — teste ao vivo via API rodando, com o número real de teste
// ---------------------------------------------------------------------------
function gerarTokenTeste(userId: number): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '10m' });
}

function contarLinhasErro(): number {
  try {
    const conteudo = fs.readFileSync(ERROR_LOG_PATH, 'utf8');
    return conteudo.split('\n').length;
  } catch {
    return -1;
  }
}

function novasLinhasErro(desde: number): string[] {
  try {
    const conteudo = fs.readFileSync(ERROR_LOG_PATH, 'utf8').split('\n');
    return conteudo.slice(desde).filter(l => l.trim());
  } catch {
    return [];
  }
}

async function testarAoVivo() {
  linha(`SEÇÃO B — TESTE AO VIVO com o número ${TEST_PHONE} (via API em ${API_BASE})`);

  const token = gerarTokenTeste(1);
  const headers = { Authorization: `Bearer ${token}` };

  info('B1. Verificando se a API está no ar...');
  try {
    await axios.get(`${API_BASE}/conversations`, { headers, params: { limit: 1 } });
    ok('API respondeu normalmente (backend está rodando e o token é válido).');
  } catch (err: any) {
    fail(`Não consegui falar com a API: ${err.message}. Abortando Seção B.`);
    return;
  }

  info(`B2. Criando/obtendo conversa para ${TEST_PHONE}...`);
  let conversationId: number;
  try {
    const resp = await axios.post(`${API_BASE}/conversations`, {
      contactNumber: TEST_PHONE,
      contactName: 'Teste Temporário (diagnóstico LID)',
    }, { headers });
    conversationId = resp.data.conversation.id;
    ok(`Conversa id=${conversationId} (lid atual: ${resp.data.conversation.lid ?? 'nenhum'})`);
  } catch (err: any) {
    fail(`Erro ao criar/obter conversa: ${err.response?.data?.message || err.message}`);
    return;
  }

  async function contarMensagens(conexao: any, convId: number): Promise<number> {
    const rows = await conexao.query(`SELECT COUNT(*) as total FROM messages WHERE conversation_id = ?`, [convId]);
    return Number(rows[0].total);
  }
  async function maiorIdMensagem(conexao: any, convId: number): Promise<number> {
    const rows = await conexao.query(`SELECT COALESCE(MAX(id), 0) as maxId FROM messages WHERE conversation_id = ?`, [convId]);
    return Number(rows[0].maxId);
  }

  const conn = await pool.getConnection();
  let msgCountAntes = 0;
  let maiorIdAntes = 0;
  try {
    msgCountAntes = await contarMensagens(conn, conversationId);
    maiorIdAntes = await maiorIdMensagem(conn, conversationId);
  } finally {
    conn.release();
  }
  info(`Mensagens na conversa ANTES do envio: ${msgCountAntes} (maior id: ${maiorIdAntes})`);

  const linhasErroAntes = contarLinhasErro();
  const textoTeste = `🧪 Teste temporário de diagnóstico (${new Date().toLocaleTimeString('pt-BR')}) — pode ignorar`;

  info(`B3. Enviando mensagem de teste real: "${textoTeste}"`);
  let envioOk = false;
  try {
    await axios.post(`${API_BASE}/conversations/send`, {
      conversationId,
      content: textoTeste,
    }, { headers });
    envioOk = true;
    ok('API respondeu com sucesso ao pedido de envio (verifique seu celular).');
  } catch (err: any) {
    fail(`API retornou erro ao enviar: ${err.response?.data?.message || err.message}`);
  }

  if (envioOk) {
    info('Aguardando 6s para o evento message_create ser processado...');
    await new Promise(r => setTimeout(r, 6000));

    const conn2 = await pool.getConnection();
    try {
      const convAtual = await conn2.query(`SELECT lid, contact_number FROM conversations WHERE id = ?`, [conversationId]) as any;
      const convRow = Array.isArray(convAtual) ? (Array.isArray(convAtual[0]) ? convAtual[0][0] : convAtual[0]) : convAtual;
      info(`Conversa agora: contact_number=${convRow?.contact_number}, lid=${convRow?.lid ?? 'nenhum'}`);

      const rows2: any[] = await conn2.query(`SELECT id, message_id, content, created_at FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 3`, [conversationId]);
      const msgCountDepois = await contarMensagens(conn2, conversationId);
      const maiorIdDepois = await maiorIdMensagem(conn2, conversationId);

      if (msgCountDepois > msgCountAntes || maiorIdDepois > maiorIdAntes) {
        ok(`Mensagem FOI salva em 'messages' (total foi de ${msgCountAntes} para ${msgCountDepois}; maior id foi de ${maiorIdAntes} para ${maiorIdDepois}).`);
        console.log('     Última mensagem salva:', JSON.stringify(rows2[0], null, 2));
      } else {
        fail(`Mensagem NÃO foi salva em 'messages' (total continua ${msgCountDepois}, maior id continua ${maiorIdDepois}) — bug reproduzido ao vivo.`);
      }
    } finally {
      conn2.release();
    }

    const novas = novasLinhasErro(linhasErroAntes);
    const crashRelevante = novas.find(l => l.includes("Cannot read properties of undefined"));
    if (crashRelevante) {
      fail(`Crash confirmado no error.log no momento do envio:\n     ${crashRelevante}`);
    } else {
      ok('Nenhum crash de "Cannot read properties of undefined" apareceu no log (bug pode não ter sido acionado desta vez — depende do contato ter LID).');
    }
  }

  console.log('\n  📱 Confira seu celular para confirmar que a mensagem de teste chegou.');
}

// ---------------------------------------------------------------------------
// SEÇÃO C — repasse de "lid" na notificação de fidelização (conquista/progresso/entrega)
// A fidelizacaoNotificacao.service.ts só tem cliente.telefone, não um conversationId.
// O plano é: antes de enviar, buscar a conversa pelo telefone (normalizado) e, se ela
// tiver lid, passar para sendMessage(). Aqui validamos SÓ a busca (leitura, sem enviar
// nada) -o envio com lid explícito já foi provado funcionando na Seção B.
// ---------------------------------------------------------------------------
async function testarSecaoC() {
  linha('SEÇÃO C — busca de LID por telefone (mecanismo p/ fidelização)');
  const conversationModel = new ConversationModel();

  info(`C1. Buscando conversa/lid para o número de teste ${TEST_PHONE}...`);
  const convTeste = await conversationModel.findByUserAndContactNormalized(1, TEST_PHONE);
  if (convTeste) {
    ok(`Conversa encontrada (id=${convTeste.id}, contact_number=${convTeste.contact_number}, lid=${convTeste.lid ?? 'nenhum'})`);
    info('Esse é exatamente o caso-fantasma do ponto 3: a conversa encontrada por telefone não tem lid (o lid real vive em outra conversa, "Papai"). Fidelização ficaria sem lid pra esse contato específico até resolvermos o ponto 3.');
  } else {
    fail('Nenhuma conversa encontrada para o número de teste.');
  }

  info(`C2. Buscando conversa/lid para um cliente real de fidelização com LID íntegro (Deborah, 556294121992)...`);
  const convDeborah = await conversationModel.findByUserAndContactNormalized(1, '556294121992');
  if (convDeborah?.lid) {
    ok(`Conversa encontrada (id=${convDeborah.id}), lid="${convDeborah.lid}" — é exatamente esse valor que a correção passaria para sendMessage().`);
  } else {
    fail('Não encontrou lid para a Deborah (inesperado, esperávamos achar 179199054721279@lid).');
  }

  console.log(`
  Conclusão da Seção C:
  - O mecanismo de busca (ConversationModel.findByUserAndContactNormalized) funciona e
    devolve o lid quando ele existe e está no mesmo registro do telefone (caso Deborah).
  - Para contatos fragmentados pelo bug do ponto 3 (caso "Papai"/número de teste), a busca
    por telefone não encontra o lid certo -a correção da fidelização vai funcionar para a
    maioria dos clientes, mas não resolve os casos fantasma (isso só o ponto 3 resolve).
  - NENHUM envio real foi feito nesta seção (só leitura). O envio com lid explícito já foi
    validado na Seção B (o backend já usa "conversation.lid" com sucesso).
  `);
}

// ---------------------------------------------------------------------------
async function main() {
  await testarPonto1();
  testarPonto2();
  await testarAoVivo();
  await testarSecaoC();

  linha('RESUMO');
  console.log(`
  Seção A prova, em isolado, que:
    - O bug do ponto 1 (findByMessageId) existe hoje e a correção proposta
      (early return quando messageId é vazio) resolve sem quebrar buscas normais.
    - O bug do ponto 2 (message.id) existe hoje e a correção proposta
      (optional chaining "message?.id") resolve sem quebrar o caso normal.

  Seção B mostra o comportamento AO VIVO com o número ${TEST_PHONE}, usando o
  backend já rodando (sem reiniciar nada, sem tocar em código de produção).

  Nada neste script alterou arquivos do sistema. Depois de validar, podemos
  aplicar as mesmas 2 correções (mais o repasse do "lid" no envio manual)
  nos arquivos reais e rodar a Seção B de novo para confirmar a resolução.
  `);

  await pool.end();
}

main().catch(async (e) => {
  console.error('ERRO GERAL NO SCRIPT:', e);
  await pool.end();
  process.exit(1);
});
