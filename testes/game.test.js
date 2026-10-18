// Testes da lógica. Rodar com: node --test jogo/testes/
const test = require('node:test');
const assert = require('node:assert/strict');
const Util = require('../js/Util.js');
const WordBank = require('../js/WordBank.js');
const Game = require('../js/Game.js');

function novoJogo(semente = 42) {
  return Game.criar({ rng: Util.rngComSemente(semente) });
}

// Pistas sem sentido e sem raiz em comum entre si nem com a grade (a regra de repetição barra iguais).
function pistaValida(jogo) {
  return String.fromCharCode(97 + (jogo.visao().historico.length % 26)) + 'zqxw';
}

test('banco de palavras tem palavras suficientes e sem repetição', () => {
  const pacote = WordBank.obter('classico');
  assert.ok(pacote.palavras.length >= 150, `só ${pacote.palavras.length} palavras`);
  const normalizadas = pacote.palavras.map(Util.normalizar);
  assert.equal(new Set(normalizadas).size, normalizadas.length);
});

test('partida começa com 10 palavras distintas e 25 cartas', () => {
  const v = novoJogo().visao();
  assert.equal(v.colunas.length, 5);
  assert.equal(v.linhas.length, 5);
  assert.equal(new Set([...v.colunas, ...v.linhas]).size, 10);
  assert.equal(v.cartasRestantes, 25);
  assert.equal(v.fase, Game.FASE.PISTA);
  assert.equal(v.rodada, 1);
});

test('só o dador vê a coordenada secreta, e só antes de dar a pista', () => {
  const jogo = novoJogo();
  assert.equal(jogo.visao().coordenadaSecreta, null);
  assert.equal(jogo.visao('grupo').coordenadaSecreta, null);
  const dador = jogo.visao('dador');
  assert.match(dador.coordenadaSecreta, /^[A-E][1-5]$/);
  assert.equal(dador.palavrasSecretas.coluna, dador.colunas['ABCDE'.indexOf(dador.coordenadaSecreta[0])]);
  jogo.executar({ tipo: 'DAR_PISTA', pista: pistaValida(jogo) });
  assert.equal(jogo.visao('dador').coordenadaSecreta, null);
});

test('pista precisa ser uma palavra só e fora da grade', () => {
  const jogo = novoJogo();
  const palavraDaGrade = jogo.visao().colunas[0];
  assert.equal(jogo.executar({ tipo: 'DAR_PISTA', pista: '' }).ok, false);
  assert.equal(jogo.executar({ tipo: 'DAR_PISTA', pista: 'duas palavras' }).ok, false);
  assert.equal(jogo.executar({ tipo: 'DAR_PISTA', pista: palavraDaGrade.toUpperCase() }).ok, false);
  assert.equal(jogo.executar({ tipo: 'CHUTAR', coordenada: 'A1' }).ok, false, 'não pode chutar antes da pista');
  assert.equal(jogo.executar({ tipo: 'DAR_PISTA', pista: '  vertigem ' }).ok, true);
  assert.equal(jogo.visao().pista, 'vertigem');
});

test('acerto marca o quadrado em verde e soma ponto', () => {
  const jogo = novoJogo();
  const secreta = jogo.visao('dador').coordenadaSecreta;
  jogo.executar({ tipo: 'DAR_PISTA', pista: pistaValida(jogo) });
  assert.equal(jogo.executar({ tipo: 'CHUTAR', coordenada: secreta.toLowerCase() }).ok, true);
  const v = jogo.visao();
  assert.equal(v.celulas[secreta], Game.RESULTADO.ACERTO);
  assert.equal(v.acertos, 1);
  assert.equal(v.ultimaJogada.acertou, true);
  assert.equal(v.rodada, 2);
  assert.equal(v.cartasRestantes, 24);
});

test('erro descarta a carta e bloqueia o quadrado dela', () => {
  const jogo = novoJogo();
  const secreta = jogo.visao('dador').coordenadaSecreta;
  const errado = secreta === 'A1' ? 'A2' : 'A1';
  jogo.executar({ tipo: 'DAR_PISTA', pista: pistaValida(jogo) });
  jogo.executar({ tipo: 'CHUTAR', coordenada: errado });
  const v = jogo.visao();
  assert.equal(v.celulas[secreta], Game.RESULTADO.ERRO);
  assert.equal(v.celulas[errado], null, 'o quadrado chutado continua em jogo');
  assert.equal(v.erros, 1);
  assert.deepEqual([v.ultimaJogada.coordenada, v.ultimaJogada.palpite], [secreta, errado]);
  // Quadrado bloqueado não aceita novo chute.
  jogo.executar({ tipo: 'DAR_PISTA', pista: pistaValida(jogo) });
  assert.equal(jogo.executar({ tipo: 'CHUTAR', coordenada: secreta }).ok, false);
});

