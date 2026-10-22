'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Pine = require('../pine.js');

const screener = fs.readFileSync(path.join(__dirname, '..', 'catalog', 'nova-screener.pine'), 'utf8');
let seed = 17;
const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const candles = Array.from({length: 160}, (_, i) => {
  const open = 68000 + i * 3 + Math.sin(i / 7) * 80;
  const close = open + (random() - .5) * 100;
  return {t: Date.UTC(2026, 0, 1) + i * 3600000, o: open, h: Math.max(open, close) + 35, l: Math.min(open, close) - 35, c: close, v: 80 + random() * 40};
});

test('Nova Screener ejecuta su tabla de 40 símbolos y entradas móviles en Pine', () => {
  const result = Pine.run(screener, candles, {
    symbol: 'BTCUSDT', interval: '1h', inputs: {0: true}, timeLimitMs: 20000
  });

  assert.ok(result.ok, JSON.stringify(result.error));
  assert.equal(result.complete, true, JSON.stringify(result.warnings));
  assert.equal(result.inputs.length, 44, 'modo, posición, 40 símbolos y 2 filtros');
  assert.equal(result.inputs[0].value, true, 'Modo Móvil debe aceptar la configuración guardada');
  assert.equal(result.tables.length, 1, 'el Screener debe producir una tabla');
  assert.equal(result.tables[0].cols, 4);
  assert.equal(result.tables[0].rows, 21);
  assert.equal(result.tables[0].cells.length, 84, 'cabecera y 20 filas de cuatro celdas');
  assert.equal(result.tables[0].cells.find(cell => cell.c === 0 && cell.r === 0).text, '💠 SÍMBOLO');
  assert.equal(result.tables[0].cells.find(cell => cell.c === 1 && cell.r === 0).text, '⚡ SEÑAL');
  assert.ok(!result.warnings.some(w => w.level === 'unsupported'), JSON.stringify(result.warnings));
});
