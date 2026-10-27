// Baralhos do Clássico em inglês e espanhol, e a regra de "mesma família" em cada idioma.
const test = require('node:test');
const assert = require('node:assert/strict');
const Util = require('../js/Util.js');
const WordBank = require('../js/WordBank.js');
const Game = require('../js/Game.js');

const IDIOMAS = { en: 'classico-en', es: 'classico-es' };
// Pares que a regra de família junta de propósito no mesmo baralho (sombrero vem de sombra).
// O sorteio só não os põe na mesma grade.
const PARES_DA_MESMA_FAMILIA = { 'classico-es': ['sombrero/sombra'] };

test('mesma família em inglês: plural, -y, -ing e consoante dobrada', () => {
  for (const [a, b] of [['cat', 'cats'], ['sun', 'sunny'], ['run', 'running'], ['snow', 'snowy'], ['berry', 'berries'], ['box', 'boxes'], ['dream', 'dreamer']]) {
    assert.equal(Util.mesmaFamilia(a, b, 'en'), true, a + '/' + b);
  }
  for (const [a, b] of [['star', 'start'], ['car', 'cart'], ['sea', 'season'], ['ant', 'antenna']]) {
    assert.equal(Util.mesmaFamilia(a, b, 'en'), false, a + '/' + b);
  }
});

test('mesma família em espanhol: plural, diminutivo e luz/luces', () => {
  for (const [a, b] of [['luz', 'luces'], ['gato', 'gatito'], ['flor', 'flores'], ['perro', 'perritos'], ['sangre', 'sangres']]) {
    assert.equal(Util.mesmaFamilia(a, b, 'es'), true, a + '/' + b);
  }
  for (const [a, b] of [['mar', 'marte'], ['sol', 'soldado'], ['flor', 'floresta']]) {
    assert.equal(Util.mesmaFamilia(a, b, 'es'), false, a + '/' + b);
  }
});

test('em português a regra não mudou e continua sendo o padrão', () => {
  for (const [a, b] of [['ritual', 'rituais'], ['sangue', 'sanguíneo'], ['pulmão', 'pulmonar'], ['lobo', 'lobinho']]) {
    assert.equal(Util.mesmaFamilia(a, b), true, a + '/' + b);
    assert.equal(Util.mesmaFamilia(a, b, 'pt'), true, a + '/' + b);
  }
  assert.equal(Util.mesmaFamilia('mar', 'marte'), false);
  assert.equal(Util.mesmaFamilia('flor', 'floresta'), false);
  assert.equal(WordBank.idioma('classico'), 'pt');
});

test('a tabela de traduções cobre o Clássico inteiro, na mesma ordem', () => {
  const pt = WordBank.obter('classico').palavras;
  assert.equal(WordBank.TRADUCOES.length, pt.length);
  WordBank.TRADUCOES.forEach((linha, i) => {
    assert.equal(linha[0], pt[i]);
    assert.equal(linha.length, 5, linha[0]);
    assert.ok(Array.isArray(linha[2]) && Array.isArray(linha[4]), linha[0]);
  });
});

for (const [idioma, id] of Object.entries(IDIOMAS)) {
  test('baralho ' + id + ': 169 palavras simples, sem repetir, no idioma certo', () => {
    const pacote = WordBank.obter(id);
    assert.equal(pacote.idioma, idioma);
    assert.equal(pacote.palavras.length, 169);
    for (const p of pacote.palavras) assert.ok(WordBank.ehSimples(p), p);
  });

  test('baralho ' + id + ': nenhuma palavra equivale a outra do baralho', () => {
    const palavras = WordBank.obter(id).palavras;
    const conflitos = [];
    for (let i = 0; i < palavras.length; i++) {
      for (let j = i + 1; j < palavras.length; j++) {
        if (WordBank.equivalentes(palavras[i], palavras[j], id)) conflitos.push(palavras[i] + '/' + palavras[j]);
      }
    }
    assert.deepEqual(conflitos, PARES_DA_MESMA_FAMILIA[id] || []);
  });

  test('baralho ' + id + ': sorteia grades sem palavras equivalentes', () => {
    for (let semente = 1; semente <= 30; semente++) {
      const grade = WordBank.sortear(10, id, Util.rngComSemente(semente));
      assert.equal(new Set(grade).size, 10);
      for (let i = 0; i < grade.length; i++) {
        for (let j = i + 1; j < grade.length; j++) {
          assert.equal(WordBank.equivalentes(grade[i], grade[j], id), false, grade[i] + ' e ' + grade[j]);
        }
      }
    }
  });
}

test('sinônimos e traduções valem nos dois sentidos, nos três idiomas', () => {
  assert.equal(WordBank.equivalentes('cat', 'kitten', 'classico-en'), true);
  assert.equal(WordBank.equivalentes('cat', 'gato', 'classico-en'), true);
  assert.equal(WordBank.equivalentes('sea', 'mar', 'classico-en'), true);
  assert.equal(WordBank.equivalentes('perro', 'dog', 'classico-es'), true);
  assert.equal(WordBank.equivalentes('perro', 'cachorro', 'classico-es'), true);
  assert.equal(WordBank.equivalentes('lluvia', 'llovizna', 'classico-es'), true);
  // Associação não é equivalência: continua sendo uma boa pista.
  assert.equal(WordBank.equivalentes('clown', 'circus', 'classico-en'), false);
});

test('partida com o baralho em inglês recusa tradução e plural de pista repetida', () => {
  let jogo;
  for (let semente = 1; ; semente++) {
    jogo = Game.criar({ rng: Util.rngComSemente(semente), pacote: 'classico-en' });
    const v = jogo.visao();
    if (v.colunas.concat(v.linhas).includes('cat')) break;
  }
  assert.equal(jogo.executar({ tipo: 'DAR_PISTA', pista: 'gato' }).ok, false);
  assert.equal(jogo.executar({ tipo: 'DAR_PISTA', pista: 'kitten' }).ok, false);
  assert.equal(jogo.executar({ tipo: 'DAR_PISTA', pista: 'whiskers' }).ok, true);
  jogo.executar({ tipo: 'CHUTAR', coordenada: 'A1' });
  const r = jogo.executar({ tipo: 'DAR_PISTA', pista: 'whisker' });
  assert.equal(r.ok, false);
  assert.equal(r.chave, 'pista.repetida');
});
