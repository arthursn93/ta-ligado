// Testes dos logs: bloqueios contra abuso agrupados por minuto, erros fatais e dados sensíveis. Rodar com: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { io: conectar } = require('socket.io-client');
const { criarServidor, LIMITES } = require('../server/index.js');
const { criarLog, criarContador, registrarErrosFatais } = require('../server/log.js');

function capturarLog() {
  const linhas = [];
  const log = criarLog((linha, ehErro) => linhas.push({ dados: JSON.parse(linha), texto: linha, ehErro }));
  log.linhas = linhas;
  log.evento = (nome) => linhas.filter((l) => l.dados.evento === nome).map((l) => l.dados);
  return log;
}

function subir(opcoes) {
  const log = capturarLog();
  const srv = criarServidor(Object.assign({ log }, opcoes));
  return new Promise((ok) => srv.servidorHttp.listen(0, () => ok({ ...srv, log, url: 'http://localhost:' + srv.servidorHttp.address().port })));
}

function cliente(url, extras) {
  const s = conectar(url, Object.assign({ transports: ['websocket'], forceNew: true, reconnection: false }, extras));
  s.pedir = (evento, dados) => new Promise((ok) => s.emit(evento, dados, ok));
  s.resultado = new Promise((ok) => { s.once('connect', () => ok(true)); s.once('connect_error', () => ok(false)); });
  return s;
}

test('os limites de proteção continuam com os mesmos números', () => {
  assert.deepEqual(LIMITES, {
    conexoes: 60,
    criar: { vezes: 10, janelaMs: 60000 },
    entrarErrado: { vezes: 10, janelaMs: 60000 },
    perfil: { vezes: 30, janelaMs: 60000 }
  });
});

test('cada limite atingido entra na contagem agrupada, sem nomes, códigos, tokens ou IPs', async () => {
  const armazem = { perfil: async () => ({}), selo: async () => null, fechar: async () => {} };
  const srv = await subir({
    armazem,
    intervaloLimitesMs: 10 * 60 * 1000, // a linha sai no desligamento, abaixo
    limites: { conexoes: 3, criar: { vezes: 1, janelaMs: 60000 }, entrarErrado: { vezes: 1, janelaMs: 60000 }, perfil: { vezes: 1, janelaMs: 60000 } }
  });
  const a = cliente(srv.url), b = cliente(srv.url);
  await Promise.all([a.resultado, b.resultado]);

  const criado = await a.pedir('criar', { nome: 'Ana Souza', token: 'token-secreto-ana' });
  assert.ok(criado.ok);
  assert.equal((await a.pedir('criar', { nome: 'Ana Souza', token: 'token-secreto-ana' })).ok, false); // criar
  await b.pedir('entrar', { codigo: 'ZZZZ', nome: 'Bia Lima', token: 'token-secreto-bia' });
  assert.match((await b.pedir('entrar', { codigo: 'ZZZZ', nome: 'Bia Lima', token: 'token-secreto-bia' })).erro, /Muitas tentativas/); // entrar
  assert.ok((await a.pedir('perfil', { token: 'token-secreto-ana' })).ok);
  assert.equal((await a.pedir('perfil', { token: 'token-secreto-ana' })).ok, false); // perfil
  const chat = [];
  for (let i = 0; i < 7; i++) chat.push((await a.pedir('chat', { texto: 'oi Bia ' + i })).ok);
  assert.deepEqual(chat, [true, true, true, true, true, true, false]); // chat
  const estranho = cliente(srv.url, { extraHeaders: { Origin: 'https://site-estranho.com' } });
  assert.equal(await estranho.resultado, false); // origem
  const c = cliente(srv.url);
  assert.equal(await c.resultado, true);
  const d = cliente(srv.url);
  assert.equal(await d.resultado, false); // conexoes (limite de 3)

  assert.equal(srv.log.evento('limites_atingidos').length, 0, 'nada antes do fim do intervalo');
  await srv.encerrar('SIGTERM');
  const linhas = srv.log.evento('limites_atingidos');
  assert.equal(linhas.length, 1);
  const { hora, ...resto } = linhas[0];
  assert.deepEqual(resto, { nivel: 'aviso', evento: 'limites_atingidos', segundos: 600, criar: 1, entrar: 1, perfil: 1, chat: 1, origem: 1, conexoes: 1 });

  const tudo = srv.log.linhas.map((l) => l.texto).join('\n');
  for (const proibido of ['Ana', 'Bia', 'Souza', criado.codigo, 'token-secreto', 'oi Bia', '127.0.0.1', '::1', 'localhost', 'site-estranho']) {
    assert.equal(tudo.includes(proibido), false, 'o log contém "' + proibido + '"');
  }
  for (const s of [a, b, c, d, estranho]) s.close();
});

