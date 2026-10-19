// Testes da contagem por partida (sem rede). Rodar com: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const Util = require('../js/Util.js');
const Game = require('../js/Game.js');
const Partida = require('../server/progressao/Partida.js');
const { criarGerenciador } = require('../server/Salas.js');

function montar() {
  const resumos = [];
  const g = criarGerenciador({
    criarJogo: () => Game.criar({ rng: Util.rngComSemente(7) }),
    aoEncerrarPartida: (r) => resumos.push(r)
  });
  const { sala } = g.criarSala('tA', 'Ana');
  g.entrar(sala.codigo, 'tB', 'Bia');
  g.entrar(sala.codigo, 'tC', 'Caio');
  g.iniciar(sala.codigo, 'tA');
  return { g, sala, codigo: sala.codigo, resumos };
}

function pista(n) {
  return String.fromCharCode(97 + (n % 26)) + 'zqxw';
}

function tokenDoDador(sala) {
  return sala.jogadores.find((j) => j.id === sala.dadorId).token;
}

/** Joga uma carta: acerta ou erra de propósito. Retorna quem deu a pista e quem chutou. */
function jogarCarta(g, sala, i, acertar, quemChuta) {
  const dador = tokenDoDador(sala);
  const v = g.visaoPara(sala, dador).jogo;
  const secreta = v.coordenadaSecreta;
  assert.ok(g.agir(sala.codigo, dador, { tipo: 'DAR_PISTA', pista: pista(i) }).ok);
  const errada = Object.keys(v.celulas).find((c) => v.celulas[c] === null && c !== secreta);
  const chutador = quemChuta || ['tA', 'tB', 'tC'].find((t) => t !== dador);
  assert.ok(g.agir(sala.codigo, chutador, { tipo: 'CHUTAR', coordenada: acertar ? secreta : errada }).ok);
  return { dador, chutador };
}

function porToken(resumo, token) {
  return resumo.jogadores.find((j) => j.token === token);
}

test('precisão sem tentativas é null, não 0% nem divisão por zero', () => {
  assert.equal(Partida.precisao(0, 0), null);
  assert.equal(Partida.precisao(3, 4), 75);
  assert.equal(Partida.precisao(1, 3), 33.3);
});

test('partida inteira: acertos, erros, sequência e pistas de cada dador', () => {
  const { g, sala, resumos } = montar();
  const pistas = {};
  for (let i = 0; i < 25; i++) {
    const acertar = i % 5 !== 3; // erra as cartas 4, 9, 14, 19 e 24 (a última precisa de acerto: só sobra o quadrado dela)
    const { dador } = jogarCarta(g, sala, i, acertar);
    pistas[dador] = pistas[dador] || { dadas: 0, certas: 0 };
    pistas[dador].dadas += 1;
    if (acertar) pistas[dador].certas += 1;
  }
  assert.equal(resumos.length, 1);
  const r = resumos[0];
  assert.equal(r.estado, Partida.ESTADO.CONCLUIDA);
  assert.equal(r.tentativas, 25);
  assert.equal(r.acertos, 20);
  assert.equal(r.erros, 5);
  assert.equal(r.precisao, 80);
  assert.equal(r.maiorSequencia, 4);
  assert.equal(r.perfeita, false);
  for (const t of ['tA', 'tB', 'tC']) {
    const j = porToken(r, t);
    assert.equal(j.cartasPresente, 25);
    assert.equal(j.acertosTurma, 20);
    assert.equal(j.pistasDadas, pistas[t].dadas);
    assert.equal(j.pistasCertas, pistas[t].certas);
    assert.equal(j.presenteNoFim, true);
    assert.equal(j.participou, true);
  }
  const palpites = r.jogadores.reduce((soma, j) => soma + j.palpites, 0);
  assert.equal(palpites, 25);
  assert.deepEqual(sala.ultimaPartida, r);
});

test('tabuleiro perfeito', () => {
  const { g, sala, resumos } = montar();
  for (let i = 0; i < 25; i++) jogarCarta(g, sala, i, true);
  assert.equal(resumos[0].perfeita, true);
  assert.equal(resumos[0].maiorSequencia, 25);
});

test('palpites recusados não contam como tentativa nem como erro', () => {
  const { g, sala, codigo, resumos } = montar();
  const dador = tokenDoDador(sala);
  const outro = ['tA', 'tB', 'tC'].find((t) => t !== dador);
  // Antes da pista, coordenada inválida e o dador chutando: tudo recusado.
  assert.equal(g.agir(codigo, outro, { tipo: 'CHUTAR', coordenada: 'A1' }).ok, false);
  g.agir(codigo, dador, { tipo: 'DAR_PISTA', pista: 'azqxw' });
  assert.equal(g.agir(codigo, outro, { tipo: 'CHUTAR', coordenada: 'Z9' }).ok, false);
  assert.equal(g.agir(codigo, dador, { tipo: 'CHUTAR', coordenada: 'A1' }).ok, false);
  assert.equal(sala.partida.acertos + sala.partida.erros, 0);
  assert.equal(sala.partida.ultimaRodada, 0);
  assert.equal(resumos.length, 0);
});

