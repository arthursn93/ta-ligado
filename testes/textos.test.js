// Testes do arquivo de textos (etapa C). Rodar com: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Textos = require('../js/Textos.js');
const TextosPt = require('../js/TextosPt.js');

const RAIZ = path.join(__dirname, '..');
const ARQUIVOS = ['js', 'server'].flatMap((pasta) => fs.readdirSync(path.join(RAIZ, pasta))
  .filter((nome) => nome.endsWith('.js') && nome !== 'TextosPt.js')
  .map((nome) => path.join(pasta, nome)));
const GRUPOS = [...new Set(Object.keys(TextosPt).map((chave) => chave.split('.')[0]))];
// Qualquer texto entre aspas no formato "grupo.nome" com um grupo do arquivo de textos é uma chave.
const PADRAO = new RegExp("'((?:" + GRUPOS.join('|') + ")\\.[A-Za-z0-9]+)'", 'g');

function chavesUsadas() {
  const usadas = new Map();
  for (const arquivo of ARQUIVOS) {
    const codigo = fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');
    for (const [, chave] of codigo.matchAll(PADRAO)) usadas.set(chave, arquivo);
  }
  return usadas;
}

test('toda chave usada no código existe no arquivo de português', () => {
  const faltando = [...chavesUsadas()].filter(([chave]) => !(chave in TextosPt)).map(([chave, arquivo]) => arquivo + ': ' + chave);
  assert.deepEqual(faltando, []);
});

test('todo texto do arquivo de português é usado em algum lugar', () => {
  const usadas = chavesUsadas();
  assert.deepEqual(Object.keys(TextosPt).filter((chave) => !usadas.has(chave)), []);
});

test('t() troca os valores e devolve a própria chave quando ela não existe', () => {
  assert.equal(Textos.t('lobby.criar'), 'Criar uma sala nova');
  assert.equal(Textos.t('lobby.esperando', { nome: 'Ana' }), 'Esperando Ana começar a partida…');
  assert.equal(Textos.t('jogo.placarCarta', { rodada: 3, total: 25 }), 'Carta <b>3</b>/25');
  assert.equal(Textos.t('lobby.esperando', {}), 'Esperando {nome} começar a partida…');
  assert.equal(Textos.t('nao.existe'), 'nao.existe');
  // Um "$" no valor (nome de jogador) entra como está.
  assert.equal(Textos.t('lobby.esperando', { nome: '$& $1' }), 'Esperando $& $1 começar a partida…');
});

test('o servidor e as regras usam o mesmo arquivo de textos', () => {
  const Game = require('../js/Game.js');
  const jogo = Game.criar({ rng: () => 0.5 });
  assert.equal(jogo.executar({ tipo: 'DAR_PISTA', pista: '' }).erro, TextosPt['pista.vazia']);
  const { criarGerenciador } = require('../server/Salas.js');
  assert.equal(criarGerenciador().entrar('ZZZZ', 'token', 'Bia').erro, TextosPt['servidor.salaNaoEncontradaCodigo']);
});

test('a página carrega os textos antes de qualquer script que os usa', () => {
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const ordem = [...html.matchAll(/<script src="js\/(\w+)\.js">/g)].map((m) => m[1]);
  assert.deepEqual(ordem.slice(0, 2), ['TextosPt', 'Textos']);
});
