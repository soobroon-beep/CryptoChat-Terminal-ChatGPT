/* Comprueba que Nova Nexus se añade desde el catálogo, se dibuja en móvil y sus parámetros se guardan. */
'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright-core');

const root = path.resolve(__dirname, '..', '..');
const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css'};
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.join(root, pathname === '/' ? 'index.html' : pathname);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, {'content-type': mime[path.extname(file)] || 'text/plain'});
    res.end(data);
  });
});

let seed = 19;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
let price = 68000;
const start = Date.UTC(2026, 6, 1);
const klines = Array.from({length: 600}, (_, i) => {
  const open = price, close = open + Math.sin(i / 11) * 30 + (rnd() - .5) * 90;
  const high = Math.max(open, close) + rnd() * 45;
  const low = Math.min(open, close) - rnd() * 45;
  price = close;
  return [start + i * 3600000, String(open), String(high), String(low), String(close), String(60 + rnd() * 120), 0, '0', 0, '0', '0', '0'];
});
const tickers = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT'].map((symbol, i) => ({symbol, lastPrice: String(price / (i + 1)), priceChangePercent: String(i - 2)}));

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox']});
  const context = await browser.newContext({viewport: {width: 420, height: 860}, deviceScaleFactor: 1});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.includes('api.binance.com') && url.includes('/klines')) return route.fulfill({json: klines, headers: {'access-control-allow-origin': '*'}});
    if (url.includes('api.binance.com')) return route.fulfill({json: tickers, headers: {'access-control-allow-origin': '*'}});
    if (url.startsWith('http://127.0.0.1:')) return route.continue();
    return route.abort();
  });

  try {
    await page.goto('http://127.0.0.1:' + server.address().port + '/');
    await page.click('[data-view="chartView"]');
    await page.waitForFunction(() => document.querySelector('#priceCanvas')?.width > 0, null, {timeout: 15000});
    await page.click('[data-panel="indicators"]');
    await page.locator('[data-indtab="mine"]:visible').click();
    await page.locator('[data-cat-add="nova-nexus"]').click();
    await page.waitForFunction(() => {
      const card = [...document.querySelectorAll('.nova-card')].find(x => x.querySelector('b')?.textContent.trim() === 'Nova Nexus');
      return card && card.querySelector('[data-pine-set="cat:nova-nexus"]') && !/Calculando/.test(card.innerText);
    }, null, {timeout: 30000});
    const cardText = await page.locator('.nova-card').filter({hasText: 'Nova Nexus'}).innerText();
    assert.doesNotMatch(cardText, /Error|no se pudo interpretar/i, cardText);

    await page.click('#closeSheet');
    await page.waitForFunction(() => !!document.querySelector('#legendBox button[data-id="cat:nova-nexus"][data-do="set"]'), null, {timeout: 15000});
    await page.click('#indicatorCount');
    await page.locator('[data-indtab="mine"]:visible').click();
    await page.locator('.nova-card [data-pine-set="cat:nova-nexus"]').click();
    const dialog = page.locator('[role="dialog"][aria-label="Configuración"]');
    await dialog.waitFor({state: 'visible', timeout: 10000});
    assert.ok(await dialog.locator('input[data-k]').count() > 0, 'Nova Nexus debe mostrar entradas configurables');
    const value = Number(await dialog.locator('input[type="number"][data-k]').first().inputValue());
    await dialog.locator('input[type="number"][data-k]').first().fill(String(value + 1));
    await dialog.locator('[data-act="ok"]').click();
    await page.waitForFunction(() => Object.keys(localStorage).some(key => {
      try { const s = JSON.parse(localStorage.getItem(key)); const p = (s.pine || []).find(x => x.sid === 'cat:nova-nexus'); return p && Object.keys(p.inputs || {}).length > 0; } catch { return false; }
    }), null, {timeout: 5000});
    assert.deepEqual(errors, [], 'la interfaz no debe producir excepciones: ' + errors.join(' | '));
    console.log('Nova Nexus móvil: añadido al gráfico, leyenda visible, configuración editable y parámetro guardado.');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
