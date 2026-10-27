// Idioma das palavras da sala: quem cria escolhe, todos jogam com as mesmas palavras.
const test = require('node:test');
const assert = require('node:assert/strict');
const Util = require('../js/Util.js');
const Game = require('../js/Game.js');
const WordBank = require('../js/WordBank.js');
const { criarGerenciador } = require('../server/Salas.js');
const { criarServidor } = require('../server/index.js');
const { io: conectar } = require('socket.io-client');

function gerenciador() {
  return criarGerenciador({ criarJogo: (opcoes) => Game.criar(Object.assign({ rng: Util.rngComSemente(7) }, opcoes)) });
}

function palavrasDaGrade(sala) {
  const v = sala.jogo.visao();
  return v.colunas.concat(v.linhas);
}

function doBaralho(id, palavras) {
  const baralho = WordBank.obter(id).palavras;
  return palavras.every((p) => baralho.includes(p));
}

test('sala nova usa o idioma de quem cria; sem idioma ou inválido, português', () => {
  const g = gerenciador();
  assert.equal(g.criarSala('t1', 'Ana', 'en').sala.idioma, 'en');
  assert.equal(g.criarSala('t2', 'Bia', 'es').sala.idioma, 'es');
  assert.equal(g.criarSala('t3', 'Caio').sala.idioma, 'pt');
  assert.equal(g.criarSala('t4', 'Duda', 'fr').sala.idioma, 'pt');
});

for (const [idioma, id] of [['pt', 'classico'], ['en', 'classico-en'], ['es', 'classico-es']]) {
  test('partida da sala em ' + idioma + ' sorteia do baralho ' + id + ', também na nova partida', () => {
    const g = gerenciador();
    const { sala } = g.criarSala('tA', 'Ana', idioma);
    g.entrar(sala.codigo, 'tB', 'Bia');
    assert.ok(g.iniciar(sala.codigo, 'tA').ok);
    assert.ok(doBaralho(id, palavrasDaGrade(sala)));
    assert.ok(g.iniciar(sala.codigo, 'tA').ok);
    assert.ok(doBaralho(id, palavrasDaGrade(sala)));
  });
}

test('só o anfitrião troca o idioma das palavras, e só antes da primeira partida', () => {
  const g = gerenciador();
  const { sala } = g.criarSala('tA', 'Ana', 'pt');
  g.entrar(sala.codigo, 'tB', 'Bia');
  assert.equal(g.definirIdioma(sala.codigo, 'tB', 'en').chave, 'servidor.soAnfitriaoIdioma');
  assert.equal(g.definirIdioma(sala.codigo, 'tA', 'fr').chave, 'servidor.idiomaInvalido');
  assert.equal(g.definirIdioma(sala.codigo, 'tA', null).chave, 'servidor.idiomaInvalido');
  assert.ok(g.definirIdioma(sala.codigo, 'tA', 'es').ok);
  assert.equal(g.visaoPara(sala, 'tB').sala.idioma, 'es');
  g.iniciar(sala.codigo, 'tA');
  assert.ok(doBaralho('classico-es', palavrasDaGrade(sala)));
  assert.equal(g.definirIdioma(sala.codigo, 'tA', 'en').chave, 'servidor.idiomaDepois');
  assert.equal(sala.idioma, 'es');
});

test('pelo socket: criar com idioma, trocar na espera e todos recebem as mesmas palavras', async (t) => {
  const srv = criarServidor();
  await new Promise((ok) => srv.servidorHttp.listen(0, ok));
  const url = 'http://localhost:' + srv.servidorHttp.address().port;
  const cliente = () => {
    const s = conectar(url, { transports: ['websocket'], forceNew: true });
    s.pedir = (evento, dados) => new Promise((ok) => s.emit(evento, dados, ok));
    s.esperar = (cond) => new Promise((ok) => {
      const f = (e) => { if (cond(e)) { s.off('estado', f); ok(e); } };
      s.on('estado', f);
    });
    return s;
  };
  const a = cliente(), b = cliente();
  t.after(() => { a.close(); b.close(); srv.io.close(); });

  const criado = await a.pedir('criar', { nome: 'Ana', token: 'tokA', idioma: 'en' });
  assert.ok(criado.ok);
  const entrouB = b.esperar((e) => e.sala.idioma === 'en');
  assert.ok((await b.pedir('entrar', { codigo: criado.codigo, nome: 'Bia', token: 'tokB' })).ok);
  await entrouB;

  const negado = await b.pedir('sala:idioma', { idioma: 'es' });
  assert.equal(negado.ok, false);
  assert.equal(negado.chave, 'servidor.soAnfitriaoIdioma');

  const trocou = b.esperar((e) => e.sala.idioma === 'es');
  assert.ok((await a.pedir('sala:idioma', { idioma: 'es' })).ok);
  await trocou;

  const jogoA = a.esperar((e) => e.jogo);
  const jogoB = b.esperar((e) => e.jogo);
  assert.ok((await a.pedir('iniciar')).ok);
  const [ea, eb] = await Promise.all([jogoA, jogoB]);
  assert.deepEqual(ea.jogo.colunas, eb.jogo.colunas);
  assert.deepEqual(ea.jogo.linhas, eb.jogo.linhas);
  assert.ok(doBaralho('classico-es', ea.jogo.colunas.concat(ea.jogo.linhas)));
  assert.equal((await a.pedir('sala:idioma', { idioma: 'pt' })).chave, 'servidor.idiomaDepois');
});
