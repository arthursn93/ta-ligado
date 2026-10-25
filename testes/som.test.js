// Testes dos efeitos sonoros (sem navegador: o áudio é simulado). Rodar com: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Som = require('../js/Som.js');

function janelaFalsa(guardado) {
  const notas = [];
  function AudioContext() {
    this.state = 'suspended';
    this.currentTime = 0;
    this.destination = {};
  }
  AudioContext.prototype.resume = function () { this.state = 'running'; };
  AudioContext.prototype.createOscillator = function () {
    const osc = { frequency: { setValueAtTime: (f) => { osc.f = f; } }, connect() {}, start() { notas.push(osc.f); }, stop() {} };
    return osc;
  };
  AudioContext.prototype.createGain = function () {
    return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} };
  };
  const dados = Object.assign({}, guardado);
  return {
    notas,
    AudioContext,
    localStorage: { getItem: (k) => (k in dados ? dados[k] : null), setItem: (k, v) => { dados[k] = v; } },
    dados
  };
}

test('não toca antes do primeiro toque na tela; depois toca', () => {
  const janela = janelaFalsa();
  const som = Som.criar({ janela });
  assert.equal(som.tocar('acerto'), false);
  assert.equal(janela.notas.length, 0);
  som.liberar();
  assert.equal(som.tocar('acerto'), true);
  assert.deepEqual(janela.notas, [523, 659, 784]);
});

test('começa ligado; desligar fica guardado no aparelho e silencia', () => {
  const janela = janelaFalsa();
  const som = Som.criar({ janela });
  som.liberar();
  assert.equal(som.ligado(), true);
  assert.equal(som.alternar(), false);
  assert.equal(janela.dados['taligado.som'], 'desligado');
  assert.equal(som.tocar('pista'), false);
  assert.equal(janela.notas.length, 0);
  // Na próxima visita continua desligado.
  assert.equal(Som.criar({ janela: janelaFalsa(janela.dados) }).ligado(), false);
});

test('sem áudio no navegador, sem armazenamento ou com erro, nada quebra', () => {
  const semAudio = Som.criar({ janela: {} });
  semAudio.liberar();
  assert.equal(semAudio.tocar('acerto'), false);
  assert.doesNotThrow(() => semAudio.alternar());

  const janela = janelaFalsa();
  janela.AudioContext.prototype.createOscillator = () => { throw new Error('sem áudio'); };
  const comErro = Som.criar({ janela });
  comErro.liberar();
  assert.equal(comErro.tocar('acerto'), false);
  assert.equal(comErro.tocar('nao-existe'), false);
});

test('todo som chamado pelo jogo existe, e os sons são curtos', () => {
  const codigo = ['UI.js', 'Lobby.js'].map((f) => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8')).join('\n');
  const chamados = new Set([...codigo.matchAll(/som\('([a-zA-Z]+)'\)|tocar\('([a-zA-Z]+)'\)/g)].map((m) => m[1] || m[2]));
  for (const m of codigo.matchAll(/som\(([^)']+) \? '([a-zA-Z]+)' : '([a-zA-Z]+)'\)/g)) { chamados.add(m[2]); chamados.add(m[3]); }
  assert.deepEqual([...chamados].sort(), Object.keys(Som.SONS).sort());
  for (const [nome, notas] of Object.entries(Som.SONS)) {
    const fim = Math.max(...notas.map((n) => n[1] + n[2]));
    assert.ok(fim <= 0.8, nome + ' dura ' + fim + ' s');
  }
});

test('botão de som mostra o estado para leitores de tela', () => {
  assert.match(Som.botao(true), /aria-pressed="true"[^>]*title="Desligar o som"/);
  assert.match(Som.botao(false), /aria-pressed="false"[^>]*title="Ligar o som"/);
});
