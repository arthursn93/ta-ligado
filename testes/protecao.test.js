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
  for (const arquivo of ['/privacidade.html', '/privacidade-en.html', '/privacidade-es.html', '/favicon.svg', '/icone-180.png', '/previa.png', '/previa-2.png', '/socket.io/socket.io.min.js']) {
    assert.equal((await pedirHttp(srv.porta, arquivo)).status, 200, arquivo);
  }
  const pagina = await pedirHttp(srv.porta, '/', { 'Accept-Encoding': 'gzip', 'X-Forwarded-Proto': 'https' });
  assert.equal(pagina.headers['content-encoding'], 'gzip');
  assert.match(pagina.headers['content-security-policy'], /default-src 'self'/);
  assert.equal(pagina.headers['x-content-type-options'], 'nosniff');
  const html = require('zlib').gunzipSync(pagina.corpo).toString('utf8');
  assert.ok(html.includes('https://localhost:' + srv.porta + '/previa-2.png'), 'prévia com endereço completo');
  assert.ok(!html.includes('{{ORIGEM}}'));
  const semGzip = await pedirHttp(srv.porta, '/style.css');
  assert.equal(semGzip.headers['content-encoding'], undefined);
});

test('fontes: servidas pelo próprio jogo, guardadas por um ano, sem Google Fonts', async (t) => {
  const srv = await subir();
  t.after(() => srv.io.close());
  for (const fonte of ['/fontes/nunito.woff2', '/fontes/chewy.woff2']) {
    const r = await pedirHttp(srv.porta, fonte, { 'Accept-Encoding': 'gzip' });
    assert.equal(r.status, 200, fonte);
    assert.equal(r.headers['content-type'], 'font/woff2');
    assert.match(r.headers['cache-control'], /max-age=31536000/);
    assert.equal(r.headers['content-encoding'], undefined, 'woff2 já vem comprimido');
    assert.equal(r.corpo.subarray(0, 4).toString('latin1'), 'wOF2');
  }
  for (const fora of ['/fontes/LEIAME.md', '/fontes/LICENCA-nunito.txt', '/fontes/../server/index.js', '/fontes/x.woff2']) {
    assert.equal((await pedirHttp(srv.porta, fora)).status, 404, fora);
  }
  const pagina = await pedirHttp(srv.porta, '/');
  assert.match(pagina.headers['content-security-policy'], /font-src 'self'/);
  assert.doesNotMatch(pagina.headers['content-security-policy'], /google/);
  assert.equal(pagina.headers['cache-control'], 'no-cache', 'páginas continuam sem cache');
  const fs = require('fs');
  const path = require('path');
  for (const arquivo of ['index.html', 'style.css', 'privacidade.html', 'privacidade-en.html', 'privacidade-es.html']) {
    assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', arquivo), 'utf8'), /fonts\.(googleapis|gstatic)\.com/, arquivo);
  }
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

test('prévia do link: 1200×630, menos de 300 KB, e a pista aparece em maiúsculas', () => {
  const fs = require('fs');
  const path = require('path');
  const png = fs.readFileSync(path.join(__dirname, '..', 'previa-2.png'));
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
  assert.ok(png.length < 300 * 1024, png.length + ' bytes');
  const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
  assert.match(css, /#campo-pista, \.faixa-palavra, \.celula-pista, \.cab-palavra,\n\.painel-palavras span, \.dador-palavra b, \.pista-dada \{ text-transform: uppercase; \}/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'js', 'UI.js'), 'utf8'), /id="campo-pista"[^>]*autocapitalize="characters"/);
});

test('coordenada secreta: palavra comprida vira letreiro dentro do retângulo, sem aumentá-lo', () => {
  const fs = require('fs');
  const path = require('path');
  const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
  const ui = fs.readFileSync(path.join(__dirname, '..', 'js', 'UI.js'), 'utf8');
  // Cada palavra vai num <span class="letreiro"> dentro do retângulo, que continua cortando o que sobra.
  assert.equal((ui.match(/<b><span class="letreiro">' \+ esc\(p\.(coluna|linha)\) \+ '<\/span><\/b>/g) || []).length, 2);
  assert.match(css, /\.dador-palavra b \{\n  display: inline-block;\n  max-width: 100%;[\s\S]*?overflow: hidden;/);
  assert.match(css, /\.dador-palavra b\.is-letreiro \{ text-overflow: clip; text-align: left; \}/);
  // Só anima o que não cabe, espera 700 ms e respeita "reduzir movimento".
  assert.match(ui, /var sobra = caixa\.scrollWidth - caixa\.clientWidth;\n\s*if \(parado \|\| sobra <= 1 \|\| !texto\.animate\) return;/);
  assert.match(ui, /var espera = 700,/);
  assert.match(ui, /prefers-reduced-motion: reduce\)'\)\.matches;\n\s*Array\.prototype\.forEach\.call\(el\.modal\.querySelectorAll\('\.dador-palavra b'\)/);
  // As palavras continuam lado a lado; só em telas de até 340px os botões ficam mais juntos.
  assert.doesNotMatch(css, /\.dador-palavras \{ flex-direction: column/);
  assert.match(css, /@media \(max-width: 340px\) \{[^}]*\.form-pista \.acoes \{ gap: 6px; \}\n  \.form-pista \.acoes \.botao \{ padding-left: 12px; padding-right: 12px; \}/);
});

test('privacidade: conta backup, prazo, onde ficam os dados, direitos e responsável', () => {
  const fs = require('fs');
  const path = require('path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'privacidade.html'), 'utf8');
  for (const trecho of [
    'guardada por 30 dias no GitHub',
    'sem prazo para acabar',
    'sem IP, nome nem código de sala',
    '<strong>Neon</strong>',
    'Oregon, nos Estados Unidos',
    '<h2>Seus direitos</h2>',
    'são <strong>públicas</strong>',
    'por até 30 dias',
    '<h2>Responsável e contato</h2>',
    'mantido por <strong>arthursn93</strong>',
    'https://github.com/arthursn93/ta-ligado/issues',
    'mailto:ta.ligado.games.2026@gmail.com',
    '<strong>Apagar meus dados</strong>',
    'cor do tabuleiro'
  ]) assert.ok(html.includes(trecho), 'falta: ' + trecho);
  // As versões em inglês e espanhol têm as mesmas partes, os mesmos links e o nome certo do botão.
  const titulos = (h) => (h.match(/<h2>/g) || []).length;
  const links = (h) => [...new Set((h.match(/href="[^"]+"/g) || []).filter((l) => !l.includes('?idioma=') && l !== 'href="/"'))].sort();
  for (const [idioma, botao] of [['en', 'Delete my data'], ['es', 'Borrar mis datos']]) {
    const traducao = fs.readFileSync(path.join(__dirname, '..', 'privacidade-' + idioma + '.html'), 'utf8');
    assert.ok(traducao.includes('<html lang="' + idioma + '">'), idioma);
    assert.equal(titulos(traducao), titulos(html), idioma);
    assert.deepEqual(links(traducao), links(html), idioma);
    assert.ok(traducao.includes('<strong>' + botao + '</strong>'), idioma);
    assert.equal(botao, require('../js/Textos' + (idioma === 'en' ? 'En' : 'Es') + '.js')['perfil.apagar']);
    for (const trecho of ['30', 'Oreg', 'arthursn93', 'US West 2']) assert.ok(traducao.includes(trecho), idioma + ' falta: ' + trecho);
  }
  // O prazo do backup na página é o mesmo do workflow.
  const backup = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'backup.yml'), 'utf8');
  assert.match(backup, /retention-days: 30\b/);
});
