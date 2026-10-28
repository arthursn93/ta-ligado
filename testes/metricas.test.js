// Contadores diários de uso (server/Metricas.js): só números por dia, sem identificar ninguém.
const test = require('node:test');
const assert = require('node:assert/strict');
const { io: conectar } = require('socket.io-client');
const Metricas = require('../server/Metricas.js');
const Memoria = require('../server/progressao/Memoria.js');
const { criarServidor } = require('../server/index.js');
const Game = require('../js/Game.js');
const Util = require('../js/Util.js');

test('o dia é contado no horário de Brasília', () => {
  assert.equal(Metricas.diaDe(Date.parse('2026-10-28T02:59:00Z')), '2026-10-27'); // 23h59 em Brasília
  assert.equal(Metricas.diaDe(Date.parse('2026-10-28T03:00:00Z')), '2026-10-28');
});

test('soma por dia, ignora nomes fora da lista e grava numa operação só', async () => {
  const armazem = Memoria.criar();
  let chamadas = 0;
  const somar = armazem.somarMetricas;
  armazem.somarMetricas = (l) => { chamadas++; return somar(l); };
  let agora = Date.parse('2026-10-27T15:00:00Z');
  const m = Metricas.criar({ armazem, agora: () => agora });
  m.contar('abriu');
  m.contar('abriu');
  m.contar('qualquer_coisa');
  m.contar('__proto__');
  agora = Date.parse('2026-10-28T15:00:00Z');
  m.contar('abriu');
  await m.despejar();
  assert.equal(chamadas, 1);
  await m.despejar();
  assert.equal(chamadas, 1, 'sem nada novo, não grava');
  m.contar('abriu');
  await m.parar();
  assert.deepEqual(await armazem.lerMetricas('2026-01-01'), [
    { dia: '2026-10-28', evento: 'abriu', total: 2 },
    { dia: '2026-10-27', evento: 'abriu', total: 2 }
  ]);
});

test('se gravar falhar, os totais esperam a próxima vez e nada se perde', async () => {
  const armazem = Memoria.criar();
  const somar = armazem.somarMetricas;
  let falhar = true;
  armazem.somarMetricas = (l) => (falhar ? Promise.reject(new Error('fora do ar')) : somar(l));
  const erros = [];
  const m = Metricas.criar({ armazem, agora: () => Date.parse('2026-10-27T15:00:00Z'), log: { erro: (e) => erros.push(e) } });
  m.contar('sala_criada');
  await m.despejar();
  assert.deepEqual(erros, ['erro_gravar_metricas']);
  m.contar('sala_criada');
  falhar = false;
  await m.parar();
  assert.deepEqual(await armazem.lerMetricas('2026-10-27'), [{ dia: '2026-10-27', evento: 'sala_criada', total: 2 }]);
});

test('sem armazém não conta nada', async () => {
  const m = Metricas.criar({});
  m.contar('abriu');
  await m.parar();
});

// ---------- No servidor ----------

function subir(armazem) {
  const srv = criarServidor({ armazem, criarJogo: () => Game.criar({ rng: Util.rngComSemente(3) }) });
  return new Promise((ok) => srv.servidorHttp.listen(0, () => ok({ ...srv, url: 'http://localhost:' + srv.servidorHttp.address().port })));
}

function cliente(url) {
  const s = conectar(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  s.pedir = (evento, dados) => new Promise((ok) => s.emit(evento, dados, ok));
  return new Promise((ok) => s.on('connect', () => ok(s)));
}

async function totais(srv, armazem) {
  await srv.metricas.despejar();
  const r = {};
  for (const l of await armazem.lerMetricas('2000-01-01')) r[l.evento] = (r[l.evento] || 0) + l.total;
  return r;
}

test('servidor: conta abertura, salas, entradas, partidas e modo local, só uma vez cada', async (t) => {
  const armazem = Memoria.criar();
  const srv = await subir(armazem);
  const a = await cliente(srv.url);
  const b = await cliente(srv.url);
  t.after(() => { a.close(); b.close(); srv.io.close(); });

  a.emit('metricas:abriu', { idioma: 'en', convite: false, voltou: true, de: 'whatsapp' });
  a.emit('metricas:abriu', { idioma: 'en', convite: false, voltou: true, de: 'whatsapp' }); // repetido na mesma conexão
  b.emit('metricas:abriu', { idioma: 'xx', convite: true, voltou: 'sim', de: 'jornal' }); // idioma, voltou e canal inválidos
  const criada = await a.pedir('criar', { token: 'tA', nome: 'Ana' });
  assert.ok(criada.ok);
  assert.ok((await b.pedir('entrar', { codigo: criada.codigo, token: 'tB', nome: 'Bia' })).ok);
  assert.ok((await b.pedir('entrar', { codigo: criada.codigo, token: 'tB' })).ok, 'voltar à sala');
  assert.ok((await a.pedir('iniciar')).ok);
  assert.deepEqual(await b.pedir('metricas:local'), { ok: true });
  await b.pedir('metricas:local');

  assert.deepEqual(await totais(srv, armazem), {
    abriu: 2, abriu_en: 1, abriu_voltou: 1, abriu_convite: 1, abriu_de_whatsapp: 1,
    sala_criada: 1, entrou_na_sala: 1, partida_iniciada: 1, partida_local: 1
  });

  // A partida termina interrompida quando todos saem.
  await a.pedir('sair');
  await b.pedir('sair');
  assert.equal((await totais(srv, armazem)).partida_interrompida, 1);
});

test('servidor: no desligamento grava o que faltava', async () => {
  const armazem = Memoria.criar();
  const srv = await subir(armazem);
  const a = await cliente(srv.url);
  a.emit('metricas:abriu', { idioma: 'pt' });
  await a.pedir('metricas:local');
  await srv.encerrar('teste');
  a.close();
  const linhas = await armazem.lerMetricas('2000-01-01');
  assert.deepEqual(linhas.map((l) => l.evento).sort(), ['abriu', 'abriu_pt', 'partida_local']);
});
