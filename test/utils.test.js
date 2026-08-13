'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const { test } = require('node:test');
const assert = require('node:assert');

global.window = global;
global.localStorage = (() => {
  const store = {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
})();
global.document = {
  getElementById: () => null,
  addEventListener: () => {},
  querySelector: () => null,
  querySelectorAll: () => [],
};

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'utils.js'), 'utf8');
vm.runInThisContext(src);

test('escapeHtml escapa caracteres HTML', () => {
  assert.strictEqual(escapeHtml('<b>&"\'</b>'), '&lt;b&gt;&amp;&quot;&#039;&lt;/b&gt;');
  assert.strictEqual(escapeHtml(null), '');
  assert.strictEqual(escapeHtml(undefined), '');
});

test('normalize remove acentos e converte para minúsculas', () => {
  assert.strictEqual(normalize('São José'), 'sao jose');
  assert.strictEqual(normalize(''), '');
});

test('hasCoords valida coordenadas', () => {
  assert.ok(hasCoords({ lat: -22.4, lng: -48.5 }));
  assert.ok(!hasCoords({ lat: null, lng: -48.5 }));
  assert.ok(!hasCoords({ lat: -22.4, lng: undefined }));
  assert.ok(!hasCoords({ lat: 'x', lng: 1 }));
});

test('formatDistance converte km para metros/quilômetros', () => {
  assert.strictEqual(formatDistance(0.3), '300m');
  assert.strictEqual(formatDistance(1.2), '1,2km');
});

test('formatMinutes formata tempos', () => {
  assert.strictEqual(formatMinutes(0, '06:00'), 'Agora');
  assert.strictEqual(formatMinutes(1, '06:00'), 'Agora');
  assert.strictEqual(formatMinutes(30, '06:00'), '30 min');
  assert.strictEqual(formatMinutes(90, '06:00'), '1h 30min');
  assert.strictEqual(formatMinutes(120, '06:00'), '2h');
  assert.strictEqual(formatMinutes(1500, '06:00'), 'Amanhã 06:00');
});

test('distanceKm calcula distância entre dois pontos', () => {
  const d = distanceKm(-22.4946, -48.5588, -22.4865561, -48.5484917);
  assert.ok(d > 1 && d < 2, 'distância esperada ~1.3km, veio ' + d);
});

test('getHorario retorna horário do dia pedido', () => {
  const h = { uteis: ['06:00'], sabado: [], domingo: [] };
  assert.deepStrictEqual(getHorario(h, 'uteis'), ['06:00']);
  assert.deepStrictEqual(getHorario(h, 'domingo'), []);
  assert.deepStrictEqual(getHorario(null, 'uteis'), []);
  assert.deepStrictEqual(getHorario(['06:00'], 'uteis'), ['06:00']);
});

test('getNextDeparture retorna uma próxima saída válida', () => {
  const h = { uteis: ['06:00', '12:00'], sabado: [], domingo: [] };
  const next = getNextDeparture(h);
  assert.strictEqual(typeof next.time, 'string');
  assert.strictEqual(typeof next.minutes, 'number');
  assert.strictEqual(typeof next.label, 'string');
});

test('getNextDeparture no domingo informa que não opera', () => {
  const h = { uteis: ['06:00'], sabado: [], domingo: [] };
  const next = getNextDeparture(h);
  if (next.label === 'Não opera aos domingos') {
    assert.strictEqual(next.time, '--');
  }
});

test('pontosComDistancia calcula distância apenas com GPS', () => {
  const p = [
    { id: 1, lat: -22.4, lng: -48.5 },
    { id: 2, lat: null, lng: null },
  ];
  const com = pontosComDistancia(p, { lat: -22.49, lng: -48.55 });
  assert.strictEqual(typeof com[0].distancia, 'number');
  assert.strictEqual(com[1].distancia, undefined);
});

test('sortPointsByContext ordena por ordem ou distância', () => {
  const a = { id: 1, ordem: 2, distancia: 5 };
  const b = { id: 2, ordem: 1, distancia: 2 };
  assert.strictEqual(sortPointsByContext([a, b], 'ordem')[0].id, 2);
  assert.strictEqual(sortPointsByContext([a, b], 'distancia')[0].id, 2);
});

test('hexToRgba converte hex em rgba', () => {
  assert.strictEqual(hexToRgba('#ff0000', 0.5), 'rgba(255, 0, 0, 0.5)');
  assert.strictEqual(hexToRgba('abc', 1), 'rgba(170, 187, 204, 1)');
});

test('createDistanceCache calcula e invalida com nova posição', () => {
  const pontos = [{ id: 1, nome: 'A', lat: -22.4, lng: -48.5 }];
  let pos = { lat: -22.49, lng: -48.55 };
  const cache = createDistanceCache(() => pontos, () => pos);
  const all = cache.getAll();
  assert.strictEqual(all.length, 1);
  assert.strictEqual(typeof all[0].distancia, 'number');
  const single = cache.forSingle(pontos[0]);
  assert.strictEqual(typeof single.distancia, 'number');
  pos = { lat: -22.48, lng: -48.5 };
  cache.invalidate();
  const all2 = cache.getAll();
  assert.notStrictEqual(all2[0].distancia, all[0].distancia);
});
