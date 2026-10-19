// Testes da gravação das partidas e do perfil. Rodar com: npm test
// Os mesmos testes rodam no armazenamento em memória e, se TEST_DATABASE_URL estiver definida,
// num PostgreSQL de verdade (use um banco só para testes: as tabelas são apagadas).
const test = require('node:test');
const assert = require('node:assert/strict');
const { io: conectar } = require('socket.io-client');
const Util = require('../js/Util.js');
const Game = require('../js/Game.js');
const Partida = require('../server/progressao/Partida.js');
const Perfil = require('../server/progressao/Perfil.js');
const Memoria = require('../server/progressao/Memoria.js');
const { criarServidor } = require('../server/index.js');

const ANA = { token: 'tA', nome: 'Ana' };
const BIA = { token: 'tB', nome: 'Bia' };

/** Uma partida feita à mão: `cartas` é uma lista de true (acerto) / false (erro), Ana dá as pistas. */
function resumo(cartas, opcoes) {
  opcoes = opcoes || {};
  const r = Partida.iniciar('ABCD', opcoes.inicio || 1000);
  cartas.forEach((acertou, i) => {
    Partida.registrarCarta(r, { rodada: i + 1, acertou, dador: ANA, chutador: BIA, presentes: [ANA, BIA] });
  });
  const estado = opcoes.estado || (cartas.length === 25 ? Partida.ESTADO.CONCLUIDA : Partida.ESTADO.INTERROMPIDA);
  return Partida.encerrar(r, estado, opcoes.noFim || ['tA', 'tB'], 25, opcoes.fim || 2000);
}

const vinte = Array.from({ length: 25 }, (_, i) => i % 5 !== 3); // 20 acertos, 5 erros

test('perfil sem partidas: zeros, precisão vazia e sem recordes', () => {
  const p = Perfil.montar(null, []);
  assert.equal(p.cartas, 0);
  assert.equal(p.precisaoTurma, null);
  assert.equal(p.precisaoPistas, null);
  assert.deepEqual(p.recordes, { melhorPontuacao: null, maiorSequencia: null, perfeitas: 0 });
  assert.deepEqual(p.historico, []);
});

test('o token nunca é guardado, só o hash dele', () => {
  const linhas = Perfil.linhasDoResumo(resumo(vinte));
  assert.equal(JSON.stringify(linhas).includes('"tA"'), false);
  assert.equal(linhas[0].tokenHash, Perfil.hashToken('tA'));
  assert.match(linhas[0].tokenHash, /^[0-9a-f]{64}$/);
});

