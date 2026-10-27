/**
 * TEMPORÁRIO — Screenshot do dashboard (Fase 5) usando o utilitário Puppeteer já existente
 * no projeto (mesmo usado pelo whatsapp-web.js), para verificação visual real no navegador.
 *
 * Gera um JWT válido (mesmo padrão de scripts/temp-test-lid-fix.ts) e injeta no localStorage
 * do navegador para pular a tela de login — não modifica nenhum dado, só autentica a sessão
 * do navegador local para inspeção visual.
 *
 * Uso: npx ts-node --transpile-only scripts/temp-screenshot-kanban.ts
 */
import dotenv from 'dotenv';
dotenv.config();
import jwt from 'jsonwebtoken';
import { launchBrowser } from '../src/utils/puppeteer.util';
import path from 'path';

const FRONTEND_URL = 'http://localhost:3300';
const OUT_DIR = 'C:\\Users\\Barbara\\AppData\\Local\\Temp\\claude\\c--WhatsappAgenteIA\\b1a22623-69a4-491c-b4e5-f678a656fdfe\\scratchpad';
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';

async function main() {
  const token = jwt.sign({ userId: 1 }, JWT_SECRET, { expiresIn: '1h' });
  const user = { id: 1, username: 'teste', email: 'teste@local', createdAt: new Date().toISOString() };

  const browser = await launchBrowser({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    page.on('console', (msg) => console.log(`[browser:${msg.type()}]`, msg.text()));
    page.on('pageerror', (err) => console.log('[pageerror]', err.message));

    console.log('1) Abrindo tela de login...');
    await page.goto(`${FRONTEND_URL}/login`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 800));
    await page.screenshot({ path: path.join(OUT_DIR, 'fase5-01-login.png') as any });
    console.log('   ✅ fase5-01-login.png');

    console.log('2) Injetando sessão autenticada (JWT do usuário 1) no localStorage...');
    await page.evaluate(
      (t: string, u: string) => {
        localStorage.setItem('token', t);
        localStorage.setItem('user', u);
      },
      token,
      JSON.stringify(user)
    );

    console.log('3) Navegando para /dashboard...');
    await page.goto(`${FRONTEND_URL}/dashboard`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 2000));
    const diag = await page.evaluate(() => {
      const grid = document.querySelector('.grid') as HTMLElement | null;
      if (!grid) return { found: false };
      const style = window.getComputedStyle(grid);
      const children = Array.from(grid.children) as HTMLElement[];
      return {
        found: true,
        gridTemplateColumns: style.gridTemplateColumns,
        childCount: children.length,
        childTitles: children.map((c) => c.querySelector('h3')?.textContent || '(sem h3)'),
      };
    });
    console.log('DIAG grid:', JSON.stringify(diag, null, 2));

    await page.screenshot({ path: path.join(OUT_DIR, 'fase5-02-dashboard.png') as any });

    // A 5ª coluna (Finalizadas) quebrou para uma 2ª linha do grid (comportamento normal do
    // CSS Grid com poucas colunas cabendo na largura) — rolar até ela para capturar.
    const finalizadasEl = await page.evaluateHandle(() => {
      const headers = Array.from(document.querySelectorAll('h3'));
      const h = headers.find((el) => el.textContent?.includes('Finalizadas'));
      return h ? h.closest('.bg-gray-50') : null;
    });
    if (finalizadasEl) {
      await (finalizadasEl as any).asElement()?.scrollIntoView();
      await new Promise((r) => setTimeout(r, 500));
      await page.screenshot({ path: path.join(OUT_DIR, 'fase5-03-finalizadas.png') as any });
      console.log('   ✅ fase5-03-finalizadas.png');
    }

    console.log('   ✅ fase5-02-dashboard.png');

    // Verificar se há erros visíveis no console do navegador
    const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500));
    console.log('   Trecho do body:', bodyText.replace(/\n+/g, ' | ').substring(0, 300));

    await browser.close();
    console.log('\nConcluído.');
  } catch (err) {
    console.error('Erro:', err);
    await browser.close();
    process.exit(1);
  }
}

main();
