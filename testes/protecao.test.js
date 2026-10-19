// Testes das proteções do servidor (limites, erros, cabeçalhos). Rodar com: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { io: conectar } = require('socket.io-client');
const { criarServidor, arquivoPublico, origemPermitida } = require('../server/index.js');

function subir(opcoes) {
  const srv = criarServidor(opcoes);
  return new Promise((ok) => srv.servidorHttp.listen(0, () => ok({ ...srv, porta: srv.servidorHttp.address().port, url: 'http://localhost:' + srv.servidorHttp.address().port })));
}

function cliente(url, extras) {
  const s = conectar(url, Object.assign({ transports: ['websocket'], forceNew: true, reconnection: false }, extras));
  s.pedir = (evento, dados) => new Promise((ok) => s.emit(evento, dados, ok));
  return s;
}

function pedirHttp(porta, caminho, cabecalhos) {
  return new Promise((ok, falhou) => {
    const req = http.request({ host: 'localhost', port: porta, path: caminho, headers: cabecalhos || {} }, (res) => {
      const partes = [];
      res.on('data', (p) => partes.push(p));
      res.on('end', () => ok({ status: res.statusCode, headers: res.headers, corpo: Buffer.concat(partes) }));
    });
    req.on('error', falhou);
    req.end();
  });
}

test('URL malformada dá 404 e o servidor continua de pé', async (t) => {
  const srv = await subir();
  t.after(() => srv.io.close());
  assert.equal(arquivoPublico('/%E0%A4%A'), null);
  assert.equal((await pedirHttp(srv.porta, '/%E0%A4%A')).status, 404);
  assert.equal((await pedirHttp(srv.porta, '/saude')).status, 200);
});

test('arquivos novos, compressão e cabeçalhos de segurança', async (t) => {
  const srv = await subir();
  t.after(() => srv.io.close());
  for (const arquivo of ['/privacidade.html', '/favicon.svg', '/icone-180.png', '/previa.png', '/socket.io/socket.io.min.js']) {
    assert.equal((await pedirHttp(srv.porta, arquivo)).status, 200, arquivo);
  }
  const pagina = await pedirHttp(srv.porta, '/', { 'Accept-Encoding': 'gzip', 'X-Forwarded-Proto': 'https' });
  assert.equal(pagina.headers['content-encoding'], 'gzip');
  assert.match(pagina.headers['content-security-policy'], /default-src 'self'/);
  assert.equal(pagina.headers['x-content-type-options'], 'nosniff');
  const html = require('zlib').gunzipSync(pagina.corpo).toString('utf8');
  assert.ok(html.includes('https://localhost:' + srv.porta + '/previa.png'), 'prévia com endereço completo');
  assert.ok(!html.includes('{{ORIGEM}}'));
  const semGzip = await pedirHttp(srv.porta, '/style.css');
  assert.equal(semGzip.headers['content-encoding'], undefined);
});

test('origem: aceita o próprio site e as liberadas, recusa as outras', async (t) => {
  const req = (origin) => ({ headers: { host: 'ta-ligado.onrender.com', origin } });
  assert.ok(origemPermitida(req(undefined), {}));
  assert.ok(origemPermitida(req('https://ta-ligado.onrender.com'), {}));
  assert.ok(!origemPermitida(req('https://site-estranho.com'), {}));
  assert.ok(origemPermitida(req('capacitor://localhost'), { ORIGENS_PERMITIDAS: 'https://x.com, capacitor://localhost' }));

  const srv = await subir();
  t.after(() => srv.io.close());
  const estranho = cliente(srv.url, { extraHeaders: { Origin: 'https://site-estranho.com' } });
  const erro = await new Promise((ok) => { estranho.on('connect_error', ok); estranho.on('connect', () => ok(null)); });
  estranho.close();
  assert.ok(erro, 'conexão de outro site devia ser recusada');
  const proprio = cliente(srv.url, { extraHeaders: { Origin: srv.url } });
  await new Promise((ok, falhou) => { proprio.on('connect', ok); proprio.on('connect_error', falhou); });
  proprio.close();
});

test('token gigante é recusado', async (t) => {
  const srv = await subir();
  const a = cliente(srv.url);
  t.after(() => { a.close(); srv.io.close(); });
  assert.equal((await a.pedir('criar', { nome: 'Ana', token: 'x'.repeat(500) })).ok, false);
  assert.equal((await a.pedir('criar', { nome: 'Ana', token: { a: 1 } })).ok, false);
  assert.equal((await a.pedir('criar', { nome: 'Ana', token: 'tokA' })).ok, true);
});

test('limites: salas criadas, códigos errados e conexões por IP', async (t) => {
  const srv = await subir({ limites: { conexoes: 3, criar: { vezes: 2, janelaMs: 60000 }, entrarErrado: { vezes: 3, janelaMs: 60000 } } });
  const a = cliente(srv.url), b = cliente(srv.url);
  t.after(() => { a.close(); b.close(); srv.io.close(); });

  const sala = await a.pedir('criar', { nome: 'Ana', token: 'tA' });
  assert.ok(sala.ok);
  assert.ok((await a.pedir('criar', { nome: 'Ana', token: 'tA' })).ok);
  const terceira = await a.pedir('criar', { nome: 'Ana', token: 'tA' });
  assert.equal(terceira.ok, false);
  assert.match(terceira.erro, /Espere/);

  for (let i = 0; i < 3; i++) assert.equal((await b.pedir('entrar', { codigo: 'ZZZZ', nome: 'Bia', token: 'tB' })).ok, false);
  const bloqueado = await b.pedir('entrar', { codigo: 'ZZZZ', nome: 'Bia', token: 'tB' });
  assert.match(bloqueado.erro, /Muitas tentativas/);

  // Terceira conexão ainda cabe, a quarta não.
  const c = cliente(srv.url);
  await new Promise((ok, falhou) => { c.on('connect', ok); c.on('connect_error', falhou); });
  const d = cliente(srv.url);
  const erro = await new Promise((ok) => { d.on('connect_error', ok); d.on('connect', () => ok(null)); });
  c.close(); d.close();
  assert.ok(erro, 'quarta conexão do mesmo IP devia ser recusada');
});

test('erro inesperado num evento não derruba o servidor', async (t) => {
  const srv = await subir();
  const a = cliente(srv.url);
  t.after(() => { a.close(); srv.io.close(); });
  const original = srv.salas.criarSala;
  srv.salas.criarSala = () => { throw new Error('falha de teste'); };
  const erroLog = console.error;
  console.error = () => {};
  const r = await a.pedir('criar', { nome: 'Ana', token: 'tA' });
  console.error = erroLog;
  srv.salas.criarSala = original;
  assert.equal(r.ok, false);
  assert.match(r.erro, /Algo deu errado/);
  assert.ok((await a.pedir('criar', { nome: 'Ana', token: 'tA' })).ok);
});
