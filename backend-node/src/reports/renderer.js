// HTML → PDF com Chromium headless (playwright-core).
// VPS com pouca RAM: UM browser, lançado sob demanda e fechado após alguns
// minutos ocioso; fila com concorrência 1; timeout por geração. A página não
// acessa a rede: tudo (HTML, fontes, imagens) é servido por interceptação a
// partir da memória/disco.
const fs = require('fs');
const path = require('path');

const ORIGIN = 'https://relatorio.tactiplan.local/';
const FONTS_DIR = path.join(__dirname, 'fonts');
const IDLE_MS = Number(process.env.REPORTS_BROWSER_IDLE_MS) || 3 * 60 * 1000;
const TIMEOUT_MS = Number(process.env.REPORTS_TIMEOUT_MS) || 45 * 1000;
const MAX_QUEUE = Number(process.env.REPORTS_MAX_QUEUE) || 6;

let browser = null;
let launching = null;
let idleTimer = null;
let chain = Promise.resolve();
let pending = 0;

function launchOptions() {
  const opts = {
    headless: true,
    // não sequestra os sinais do PM2 (reload manda SIGINT); o browser é
    // encerrado pelo handler de 'exit' do próprio playwright
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
    // poupar RAM: 1 renderer, sem isolamento por site, sem GPU/extensões
    args: [
      '--disable-dev-shm-usage', '--disable-gpu', '--no-zygote', '--disable-extensions', '--mute-audio',
      '--renderer-process-limit=1', '--disable-site-isolation-trials',
      '--js-flags=--max-old-space-size=192',
    ],
  };
  if (process.env.REPORTS_CHROMIUM_PATH) opts.executablePath = process.env.REPORTS_CHROMIUM_PATH;
  return opts;
}

async function getBrowser() {
  if (browser && browser.isConnected()) return browser;
  if (!launching) {
    const { chromium } = require('playwright-core');
    launching = chromium.launch(launchOptions())
      .then((b) => {
        browser = b;
        b.on('disconnected', () => { if (browser === b) browser = null; });
        return b;
      })
      .finally(() => { launching = null; });
  }
  return launching;
}

function scheduleIdleClose() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    if (pending > 0 || !browser) return;
    const b = browser;
    browser = null;
    try { await b.close(); } catch (_) { /* já fechado */ }
  }, IDLE_MS);
  if (idleTimer.unref) idleTimer.unref();
}

const fontCache = new Map();
function fontBuffer(name) {
  if (!/^[a-z0-9-]+\.woff2$/i.test(name)) return null;
  if (!fontCache.has(name)) {
    try { fontCache.set(name, fs.readFileSync(path.join(FONTS_DIR, name))); } catch (_) { fontCache.set(name, null); }
  }
  return fontCache.get(name);
}

function withTimeout(promise, ms, onTimeout) {
  let t;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      t = setTimeout(() => { onTimeout?.(); reject(Object.assign(new Error('Tempo esgotado ao gerar o PDF'), { code: 'REPORT_TIMEOUT' })); }, ms);
    }),
  ]).finally(() => clearTimeout(t));
}

// assets: Map 'img/<id>' → { body: Buffer, contentType }
async function renderJob(html, assets) {
  const b = await getBrowser();
  const context = await b.newContext({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1, javaScriptEnabled: true });
  try {
    const page = await context.newPage();
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (!url.startsWith(ORIGIN)) return route.abort();
      const rel = decodeURIComponent(url.slice(ORIGIN.length).split('?')[0]);
      if (rel === '' || rel === 'index.html') {
        return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
      }
      if (rel.startsWith('fonts/')) {
        const buf = fontBuffer(rel.slice(6));
        return buf ? route.fulfill({ status: 200, contentType: 'font/woff2', body: buf }) : route.abort();
      }
      const a = assets && assets.get(rel);
      if (a) return route.fulfill({ status: 200, contentType: a.contentType, body: a.body });
      return route.abort();
    });
    await page.goto(ORIGIN + 'index.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.__reportReady === true, null, { timeout: TIMEOUT_MS });
    const info = await page.evaluate(() => ({ pages: window.__reportPages, error: window.__reportError || null }));
    if (info.error) throw new Error('Falha na paginação: ' + info.error);
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    return { pdf, pages: info.pages };
  } finally {
    await context.close().catch(() => {});
  }
}

// Enfileira (concorrência 1). Rejeita com code REPORT_BUSY se a fila lotar.
// isStale(): quem pediu já desistiu (fechou a conexão) → o job é descartado
// antes de abrir página no Chromium.
function renderPdf(html, assets, { isStale } = {}) {
  if (pending >= MAX_QUEUE) {
    return Promise.reject(Object.assign(new Error('Gerador de relatórios ocupado. Tente de novo em instantes.'), { code: 'REPORT_BUSY' }));
  }
  pending++;
  clearTimeout(idleTimer);
  const run = chain.then(() => {
    if (isStale && isStale()) {
      throw Object.assign(new Error('Pedido cancelado'), { code: 'REPORT_CANCELED' });
    }
    return withTimeout(renderJob(html, assets), TIMEOUT_MS, () => {
      // travou: derruba o browser para não deixar processo zumbi
      const b = browser;
      browser = null;
      if (b) b.close().catch(() => {});
    });
  });
  chain = run.catch(() => {});
  return run.finally(() => {
    pending--;
    if (pending === 0) scheduleIdleClose();
  });
}

async function closeBrowser() {
  clearTimeout(idleTimer);
  const b = browser;
  browser = null;
  if (b) await b.close().catch(() => {});
}

module.exports = { renderPdf, closeBrowser, fontBuffer, ORIGIN };