test('partida perfeita: 25 acertos dão vitória máxima', () => {
  const jogo = novoJogo(7);
  let fim = null;
  jogo.hooks.on('gameEnd', (d) => { fim = d; });
  for (let i = 0; i < 25; i++) {
    const secreta = jogo.visao('dador').coordenadaSecreta;
    jogo.executar({ tipo: 'DAR_PISTA', pista: pistaValida(jogo) });
    jogo.executar({ tipo: 'CHUTAR', coordenada: secreta });
  }
  const v = jogo.visao();
  assert.equal(v.fase, Game.FASE.FIM);
  assert.equal(v.acertos, 25);
  assert.equal(v.vitoriaMaxima, true);
  assert.deepEqual(fim, { acertos: 25, erros: 0, total: 25, vitoriaMaxima: true });
});

test('fim do baralho com erros: placar final e todas as 25 posições resolvidas', () => {
  const jogo = novoJogo(99);
  const rodadas = [];
  jogo.hooks.on('roundResolved', (d) => rodadas.push(d));
  for (let i = 0; i < 25; i++) {
    const v = jogo.visao('dador');
    jogo.executar({ tipo: 'DAR_PISTA', pista: pistaValida(jogo) });
    // Erra de propósito nas rodadas pares, chutando outro quadrado livre.
    const livre = Object.keys(v.celulas).find((c) => v.celulas[c] === null && c !== v.coordenadaSecreta);
    const palpite = i % 2 === 0 && livre ? livre : v.coordenadaSecreta;
    assert.equal(jogo.executar({ tipo: 'CHUTAR', coordenada: palpite }).ok, true);
  }
  const v = jogo.visao();
  assert.equal(v.fase, Game.FASE.FIM);
  assert.equal(v.acertos + v.erros, 25);
  assert.equal(v.erros, 12);
  assert.equal(v.vitoriaMaxima, false);
  assert.ok(Object.values(v.celulas).every((c) => c !== null));
  assert.equal(rodadas.length, 25);
  assert.deepEqual(v.historico, rodadas, 'histórico da visão bate com os eventos');
  assert.equal(new Set(rodadas.map((r) => r.coordenada)).size, 25, 'cada posição sai uma vez');
  assert.equal(jogo.executar({ tipo: 'DAR_PISTA', pista: 'abc' }).ok, false, 'nada acontece depois do fim');
});

test('nova partida zera tudo e mesma semente reproduz a mesma grade', () => {
  const jogo = novoJogo(5);
  const primeira = jogo.visao().colunas.join();
  jogo.executar({ tipo: 'DAR_PISTA', pista: pistaValida(jogo) });
  jogo.executar({ tipo: 'NOVA_PARTIDA' });
  const v = jogo.visao();
  assert.equal(v.rodada, 1);
  assert.equal(v.cartasRestantes, 25);
  assert.notEqual(v.colunas.join(), primeira);
  assert.equal(novoJogo(5).visao().colunas.join(), primeira);
});

test('visão é uma cópia: mexer nela não altera a partida', () => {
  const jogo = novoJogo();
  const v = jogo.visao();
  v.celulas.A1 = 'acerto';
  v.colunas[0] = 'hack';
  assert.equal(jogo.visao().celulas.A1, null);
  assert.notEqual(jogo.visao().colunas[0], 'hack');
});

test('assinantes são avisados só quando a ação é aceita', () => {
  const jogo = novoJogo();
  let avisos = 0;
  jogo.assinar(() => avisos++);
  jogo.executar({ tipo: 'DAR_PISTA', pista: '' });
  jogo.executar({ tipo: 'XYZ' });
  assert.equal(avisos, 0);
  jogo.executar({ tipo: 'DAR_PISTA', pista: pistaValida(jogo) });
  assert.equal(avisos, 1);
});

// ---------- Regras de qualidade das palavras ----------

function acharSementeCom(palavra) {
  for (let semente = 1; semente < 5000; semente++) {
    const v = novoJogo(semente).visao();
    if (v.colunas.concat(v.linhas).includes(palavra)) return semente;
  }
  throw new Error('nenhuma semente com ' + palavra);
}