function contrato(nome, fabricar) {
  test(nome + ': grava a partida e monta o perfil', async () => {
    const a = await fabricar();
    try {
      assert.equal((await a.gravarPartida(resumo(vinte))).gravada, true);
      const ana = await a.perfil('tA');
      assert.equal(ana.nome, 'Ana');
      assert.deepEqual(ana.partidas, { concluidas: 1, saiuAntes: 0, interrompidas: 0 });
      assert.equal(ana.cartas, 25);
      assert.equal(ana.acertosTurma, 20);
      assert.equal(ana.errosTurma, 5);
      assert.equal(ana.precisaoTurma, 80);
      assert.equal(ana.pistasDadas, 25);
      assert.equal(ana.pistasCertas, 20);
      assert.equal(ana.palpites, 0);
      assert.deepEqual(ana.recordes, { melhorPontuacao: 20, maiorSequencia: 4, perfeitas: 0 });
      assert.equal(ana.historico.length, 1);
      const bia = await a.perfil('tB');
      assert.equal(bia.pistasDadas, 0);
      assert.equal(bia.precisaoPistas, null);
      assert.equal(bia.palpites, 25);
      assert.equal(bia.palpitesCertos, 20);
      const ninguem = await a.perfil('quem?');
      assert.equal(ninguem.nome, null);
      assert.equal(ninguem.cartas, 0);
    } finally {
      await a.fechar();
    }
  });

  test(nome + ': a mesma partida gravada duas vezes (até ao mesmo tempo) conta uma vez', async () => {
    const a = await fabricar();
    try {
      const r = resumo(vinte);
      const resultados = await Promise.allSettled([a.gravarPartida(r), a.gravarPartida(r)]);
      assert.equal(resultados.filter((x) => x.status === 'fulfilled' && x.value.gravada).length, 1);
      assert.deepEqual(await a.gravarPartida(r), { gravada: false, jaExistia: true });
      const ana = await a.perfil('tA');
      assert.equal(ana.partidas.concluidas, 1);
      assert.equal(ana.cartas, 25);
    } finally {
      await a.fechar();
    }
  });

  test(nome + ': interrompida e saída antes do fim não contam para recordes', async () => {
    const a = await fabricar();
    try {
      await a.gravarPartida(resumo(Array(25).fill(true), { noFim: ['tA'], inicio: 1000, fim: 2000 }));
      await a.gravarPartida(resumo([true, true, false], { inicio: 3000, fim: 4000 }));
      // Partida sem nenhuma carta jogada não é gravada.
      assert.deepEqual(await a.gravarPartida(resumo([], { inicio: 5000, fim: 6000 })), { gravada: false });
      const bia = await a.perfil('tB');
      assert.deepEqual(bia.partidas, { concluidas: 0, saiuAntes: 1, interrompidas: 1 });
      assert.deepEqual(bia.recordes, { melhorPontuacao: null, maiorSequencia: null, perfeitas: 0 });
      assert.equal(bia.cartas, 28);
      assert.equal(bia.historico[0].estado, 'interrompida', 'mais recente primeiro');
      const ana = await a.perfil('tA');
      assert.deepEqual(ana.recordes, { melhorPontuacao: 25, maiorSequencia: 25, perfeitas: 1 });
    } finally {
      await a.fechar();
    }
  });

  test(nome + ': XP da partida, nível e detalhe do cálculo', async () => {
    const a = await fabricar();
    try {
      // 20 acertos: Ana (dador de todas) 30 + 40 + 20×5 + 20 = 190; Bia 30 + 40 + 20 = 90.
      const r = await a.gravarPartida(resumo(vinte));
      const ana = r.jogadores.find((j) => j.tokenHash === Perfil.hashToken('tA'));
      const bia = r.jogadores.find((j) => j.tokenHash === Perfil.hashToken('tB'));
      assert.equal(ana.xpGanho, 190);
      assert.deepEqual(ana.detalhe.map((d) => d.motivo), ['participacao', 'acertos_turma', 'pistas_certas', 'desafio']);
      assert.equal(ana.nivel.nivel, 2);
      assert.equal(ana.subiuDeNivel, true);
      assert.equal(bia.xpGanho, 90);
      assert.equal(bia.nivel.nivel, 1);
      assert.equal(bia.nivel.falta, 10);
      assert.equal(bia.subiuDeNivel, false);
      const perfil = await a.perfil('tA');
      assert.equal(perfil.nivel.xp, 190);
      assert.equal(perfil.historico[0].xpGanho, 190);
    } finally {
      await a.fechar();
    }
  });

  test(nome + ': interrompida, saída antes do fim e partida repetida não dão XP', async () => {
    const a = await fabricar();
    try {
      await a.gravarPartida(resumo([true, true, true]));
      await a.gravarPartida(resumo(vinte, { noFim: ['tA'], inicio: 3000, fim: 4000 }));
      const r = resumo(vinte, { inicio: 5000, fim: 6000 });
      await a.gravarPartida(r);
      await a.gravarPartida(r);
      assert.equal((await a.perfil('tB')).nivel.xp, 90, 'só a partida válida, uma vez');
      assert.equal((await a.perfil('tA')).nivel.xp, 380);
    } finally {
      await a.fechar();
    }
  });

  test(nome + ': depois de 10 partidas válidas em 24 horas, só a participação conta', async () => {
    const a = await fabricar();
    const hora = 60 * 60 * 1000;
    try {
      for (let i = 0; i < 11; i++) await a.gravarPartida(resumo(vinte, { inicio: i * hora, fim: i * hora + 1000 }));
      assert.equal((await a.perfil('tB')).nivel.xp, 10 * 90 + 30);
      // Passadas 24 horas da primeira, o XP cheio volta.
      const r = await a.gravarPartida(resumo(vinte, { inicio: 25 * hora, fim: 25 * hora + 1000 }));
      const bia = r.jogadores.find((j) => j.tokenHash === Perfil.hashToken('tB'));
      assert.equal(bia.xpGanho, 90);
      assert.equal(bia.limitado, false);
    } finally {
      await a.fechar();
    }
  });

  test(nome + ': histórico guarda as 20 mais recentes, totais contam todas', async () => {
    const a = await fabricar();
    try {
      for (let i = 0; i < 22; i++) await a.gravarPartida(resumo([true], { inicio: i * 10, fim: i * 10 + 5 }));
      const ana = await a.perfil('tA');
      assert.equal(ana.historico.length, Perfil.TAMANHO_HISTORICO);
      assert.equal(ana.partidas.interrompidas, 22);
      assert.equal(ana.historico[0].encerradaEm, 215);
    } finally {
      await a.fechar();
    }
  });
}

contrato('memória', async () => Memoria.criar());

