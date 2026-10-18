// Testes das salas (sem rede). Rodar com: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const Util = require('../js/Util.js');
const Game = require('../js/Game.js');
const { criarGerenciador, MAX_JOGADORES } = require('../server/Salas.js');

function gerenciador() {
  return criarGerenciador({ criarJogo: () => Game.criar({ rng: Util.rngComSemente(7) }) });
}

function pista(n) {
  return String.fromCharCode(97 + (n % 26)) + 'zqxw';
}

function salaComTres() {
  const g = gerenciador();
  const { sala } = g.criarSala('tA', 'Ana');
  g.entrar(sala.codigo, 'tB', 'Bia');
  g.entrar(sala.codigo, 'tC', 'Caio');
  return { g, sala, codigo: sala.codigo };
}

function tokenDoDador(sala) {
  return sala.jogadores.find((j) => j.id === sala.dadorId).token;
}

test('cria sala com código de 4 letras e quem criou é o anfitrião', () => {
  const g = gerenciador();
  const r = g.criarSala('tA', '  Ana  ');
  assert.ok(r.ok);
  assert.match(r.sala.codigo, /^[A-HJ-NP-Z]{4}$/);
  assert.equal(r.sala.jogadores[0].nome, 'Ana');
  assert.equal(r.sala.anfitriaoId, r.sala.jogadores[0].id);
  assert.equal(g.criarSala('tB', '   ').ok, false);
});

test('entrar: código errado, nome repetido, sala cheia e código em minúsculas', () => {
  const g = gerenciador();
  const { sala } = g.criarSala('t0', 'Ana');
  assert.equal(g.entrar('ZZZZ', 'x', 'Bia').erro, 'Sala não encontrada. Confira o código.');
  assert.equal(g.entrar(sala.codigo, 'x', 'ana').ok, false);
  assert.ok(g.entrar(sala.codigo.toLowerCase(), 'x', 'Bia').ok);
  for (let i = 2; i < MAX_JOGADORES; i++) assert.ok(g.entrar(sala.codigo, 't' + i, 'J' + i).ok);
  assert.equal(g.entrar(sala.codigo, 'extra', 'Extra').erro, 'A sala está cheia.');
});

test('voltar com o mesmo token ocupa o mesmo lugar', () => {
  const { g, sala, codigo } = salaComTres();
  const id = sala.jogadores[1].id;
  g.desconectar(codigo, 'tB');
  assert.equal(sala.jogadores[1].online, false);
  assert.ok(g.entrar(codigo, 'tB', 'outro nome').ok);
  assert.equal(sala.jogadores.length, 3);
  assert.equal(sala.jogadores[1].id, id);
  assert.equal(sala.jogadores[1].online, true);
});

test('só o anfitrião começa, e precisa de pelo menos 2 pessoas', () => {
  const g = gerenciador();
  const { sala } = g.criarSala('tA', 'Ana');
  assert.equal(g.iniciar(sala.codigo, 'tA').ok, false);
  g.entrar(sala.codigo, 'tB', 'Bia');
  assert.equal(g.iniciar(sala.codigo, 'tB').ok, false);
  assert.ok(g.iniciar(sala.codigo, 'tA').ok);
  assert.ok(sala.dadorId);
});

test('só o dador vê a coordenada secreta', () => {
  const { g, sala, codigo } = salaComTres();
  g.iniciar(codigo, 'tA');
  for (const t of ['tA', 'tB', 'tC']) {
    const v = g.visaoPara(sala, t);
    const souDador = t === tokenDoDador(sala);
    assert.equal(v.sala.dadorId, sala.dadorId);
    assert.equal(!!v.jogo.coordenadaSecreta, souDador, t);
    assert.equal(!!v.jogo.palavrasSecretas, souDador, t);
    assert.equal(JSON.stringify(v).includes('"token"'), false, 'token vazou');
  }
});