test('mil bloqueios seguidos viram uma linha só por intervalo, e nenhuma quando não há bloqueio', async () => {
  const log = capturarLog();
  const contador = criarContador(log, 'limites_atingidos', ['criar', 'entrar'], 100);
  for (let i = 0; i < 1000; i++) contador.contar(i % 2 ? 'criar' : 'entrar');
  await new Promise((ok) => setTimeout(ok, 350)); // três intervalos
  contador.parar();
  assert.equal(log.linhas.length, 1);
  assert.equal(log.linhas[0].dados.criar, 500);
  assert.equal(log.linhas[0].dados.entrar, 500);
  assert.equal(log.linhas[0].ehErro, false);
});

test('tipo fora da lista vira "outro": a memória do contador não cresce', () => {
  const log = capturarLog();
  const contador = criarContador(log, 'limites_atingidos', ['criar'], 60000);
  for (let i = 0; i < 100; i++) contador.contar('qualquer-coisa-' + i);
  contador.parar();
  const { hora, ...resto } = log.linhas[0].dados;
  assert.deepEqual(resto, { nivel: 'aviso', evento: 'limites_atingidos', segundos: 60, outro: 100 });
});

test('log que falha ao escrever não derruba quem chamou', () => {
  const log = criarLog(() => { throw new Error('disco cheio'); });
  assert.doesNotThrow(() => log.info('servidor_iniciado', {}));
  assert.doesNotThrow(() => log.erro('erro_evento', new Error('x')));
  const contador = criarContador(log, 'limites_atingidos', ['criar'], 60000);
  contador.contar('criar');
  assert.doesNotThrow(() => contador.parar());
});

test('erro fatal: uma linha JSON e saída com código 1, mesmo se o log falhar', () => {
  const EventEmitter = require('events');
  for (const quebrado of [false, true]) {
    const processo = new EventEmitter();
    const saidas = [];
    processo.exit = (codigo) => saidas.push(codigo);
    const log = capturarLog();
    if (quebrado) log.erro = () => { throw new Error('log quebrado'); };
    registrarErrosFatais(processo, log);
    processo.emit('uncaughtException', new Error('caiu ao ligar em postgres://u:senha@ep-x.neon.tech/neondb'));
    processo.emit('unhandledRejection', 'promessa sem tratamento');
    assert.deepEqual(saidas, [1, 1]);
    if (!quebrado) {
      assert.equal(log.linhas.length, 1, 'só o primeiro erro é registrado');
      assert.equal(log.linhas[0].ehErro, true);
      assert.equal(log.linhas[0].dados.evento, 'erro_fatal');
      assert.equal(log.linhas[0].dados.tipo, 'excecao');
      assert.equal(log.linhas[0].dados.mensagem, 'caiu ao ligar em [endereço]');
    }
  }
});

/** Sobe o servidor de verdade com um arquivo que provoca o erro depois que ele liga. */
async function processoQueCai(codigoDoErro) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'ta-ligado-fatal-'));
  const provocar = path.join(pasta, 'provocar.js');
  fs.writeFileSync(provocar, 'setTimeout(() => { ' + codigoDoErro + ' }, 300);\n');
  const net = require('net');
  const porta = await new Promise((ok) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => ok(p)); }); });
  const env = Object.assign({}, process.env, { PORT: String(porta) });
  delete env.DATABASE_URL;
  const filho = spawn(process.execPath, ['-r', provocar, path.join(__dirname, '../server/index.js')], { env });
  let saida = '', erros = '';
  filho.stdout.on('data', (d) => { saida += d; });
  filho.stderr.on('data', (d) => { erros += d; });
  const codigo = await new Promise((ok) => filho.once('exit', ok));
  fs.rmSync(pasta, { recursive: true, force: true });
  return { codigo, saida, erros };
}

test('processo de verdade: exceção não tratada vira erro_fatal em JSON e sai com código 1', async () => {
  const r = await processoQueCai("throw new Error('falhou com 10.1.2.3 e postgres://u:p@h/db');");
  assert.equal(r.codigo, 1);
  assert.match(r.saida, /"evento":"servidor_iniciado"/);
  const linhas = r.erros.trim().split('\n');
  assert.equal(linhas.length, 1, 'só a linha JSON, sem o texto solto do Node: ' + r.erros);
  const fatal = JSON.parse(linhas[0]);
  assert.equal(fatal.evento, 'erro_fatal');
  assert.equal(fatal.tipo, 'excecao');
  assert.equal(fatal.mensagem, 'falhou com [ip] e [endereço]');
});

test('processo de verdade: promessa rejeitada sem tratamento também sai com código 1', async () => {
  const r = await processoQueCai("Promise.reject(new Error('sem catch'));");
  assert.equal(r.codigo, 1);
  const fatal = JSON.parse(r.erros.trim());
  assert.equal(fatal.evento, 'erro_fatal');
  assert.equal(fatal.tipo, 'promessa_rejeitada');
  assert.equal(fatal.mensagem, 'sem catch');
});
