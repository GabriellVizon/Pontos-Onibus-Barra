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

const utilsSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'utils.js'), 'utf8');
vm.runInThisContext(utilsSrc);

const horariosSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'horarios.js'), 'utf8');
vm.runInThisContext(horariosSrc);

function stamped(horas, minutos) {
  return new Date(2026, 0, 5, horas, minutos);
}

/* ==========================================
   Calibração: âncoras da Rota B
   ========================================== */

test('obterTemposRota B posiciona Igreja/Orestes/Papa João nas âncoras calibradas', () => {
  const build = obterTemposRota('B', false);

  function cumPara(pontoId) {
    const i = build.sequencia.indexOf(pontoId);
    assert.notStrictEqual(i, -1, 'ponto ' + pontoId + ' deve existir na rota B');
    return build.cum[i];
  }

  const idx36 = build.sequencia.indexOf(36);
  assert.strictEqual(idx36, 13);
  assert.strictEqual(idx36 + 1, build.sequencia.indexOf(37));
  assert.strictEqual(idx36 + 2, build.sequencia.indexOf(38));

  assert.strictEqual(cumPara(36), 25); // Igreja      17:40 a partir de 17:15
  assert.strictEqual(cumPara(37), 28); // Orestes     17:43
  assert.strictEqual(cumPara(38), 31); // Papa João   17:46
});

test('obterTemposRota A não usa âncoras da rota B', () => {
  const build = obterTemposRota('A', false);
  const i = build.sequencia.indexOf(36);
  assert.strictEqual(i, 3);
  // Sem âncoras para A, os trechos usam o baseTempoPorPonto da config.
  assert.ok(build.cum[i] > 0);
  assert.ok(build.cum[i] < build.cum.length * 5);
});

test('rota A com inicioEspecial acrescenta o prefixo na primeira saída', () => {
  const normal = obterTemposRota('A', false);
  const especial = obterTemposRota('A', true);
  assert.strictEqual(especial.sequencia.length, normal.sequencia.length + 2);
  assert.strictEqual(especial.sequencia[0], 13);
  assert.strictEqual(especial.sequencia[1], 12);
});

/* ==========================================
   Saídas por dia
   ========================================== */

test('obterSaidasDoDiaCircular lista saídas dos dias certos', () => {
  assert.deepStrictEqual(obterSaidasDoDiaCircular('domingo'), []);
  const sabado = obterSaidasDoDiaCircular('sabado');
  assert.ok(sabado.indexOf('15:15') !== -1);
  assert.ok(sabado.indexOf('06:15') !== -1);
  assert.ok(sabado.indexOf('12:00') === -1);
  const uteis = obterSaidasDoDiaCircular('uteis');
  assert.ok(uteis.indexOf('12:00') !== -1);
});

test('diasComHorariosCircular não inclui domingo', () => {
  const dias = diasComHorariosCircular();
  assert.ok(dias.some((d) => d.id === 'uteis'));
  assert.ok(!dias.some((d) => d.id === 'domingo'));
});

/* ==========================================
   Janela de incerteza
   ========================================== */

test('janelaPassagem usa ±3 por padrão', () => {
  const j = janelaPassagem();
  assert.strictEqual(j.antes, 3);
  assert.strictEqual(j.depois, 3);
});

/* ==========================================
   Encontrar passagens (estado honesto)
   ========================================== */

test('encontrarPassagens retorna aguardando com horário e faixa', () => {
  const r = encontrarPassagens(36, stamped(17, 12), 'sabado');
  assert.strictEqual(r.encontrado, true);
  assert.strictEqual(r.horario, '17:40');
  assert.strictEqual(r.situacao, 'aguardando');
  assert.strictEqual(r.estado, 'proximo');
  assert.strictEqual(r.minutosRestantes, 28);
  assert.ok(r.label.indexOf('28') === 0);
  assert.ok(r.faixa.label.indexOf('17:3') === 0);
});

test('encontrarPassagens marcado como no ponto dentro da janela', () => {
  const r = encontrarPassagens(36, stamped(17, 39), 'sabado');
  assert.strictEqual(r.encontrado, true);
  assert.strictEqual(r.horario, '17:40');
  assert.strictEqual(r.situacao, 'no_ponto');
  assert.strictEqual(r.label, 'No ponto');
});

test('encontrarPassagens indica encerrado depois do último ônibus', () => {
  const r = encontrarPassagens(36, stamped(17, 50), 'sabado');
  assert.strictEqual(r.encontrado, false);
  assert.strictEqual(r.situacao, 'encerrado');
});

test('encontrarPassagens no domingo informa que não opera', () => {
  const r = encontrarPassagens(36, stamped(8, 0), 'domingo');
  assert.strictEqual(r.encontrado, false);
  assert.strictEqual(r.situacao, 'sem_horario');
  assert.ok(r.mensagem.indexOf('domingo') !== -1);
});

test('obterHorariosDoPonto traz as passagens do sábado ordenadas', () => {
  const horarios = obterHorariosDoPonto(36, 'sabado');
  assert.ok(horarios.indexOf('15:40') !== -1);
  assert.ok(horarios.indexOf('17:40') !== -1);
  for (let i = 1; i < horarios.length; i++) {
    assert.ok(horarioParaMinutos(horarios[i]) > horarioParaMinutos(horarios[i - 1]));
  }
});

test('apresentarProximaCircular agrupa campos para a UI', () => {
  const a = apresentarProximaCircular(36, stamped(17, 12), 'sabado');
  assert.strictEqual(a.time, '17:40');
  assert.ok(a.faixa && a.faixa.label.indexOf('17:3') === 0);
});

/* ==========================================
   Conversão e helpers
   ========================================== */

test('horarioParaMinutos e minutosParaHorario são consistentes', () => {
  assert.strictEqual(horarioParaMinutos('17:40'), 1060);
  assert.strictEqual(minutosParaHorario(1060), '17:40');
  assert.strictEqual(minutosParaHorario(59.6), '01:00');
  assert.strictEqual(minutosParaHorario(60), '01:00');
  assert.strictEqual(minutosParaHorario(23 * 60 + 59.4), '23:59');
});

test('calcularPassagensPlena e obterSentidosPlena funcionam sem dados', () => {
  assert.deepStrictEqual(calcularPassagensPlena(999), []);
  assert.deepStrictEqual(obterSentidosPlena(999), []);
  const r = encontrarProximoPlena(999);
  assert.strictEqual(r.encontrado, false);
  assert.strictEqual(r.estado, 'sem_dados');
});