test('permissões: só o dador dá a pista e ele não pode chutar', () => {
  const { g, sala, codigo } = salaComTres();
  g.iniciar(codigo, 'tA');
  const dador = tokenDoDador(sala);
  const outro = ['tA', 'tB', 'tC'].find((t) => t !== dador);
  assert.equal(g.agir(codigo, outro, { tipo: 'DAR_PISTA', pista: 'azqxw' }).ok, false);
  assert.ok(g.agir(codigo, dador, { tipo: 'DAR_PISTA', pista: 'azqxw' }).ok);
  assert.equal(g.agir(codigo, dador, { tipo: 'CHUTAR', coordenada: 'A1' }).ok, false);
  assert.equal(g.agir(codigo, 'intruso', { tipo: 'CHUTAR', coordenada: 'A1' }).ok, false);
  assert.ok(g.agir(codigo, outro, { tipo: 'CHUTAR', coordenada: 'A1' }).ok);
});

test('a vez de dar a pista gira entre todos, uma carta para cada', () => {
  const { g, sala, codigo } = salaComTres();
  g.iniciar(codigo, 'tA');
  const ordem = [];
  for (let i = 0; i < 6; i++) {
    const dador = tokenDoDador(sala);
    ordem.push(dador);
    g.agir(codigo, dador, { tipo: 'DAR_PISTA', pista: pista(i) });
    g.agir(codigo, dador === 'tA' ? 'tB' : 'tA', { tipo: 'CHUTAR', coordenada: 'C3' });
  }
  assert.deepEqual(ordem.slice(3), ordem.slice(0, 3));
  assert.equal(new Set(ordem).size, 3);
});

test('partida inteira online chega ao fim e o anfitrião pode começar outra', () => {
  const { g, sala, codigo } = salaComTres();
  g.iniciar(codigo, 'tA');
  for (let i = 0; i < 25; i++) {
    const dador = tokenDoDador(sala);
    const secreta = g.visaoPara(sala, dador).jogo.coordenadaSecreta;
    assert.ok(g.agir(codigo, dador, { tipo: 'DAR_PISTA', pista: pista(i) }).ok);
    const quemChuta = ['tA', 'tB', 'tC'].find((t) => t !== dador);
    assert.ok(g.agir(codigo, quemChuta, { tipo: 'CHUTAR', coordenada: secreta }).ok);
  }
  const fim = g.visaoPara(sala, 'tA').jogo;
  assert.equal(fim.fase, Game.FASE.FIM);
  assert.equal(fim.vitoriaMaxima, true);
  assert.equal(g.agir(codigo, 'tB', { tipo: 'NOVA_PARTIDA' }).ok, false);
  assert.ok(g.agir(codigo, 'tA', { tipo: 'NOVA_PARTIDA' }).ok);
  assert.equal(g.visaoPara(sala, 'tA').jogo.fase, Game.FASE.PISTA);
});

test('se o dador cai antes da pista, a vez passa; se o anfitrião cai, outro assume', () => {
  const { g, sala, codigo } = salaComTres();
  g.iniciar(codigo, 'tA');
  const dador = tokenDoDador(sala);
  g.desconectar(codigo, dador);
  assert.notEqual(tokenDoDador(sala), dador);
  g.desconectar(codigo, 'tA');
  const anfitriao = sala.jogadores.find((j) => j.id === sala.anfitriaoId);
  assert.equal(anfitriao.online, true);
});

test('sala some quando todos saem ou ficam desconectados', () => {
  const g = gerenciador();
  const { sala } = g.criarSala('tA', 'Ana');
  g.entrar(sala.codigo, 'tB', 'Bia');
  g.sair(sala.codigo, 'tA');
  assert.equal(g.total(), 1);
  assert.equal(sala.anfitriaoId, sala.jogadores[0].id);
  g.desconectar(sala.codigo, 'tB');
  g.removerSeVazia(sala.codigo);
  assert.equal(g.total(), 0);
});