test('pista com hífen ou composta é recusada', () => {
  const jogo = novoJogo();
  const r = jogo.executar({ tipo: 'DAR_PISTA', pista: 'vaso-sanguíneo' });
  assert.equal(r.ok, false);
  assert.match(r.erro, /hífen/);
});

test('pista que só traduz ou é sinônimo de uma palavra da grade é recusada', () => {
  const jogo = novoJogo(acharSementeCom('palhaço'));
  for (const pista of ['clown', 'CLOWN', 'bufão', 'palhaçada', 'palhaços']) {
    const r = jogo.executar({ tipo: 'DAR_PISTA', pista });
    assert.equal(r.ok, false, pista + ' deveria ser recusada');
    assert.match(r.erro, /PALHAÇO/);
  }
  // Uma associação de verdade passa.
  assert.equal(jogo.executar({ tipo: 'DAR_PISTA', pista: 'picadeiro' }).ok, true);
});

test('variações de raiz de palavras da grade são recusadas', () => {
  const jogo = novoJogo(acharSementeCom('sangue'));
  assert.equal(jogo.executar({ tipo: 'DAR_PISTA', pista: 'sanguíneo' }).ok, false);
  assert.equal(jogo.executar({ tipo: 'DAR_PISTA', pista: 'blood' }).ok, false);
});

test('a mesma pista (ou um plural dela) não pode ser usada duas vezes na partida', () => {
  const jogo = novoJogo();
  jogo.executar({ tipo: 'DAR_PISTA', pista: 'ritual' });
  jogo.executar({ tipo: 'CHUTAR', coordenada: 'A1' });
  for (const pista of ['ritual', 'RITUAL', 'rituais']) {
    const r = jogo.executar({ tipo: 'DAR_PISTA', pista });
    assert.equal(r.ok, false, pista);
    assert.match(r.erro, /já foi usada/);
  }
  // Em outra partida a pista volta a valer.
  jogo.executar({ tipo: 'NOVA_PARTIDA' });
  assert.equal(jogo.executar({ tipo: 'DAR_PISTA', pista: 'ritual' }).ok, true);
});

test('banco não tem palavras compostas', () => {
  const pacote = WordBank.obter('classico');
  assert.ok(pacote.palavras.every((p) => /^[\p{L}]+$/u.test(p)), 'há palavra composta no pacote');
  WordBank.registrar({ id: 'teste-compostas', palavras: ['arco-íris', 'guarda chuva', 'sol', 'lua'] });
  assert.deepEqual(WordBank.obter('teste-compostas').palavras, ['sol', 'lua']);
});

test('a grade nunca junta duas palavras equivalentes', () => {
  WordBank.registrar({
    id: 'teste-equivalentes',
    palavras: ['cão', 'cachorro', 'gato', 'felino', 'mar', 'oceano', 'sol', 'lua', 'rio', 'pedra', 'fogo', 'gelo', 'neve', 'vento'],
    equivalentes: { cachorro: ['cão'], gato: ['felino'], mar: ['oceano'] }
  });
  for (let semente = 1; semente <= 50; semente++) {
    const grade = WordBank.sortear(10, 'teste-equivalentes', Util.rngComSemente(semente));
    for (let i = 0; i < grade.length; i++) {
      for (let j = i + 1; j < grade.length; j++) {
        assert.equal(WordBank.equivalentes(grade[i], grade[j], 'teste-equivalentes'), false, grade[i] + ' e ' + grade[j]);
      }
    }
  }
});

test('novas partidas da mesma sessão não repetem palavras da grade', () => {
  const jogo = novoJogo(3);
  const vistas = new Set();
  // 169 palavras no pacote: as primeiras 10 partidas (100 palavras) cabem sem repetir.
  for (let partida = 0; partida < 10; partida++) {
    const v = jogo.visao();
    for (const p of v.colunas.concat(v.linhas)) {
      assert.ok(!vistas.has(p), p + ' repetiu na partida ' + (partida + 1));
      vistas.add(p);
    }
    jogo.executar({ tipo: 'NOVA_PARTIDA' });
  }
  // Quando o pacote acaba, o sorteio volta a usar palavras em vez de travar.
  for (let partida = 0; partida < 20; partida++) assert.equal(jogo.executar({ tipo: 'NOVA_PARTIDA' }).ok, true);
});
