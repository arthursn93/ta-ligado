// Testes do servidor com Socket.io de verdade (porta aleatória). Rodar com: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { io: conectar } = require('socket.io-client');
const { criarServidor } = require('../server/index.js');

function subir() {
  const srv = criarServidor();
  return new Promise((ok) => srv.servidorHttp.listen(0, () => ok({ ...srv, url: 'http://localhost:' + srv.servidorHttp.address().port })));
}

function cliente(url) {
  const s = conectar(url, { transports: ['websocket'], forceNew: true });
  s.ultimo = null;
  s.on('estado', (e) => { s.ultimo = e; });
  s.pedir = (evento, dados) => new Promise((ok) => s.emit(evento, dados, ok));
  s.esperarEstado = (cond) => new Promise((ok) => {
    if (s.ultimo && cond(s.ultimo)) return ok(s.ultimo);
    const f = (e) => { if (cond(e)) { s.off('estado', f); ok(e); } };
    s.on('estado', f);
  });
  return s;
}

function get(url) {
  return new Promise((ok) => http.get(url, (res) => { res.resume(); ok(res.statusCode); }));
}

test('serve só os arquivos do jogo', async (t) => {
  const srv = await subir();
  t.after(() => srv.io.close());
  assert.equal(await get(srv.url + '/'), 200);
  assert.equal(await get(srv.url + '/js/Game.js'), 200);
  assert.equal(await get(srv.url + '/style.css'), 200);
  assert.equal(await get(srv.url + '/server/index.js'), 404);
  assert.equal(await get(srv.url + '/package.json'), 404);
  assert.equal(await get(srv.url + '/js/../server/Salas.js'), 404);
  assert.equal(await get(srv.url + '/socket.io/socket.io.js'), 200);
});

test('três aparelhos jogam: segredo só para o dador, permissões e reconexão', async (t) => {
  const srv = await subir();
  const a = cliente(srv.url), b = cliente(srv.url), c = cliente(srv.url);
  t.after(() => { for (const s of [a, b, c]) s.close(); srv.io.close(); });

  const criado = await a.pedir('criar', { nome: 'Ana', token: 'tokA' });
  assert.ok(criado.ok);
  assert.equal((await b.pedir('entrar', { codigo: criado.codigo.toLowerCase(), nome: 'Bia', token: 'tokB' })).ok, true);
  assert.equal((await c.pedir('entrar', { codigo: criado.codigo, nome: 'Caio', token: 'tokC' })).ok, true);
  assert.equal((await c.pedir('entrar', { codigo: 'ZZZZ', nome: 'X', token: 'x' })).ok, false);
  await a.esperarEstado((e) => e.sala.jogadores.length === 3);

  assert.equal((await b.pedir('iniciar')).ok, false); // só o anfitrião
  assert.ok((await a.pedir('iniciar')).ok);
  const estados = await Promise.all([a, b, c].map((s) => s.esperarEstado((e) => e.jogo)));
  const iDador = estados.findIndex((e) => e.sala.dadorId === e.sala.euId);
  assert.ok(iDador >= 0);
  estados.forEach((e, i) => assert.equal(!!e.jogo.coordenadaSecreta, i === iDador));

  const dador = [a, b, c][iDador];
  const outro = [a, b, c][(iDador + 1) % 3];
  const segredo = estados[iDador].jogo.coordenadaSecreta;
  assert.equal((await outro.pedir('acao', { acao: { tipo: 'DAR_PISTA', pista: 'azqxw' } })).ok, false);
  assert.ok((await dador.pedir('acao', { acao: { tipo: 'DAR_PISTA', pista: 'azqxw' } })).ok);
  await outro.esperarEstado((e) => e.jogo.fase === 'palpite' && e.jogo.pista === 'azqxw');
  assert.equal((await dador.pedir('acao', { acao: { tipo: 'CHUTAR', coordenada: segredo } })).ok, false);
  assert.ok((await outro.pedir('acao', { acao: { tipo: 'CHUTAR', coordenada: segredo } })).ok);
  const depois = await a.esperarEstado((e) => e.jogo.historico.length === 1);
  assert.equal(depois.jogo.acertos, 1);
  assert.notEqual(depois.sala.dadorId, estados[iDador].sala.euId); // a vez girou

  // Bia recarrega a página: some, volta com o mesmo token e continua no mesmo lugar.
  const idBia = estados[1].sala.euId;
  b.close();
  await a.esperarEstado((e) => e.sala.jogadores.find((j) => j.id === idBia).online === false);
  const b2 = cliente(srv.url);
  t.after(() => b2.close());
  assert.ok((await b2.pedir('entrar', { codigo: criado.codigo, token: 'tokB' })).ok);
  const deVolta = await b2.esperarEstado((e) => e.jogo);
  assert.equal(deVolta.sala.euId, idBia);
  assert.equal(deVolta.sala.jogadores.length, 3);
  assert.equal(deVolta.jogo.historico.length, 1);
});
