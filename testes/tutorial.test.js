// Testes do tutorial "Como jogar" (etapa D). Rodar com: npm test
// A parte de tela (os 4 passos) foi conferida no navegador; aqui fica a regra de quando abrir sozinho.
const test = require('node:test');
const assert = require('node:assert/strict');
const Tutorial = require('../js/Tutorial.js');
const TextosPt = require('../js/TextosPt.js');

function janela(busca, guardado) {
  const dados = Object.assign({}, guardado);
  return {
    dados,
    location: { search: busca || '' },
    localStorage: { getItem: (k) => (k in dados ? dados[k] : null), setItem: (k, v) => { dados[k] = String(v); } }
  };
}

test('abre sozinho na primeira visita e não abre mais depois de visto', () => {
  const j = janela('');
  assert.equal(Tutorial.deveAbrir(j), true);
  Tutorial.marcarVisto(j);
  assert.equal(j.dados[Tutorial.CHAVE], 'visto');
  assert.equal(Tutorial.deveAbrir(j), false);
});

test('quem chega por convite não é interrompido pelo tutorial', () => {
  assert.equal(Tutorial.deveAbrir(janela('?sala=ABCD')), false);
  assert.equal(Tutorial.deveAbrir(janela('?x=1&sala=ABCD')), false);
  assert.equal(Tutorial.deveAbrir(janela('?aviso=sala-encerrada')), true);
});

test('sem armazenamento no aparelho, não abre sozinho e não quebra', () => {
  const quebrado = { location: { search: '' }, get localStorage() { throw new Error('bloqueado'); } };
  assert.equal(Tutorial.deveAbrir(quebrado), false);
  assert.doesNotThrow(() => Tutorial.marcarVisto(quebrado));
});

for (const arquivo of ['TextosPt', 'TextosEn', 'TextosEs']) {
  test('as pistas do exemplo seguem as regras do jogo (' + arquivo + ')', () => {
    const Game = require('../js/Game.js');
    const tabela = require('../js/' + arquivo + '.js');
    const grade = ['colunaA', 'colunaB', 'colunaC', 'linha1', 'linha2', 'linha3'].map((k) => tabela['tutorial.' + k]);
    // A pista boa é uma palavra só, só com letras e fora da grade de exemplo.
    for (const chave of ['tutorial.pistaBoa', 'tutorial.pistaTurma']) {
      assert.match(tabela[chave], /^\p{L}+$/u);
      assert.ok(!grade.includes(tabela[chave]), chave + ' não pode ser palavra da grade');
    }
    // A pista "de mais de uma palavra" é mesmo recusada pelo jogo.
    const jogo = Game.criar({ rng: () => 0.5 });
    assert.equal(jogo.executar({ tipo: 'DAR_PISTA', pista: tabela['tutorial.pistaDuas'] }).chave, 'pista.umaPalavra');
  });
}