test('a mesma rodada só conta uma vez', () => {
  const registro = Partida.iniciar('ABCD');
  const carta = { rodada: 1, acertou: true, dador: { token: 'tA', nome: 'Ana' }, chutador: { token: 'tB', nome: 'Bia' },
    presentes: [{ token: 'tA', nome: 'Ana' }, { token: 'tB', nome: 'Bia' }] };
  assert.equal(Partida.registrarCarta(registro, carta), true);
  assert.equal(Partida.registrarCarta(registro, carta), false);
  assert.equal(registro.acertos, 1);
  assert.equal(registro.jogadores.get('tA').pistasDadas, 1);
  assert.equal(registro.jogadores.get('tB').cartasPresente, 1);
  assert.ok(Partida.encerrar(registro, Partida.ESTADO.CONCLUIDA, ['tA'], 25));
  assert.equal(Partida.encerrar(registro, Partida.ESTADO.CONCLUIDA, ['tA'], 25), null, 'fechou duas vezes');
  assert.equal(Partida.registrarCarta(registro, Object.assign({}, carta, { rodada: 2 })), false, 'contou depois de fechar');
});

test('anfitrião recomeça no meio: a partida fica interrompida e a nova começa do zero', () => {
  const { g, sala, codigo, resumos } = montar();
  for (let i = 0; i < 3; i++) jogarCarta(g, sala, i, true);
  const idAntes = sala.partida.id;
  assert.ok(g.iniciar(codigo, 'tA').ok);
  assert.equal(resumos.length, 1);
  assert.equal(resumos[0].estado, Partida.ESTADO.INTERROMPIDA);
  assert.equal(resumos[0].id, idAntes);
  assert.equal(resumos[0].tentativas, 3);
  assert.notEqual(sala.partida.id, idAntes);
  assert.equal(sala.partida.acertos, 0);
});

test('nova partida depois do fim não gera um segundo resumo da anterior', () => {
  const { g, sala, codigo, resumos } = montar();
  for (let i = 0; i < 25; i++) jogarCarta(g, sala, i, true);
  assert.ok(g.iniciar(codigo, 'tA').ok);
  assert.equal(resumos.length, 1);
  assert.equal(sala.partida.estado, Partida.ESTADO.EM_ANDAMENTO);
});

test('quem cai e volta continua o mesmo; quem sai antes do fim fica marcado como ausente', () => {
  const { g, sala, codigo, resumos } = montar();
  jogarCarta(g, sala, 0, true);
  g.desconectar(codigo, 'tC');
  for (let i = 1; i < 4; i++) jogarCarta(g, sala, i, true);
  g.entrar(codigo, 'tC', 'Caio');
  for (let i = 4; i < 12; i++) jogarCarta(g, sala, i, true);
  g.sair(codigo, 'tB');
  for (let i = 12; i < 25; i++) jogarCarta(g, sala, i, true, tokenDoDador(sala) === 'tA' ? 'tC' : 'tA');
  const r = resumos[0];
  assert.equal(r.jogadores.length, 3);
  const caio = porToken(r, 'tC');
  assert.equal(caio.cartasPresente, 22); // ficou fora de 3 cartas
  assert.equal(caio.presenteNoFim, true);
  assert.equal(caio.participou, true);
  const bia = porToken(r, 'tB');
  assert.equal(bia.presenteNoFim, false);
  assert.equal(bia.cartasPresente, 12);
});

test('salas diferentes não misturam as contagens', () => {
  const a = montar();
  const b = montar();
  for (let i = 0; i < 4; i++) jogarCarta(a.g, a.sala, i, true);
  jogarCarta(b.g, b.sala, 0, false);
  assert.equal(a.sala.partida.acertos, 4);
  assert.equal(b.sala.partida.acertos, 0);
  assert.equal(b.sala.partida.erros, 1);
  assert.notEqual(a.sala.partida.id, b.sala.partida.id);
});

test('sala que esvazia fecha a partida como interrompida', () => {
  const { g, sala, codigo, resumos } = montar();
  jogarCarta(g, sala, 0, true);
  g.sair(codigo, 'tA');
  g.sair(codigo, 'tB');
  g.sair(codigo, 'tC');
  assert.equal(resumos.length, 1);
  assert.equal(resumos[0].estado, Partida.ESTADO.INTERROMPIDA);
  assert.equal(resumos[0].jogadores.every((j) => !j.presenteNoFim), true);
});

test('erro em quem recebe o resumo não trava a sala', () => {
  const g = criarGerenciador({
    criarJogo: () => Game.criar({ rng: Util.rngComSemente(7) }),
    aoEncerrarPartida: () => { throw new Error('banco fora do ar'); }
  });
  const { sala } = g.criarSala('tA', 'Ana');
  g.entrar(sala.codigo, 'tB', 'Bia');
  g.iniciar(sala.codigo, 'tA');
  const erroOriginal = console.error;
  console.error = () => {};
  try {
    assert.ok(g.iniciar(sala.codigo, 'tA').ok);
  } finally {
    console.error = erroOriginal;
  }
  assert.ok(sala.partida);
});

test('o resumo não vai para os aparelhos', () => {
  const { g, sala } = montar();
  jogarCarta(g, sala, 0, true);
  const v = JSON.stringify(g.visaoPara(sala, 'tA'));
  assert.equal(v.includes('"token"'), false);
  assert.equal(v.includes(sala.partida.id), false);
});