if (process.env.TEST_DATABASE_URL) {
  const { Pool } = require('pg');
  const Banco = require('../server/progressao/Banco.js');
  async function bancoLimpo() {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await pool.query('DROP TABLE IF EXISTS partida_jogadores, partidas, jogadores, migracoes');
    await pool.end();
    const b = Banco.criar(process.env.TEST_DATABASE_URL);
    await b.pronto();
    return b;
  }
  contrato('postgres', bancoLimpo);

  test('postgres: os dados continuam lá depois de reiniciar o servidor', async () => {
    const primeiro = await bancoLimpo();
    await primeiro.gravarPartida(resumo(vinte));
    await primeiro.fechar();
    // Um processo novo: migrações já aplicadas não rodam de novo e o perfil continua igual.
    const segundo = Banco.criar(process.env.TEST_DATABASE_URL);
    try {
      await segundo.pronto();
      const ana = await segundo.perfil('tA');
      assert.equal(ana.partidas.concluidas, 1);
      assert.equal(ana.acertosTurma, 20);
    } finally {
      await segundo.fechar();
    }
  });

  test('postgres: falha no meio da gravação não deixa nada pela metade', async () => {
    const b = await bancoLimpo();
    try {
      const r = resumo(vinte);
      r.jogadores[1].nome = null; // nome é obrigatório: a segunda linha falha
      await assert.rejects(b.gravarPartida(r));
      assert.equal((await b.perfil('tA')).cartas, 0, 'a linha da Ana não pode ter ficado');
      r.jogadores[1].nome = 'Bia';
      assert.equal((await b.gravarPartida(r)).gravada, true, 'tentar de novo funciona');
      assert.equal((await b.perfil('tA')).nivel.xp, 30 + 40 + 100 + 20, 'XP somado uma vez só');
    } finally {
      await b.fechar();
    }
  });
}

// ---------- Servidor ----------

function subir(opcoes) {
  const srv = criarServidor(Object.assign({ criarJogo: () => Game.criar({ rng: Util.rngComSemente(7) }) }, opcoes));
  return new Promise((ok) => srv.servidorHttp.listen(0, () => ok({ ...srv, url: 'http://localhost:' + srv.servidorHttp.address().port })));
}

function pedir(url, evento, dados) {
  const s = conectar(url, { transports: ['websocket'], forceNew: true });
  return new Promise((ok) => s.emit(evento, dados, (r) => { s.close(); ok(r); }));
}

function jogarInteira(salas, sala) {
  for (let i = 0; i < 25; i++) {
    const dador = sala.jogadores.find((j) => j.id === sala.dadorId).token;
    const secreta = salas.visaoPara(sala, dador).jogo.coordenadaSecreta;
    salas.agir(sala.codigo, dador, { tipo: 'DAR_PISTA', pista: String.fromCharCode(97 + i) + 'zqxw' });
    salas.agir(sala.codigo, dador === 'tA' ? 'tB' : 'tA', { tipo: 'CHUTAR', coordenada: secreta });
  }
}

test('servidor: a partida que termina é gravada e o aparelho lê o próprio perfil', async (t) => {
  const armazem = Memoria.criar();
  const srv = await subir({ armazem });
  t.after(() => srv.io.close());
  const { sala } = srv.salas.criarSala('tA', 'Ana');
  srv.salas.entrar(sala.codigo, 'tB', 'Bia');
  srv.salas.iniciar(sala.codigo, 'tA');
  jogarInteira(srv.salas, sala);
  await srv.aguardarGravacoes();
  const r = await pedir(srv.url, 'perfil', { token: 'tB' });
  assert.equal(r.ok, true);
  assert.equal(r.perfil.partidas.concluidas, 1);
  assert.equal(r.perfil.recordes.melhorPontuacao, 25);
  assert.equal(JSON.stringify(r).includes('tokenHash'), false);
  assert.equal((await pedir(srv.url, 'perfil', {})).ok, false, 'sem token');
});

test('servidor: banco fora do ar tenta de novo e não derruba a sala', async (t) => {
  let falhas = 0;
  const memoria = Memoria.criar();
  const armazem = Object.assign({}, memoria, {
    gravarPartida: (r) => (++falhas <= 2 ? Promise.reject(new Error('fora do ar')) : memoria.gravarPartida(r))
  });
  const srv = await subir({ armazem, esperasGravacao: [1, 1] });
  t.after(() => srv.io.close());
  const { sala } = srv.salas.criarSala('tA', 'Ana');
  srv.salas.entrar(sala.codigo, 'tB', 'Bia');
  srv.salas.iniciar(sala.codigo, 'tA');
  jogarInteira(srv.salas, sala);
  await srv.aguardarGravacoes();
  assert.equal(falhas, 3);
  assert.equal((await memoria.perfil('tA')).partidas.concluidas, 1);
  assert.ok(srv.salas.iniciar(sala.codigo, 'tA').ok);
});

test('servidor sem banco: o perfil avisa que não está disponível', async (t) => {
  const srv = await subir({});
  t.after(() => srv.io.close());
  const r = await pedir(srv.url, 'perfil', { token: 'tA' });
  assert.equal(r.ok, false);
});
