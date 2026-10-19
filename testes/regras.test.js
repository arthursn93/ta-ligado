// Testes das regras de XP e níveis. Rodar com: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const Regras = require('../server/progressao/regras.js');

test('a curva reproduz a tabela de níveis e continua sozinha', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 10].map(Regras.xpDoNivel), [0, 100, 300, 600, 1000, 1500, 4500]);
  assert.equal(Regras.nivel(0).nivel, 1);
  assert.equal(Regras.nivel(99).nivel, 1);
  assert.equal(Regras.nivel(100).nivel, 2);
  assert.equal(Regras.nivel(999).titulo, 'Estrategista');
  assert.equal(Regras.nivel(1000).titulo, 'Mestre das Pistas');
  assert.equal(Regras.nivel(2100).titulo, 'Decifrador', 'nível 7 usa o título do 6');
  assert.equal(Regras.nivel(4500).titulo, 'Lenda do Tabuleiro');
});

test('progresso até o próximo nível', () => {
  const n = Regras.nivel(150);
  assert.equal(n.nivel, 2);
  assert.equal(n.xpDoNivel, 100);
  assert.equal(n.xpProximoNivel, 300);
  assert.equal(n.falta, 150);
  assert.equal(n.progresso, 0.25);
  const max = Regras.nivel(10 ** 9);
  assert.equal(max.nivel, Regras.NIVEL_MAXIMO);
  assert.equal(max.xpProximoNivel, null);
  assert.equal(max.progresso, 1);
  assert.equal(Regras.nivel(-50).xp, 0, 'XP nunca fica negativo');
  assert.equal(Regras.nivel('abc').xp, 0);
});

function jogador(extra) {
  return Object.assign({ presenteNoFim: true, participou: true, acertosTurma: 0, pistasCertas: 0 }, extra);
}
function resumo(extra) {
  return Object.assign({ estado: 'concluida', acertos: 0, jogadores: [{}, {}] }, extra);
}

test('partida ruim ainda rende a participação, e erro nunca tira XP', () => {
  const r = Regras.xpDaPartida(resumo({ acertos: 0 }), jogador(), 0);
  assert.equal(r.valida, true);
  assert.equal(r.total, Regras.XP.participacao);
});

test('acertos da turma têm teto; pistas certas e desafio somam', () => {
  const r = Regras.xpDaPartida(resumo({ acertos: 25 }), jogador({ acertosTurma: 25, pistasCertas: 6 }), 0);
  assert.deepEqual(r.detalhe, [
    { motivo: 'participacao', xp: 30 },
    { motivo: 'acertos_turma', xp: 50, quantidade: 25 },
    { motivo: 'pistas_certas', xp: 30, quantidade: 6 },
    { motivo: 'desafio', xp: 20 }
  ]);
  assert.equal(r.total, 130);
});

test('sem XP: interrompida, sozinho, ausente no fim ou sem participar', () => {
  assert.equal(Regras.xpDaPartida(resumo({ estado: 'interrompida' }), jogador(), 0).total, 0);
  assert.equal(Regras.xpDaPartida(resumo({ jogadores: [{}] }), jogador(), 0).total, 0);
  assert.equal(Regras.xpDaPartida(resumo(), jogador({ presenteNoFim: false }), 0).total, 0);
  assert.equal(Regras.xpDaPartida(resumo(), jogador({ participou: false }), 0).valida, false);
});

test('limite diário: só a participação a partir da 11ª partida', () => {
  const r = Regras.xpDaPartida(resumo({ acertos: 25 }), jogador({ acertosTurma: 25, pistasCertas: 6 }), Regras.LIMITE_DIARIO.partidas);
  assert.equal(r.limitado, true);
  assert.equal(r.total, Regras.XP.participacao);
});

const Catalogo = require('../server/progressao/catalogo.js');

test('catálogo: ids únicos e toda recompensa tem condição válida', () => {
  const ids = Catalogo.CONQUISTAS.map((c) => c.id).concat(Catalogo.RECOMPENSAS.map((r) => r.id));
  assert.equal(new Set(ids).size, ids.length);
  for (const r of Catalogo.RECOMPENSAS) {
    assert.ok(Catalogo.TIPOS_VISUAIS.includes(r.tipo), r.id);
    if (r.condicao.conquista) assert.ok(Catalogo.conquista(r.condicao.conquista), r.id);
    else assert.ok(r.condicao.nivel >= 1, r.id);
  }
  // Toda skin de tabuleiro do catálogo existe no Theme.js do navegador.
  const tema = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'Theme.js'), 'utf8');
  for (const r of Catalogo.RECOMPENSAS.filter((x) => x.tipo === 'tabuleiro')) assert.ok(tema.includes("id: '" + r.id + "'"), r.id);
});

test('conquista de nível em cascata: o XP das conquistas pode subir o nível', () => {
  // 990 XP + 15 de uma conquista passa de 1000: libera Mestre das Pistas na mesma partida.
  const ctx = { valida: true, partida: { maiorSequencia: 0, acertos: 0, tentativas: 25 }, eu: { pistasDadas: 0, pistasCertas: 0 },
    validas: 10, pistasCertas: 1, melhorAnterior: 30, xp: 990 };
  const jaTem = ['primeira_ligacao', 'estreia', 'subiu_de_nivel'];
  const r = Catalogo.avaliar(ctx, new Set(jaTem));
  assert.deepEqual(r.novas, ['ate_o_fim', 'nivel_5']);
  assert.equal(r.xpExtra, 30);
  assert.deepEqual(Catalogo.avaliar(ctx, new Set(jaTem.concat(r.novas))).novas, [], 'não repete');
});

test('visual padrão e item que saiu do catálogo', () => {
  const v = Catalogo.visualEfetivo({ moldura: 'nao_existe', tabuleiro: 'oceano' }, 2, new Set());
  assert.deepEqual(v, { titulo: 'titulo_nivel_2', moldura: 'moldura_nenhuma', tabuleiro: 'padrao' }, 'oceano só no nível 3');
});
