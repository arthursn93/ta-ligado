// Testes do desligamento (SIGTERM do Render): aviso aos aparelhos e logs. Rodar com: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { io: conectar } = require('socket.io-client');
const { criarServidor } = require('../server/index.js');
const { criarLog, limparTexto } = require('../server/log.js');

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

/** `confirma: false` simula um aparelho que não recebe o aviso (ou não responde a tempo). */
function cliente(url, confirma) {
  const s = conectar(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  s.avisos = 0;
  if (confirma !== false) s.on('servidor:reiniciando', (ok) => { s.avisos++; ok(); });
  s.pedir = (evento, dados) => new Promise((ok) => s.emit(evento, dados, ok));
  s.conectado = new Promise((ok) => s.once('connect', ok));
  s.caiu = new Promise((ok) => s.once('disconnect', ok));
  return s;
}

async function salaComPartida(url) {
  const a = cliente(url), b = cliente(url);
  const criado = await a.pedir('criar', { nome: 'Ana Souza', token: 'token-secreto-ana' });
  await b.pedir('entrar', { codigo: criado.codigo, nome: 'Bia Lima', token: 'token-secreto-bia' });
  assert.ok((await a.pedir('iniciar')).ok);
  return { a, b, codigo: criado.codigo };
}

test('desligamento: os aparelhos recebem o aviso e o log conta salas, jogadores e partidas', async () => {
  const srv = await subir({ esperaAviso: 2000 });
  const { a, b } = await salaComPartida(srv.url);
  const inicio = Date.now();
  await srv.encerrar('SIGTERM');

  assert.equal(a.avisos, 1);
  assert.equal(b.avisos, 1);
  assert.deepEqual(srv.log.evento('encerramento_recebido').map(({ hora, ...d }) => d),
    [{ nivel: 'info', evento: 'encerramento_recebido', sinal: 'SIGTERM', salas: 1, jogadores: 2, partidas: 1 }]);
  const aviso = srv.log.evento('aviso_reinicio')[0];
  assert.equal(aviso.aparelhos, 2);
  assert.equal(aviso.confirmaram, 2);
  assert.equal(srv.log.evento('encerramento_concluido').length, 1);
  // Todos confirmaram: não espera o limite de 2 s.
  assert.ok(Date.now() - inicio < 1000, 'demorou ' + (Date.now() - inicio) + ' ms');
  await Promise.all([a.caiu, b.caiu]);
});

test('logs não levam nomes, códigos de sala, tokens nem IPs', async () => {
  const srv = await subir();
  const { a, b, codigo } = await salaComPartida(srv.url);
  a.emit('acao', 'quebrado', () => {});
  await srv.encerrar('SIGTERM');
  await Promise.all([a.caiu, b.caiu]);

  const tudo = srv.log.linhas.map((l) => l.texto).join('\n');
  assert.ok(srv.log.evento('sala_criada').length === 1 && srv.log.evento('partida_iniciada').length === 1);
  for (const proibido of ['Ana', 'Bia', 'Souza', codigo, 'token-secreto', '127.0.0.1', '::1', 'localhost']) {
    assert.equal(tudo.includes(proibido), false, 'o log contém "' + proibido + '"');
  }
  for (const l of srv.log.linhas) assert.doesNotThrow(() => JSON.parse(l.texto));
});

test('aparelho que não confirma o aviso não trava o desligamento', async () => {
  const srv = await subir({ esperaAviso: 300 });
  const ok = cliente(srv.url), mudo = cliente(srv.url, false);
  await Promise.all([ok.conectado, mudo.conectado]);
  const inicio = Date.now();
  await srv.encerrar('SIGTERM');
  const ms = Date.now() - inicio;

  assert.equal(ok.avisos, 1);
  const aviso = srv.log.evento('aviso_reinicio')[0];
  assert.equal(aviso.aparelhos, 2);
  assert.equal(aviso.confirmaram, 1);
  assert.ok(ms >= 250 && ms < 1000, 'demorou ' + ms + ' ms');
  assert.equal(srv.log.evento('encerramento_concluido').length, 1);
  await Promise.all([ok.caiu, mudo.caiu]);
});

test('se o aviso não puder ser enviado, o servidor desliga mesmo assim', async () => {
  const srv = await subir();
  const a = cliente(srv.url);
  await a.conectado;
  srv.io.timeout = () => { throw new Error('falha ao enviar'); };
  await srv.encerrar('SIGTERM');

  assert.equal(a.avisos, 0);
  const erro = srv.log.evento('erro_aviso_reinicio')[0];
  assert.equal(erro.nivel, 'erro');
  assert.equal(erro.mensagem, 'falha ao enviar');
  assert.equal(srv.log.linhas.find((l) => l.dados.evento === 'erro_aviso_reinicio').ehErro, true);
  assert.equal(srv.log.evento('aviso_reinicio')[0].confirmaram, 0);
  assert.equal(srv.log.evento('encerramento_concluido').length, 1);
  await a.caiu; // as conexões foram fechadas
});

test('sem ninguém conectado, desliga sem esperar; chamar de novo não repete o desligamento', async () => {
  const srv = await subir({ esperaAviso: 2000 });
  const inicio = Date.now();
  const primeiro = srv.encerrar('SIGTERM');
  assert.equal(srv.encerrar('SIGTERM'), primeiro);
  await primeiro;
  assert.ok(Date.now() - inicio < 200);
  assert.equal(srv.log.evento('encerramento_recebido').length, 1);
  assert.deepEqual(srv.log.evento('aviso_reinicio')[0].aparelhos, 0);
});

test('partida em andamento continua sem ser gravada no desligamento, e o banco é fechado', async () => {
  let gravadas = 0, fechado = false;
  const armazem = {
    gravarPartida: async () => { gravadas++; return { gravada: true, jogadores: [] }; },
    selo: async () => null,
    fechar: async () => { fechado = true; }
  };
  const srv = await subir({ armazem });
  const { a, b } = await salaComPartida(srv.url);
  await srv.encerrar('SIGTERM');
  await Promise.all([a.caiu, b.caiu]);
  assert.equal(gravadas, 0);
  assert.equal(fechado, true);
  assert.equal(srv.log.evento('partida_encerrada').length, 0);
});

test('o navegador (Rede.js) mostra o aviso e confirma o recebimento', async () => {
  const srv = await subir({ esperaAviso: 2000 });
  const guardado = {};
  const janela = {
    localStorage: { getItem: (k) => guardado[k] || null, setItem: (k, v) => { guardado[k] = v; }, removeItem: (k) => { delete guardado[k]; } },
    crypto: { randomUUID: () => 'token-do-navegador' }
  };
  const Rede = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/Rede.js'), 'utf8') + '\nRede', { window: janela, Promise });
  const socket = conectar(srv.url, { transports: ['websocket'], forceNew: true, reconnection: false });
  const rede = Rede.criar(socket);
  await new Promise((ok) => socket.once('connect', ok));
  assert.ok((await rede.criarSala('Ana')).ok);
  let avisado = false;
  rede.assinar(() => { if (rede.reiniciando()) avisado = true; });
  assert.equal(rede.reiniciando(), false);

  await srv.encerrar('SIGTERM');
  assert.equal(avisado, true);
  assert.equal(rede.reiniciando(), true);
  assert.equal(srv.log.evento('aviso_reinicio')[0].confirmaram, 1);
  socket.close();
});

test('limparTexto tira endereços com senha e segredos das mensagens de erro', () => {
  assert.equal(limparTexto('falhou em postgresql://usuario:senha123@ep-x.neon.tech/neondb?sslmode=verify-full agora'),
    'falhou em [endereço] agora');
  assert.equal(limparTexto('password=abc123 token=xyz'), 'password=[oculto] token=[oculto]');
  assert.equal(limparTexto('x'.repeat(1000)).length, 300);
  assert.equal(limparTexto(undefined), '');
});

test('erros vão para o canal de erro, com a mensagem limpa', () => {
  const log = capturarLog();
  log.erro('erro_conexao_banco', new Error('sem acesso a postgres://u:p@host/db'));
  log.info('servidor_iniciado', { porta: 3000 });
  assert.equal(log.linhas[0].ehErro, true);
  assert.equal(log.linhas[0].dados.mensagem, 'sem acesso a [endereço]');
  assert.ok(Array.isArray(log.linhas[0].dados.pilha));
  assert.equal(log.linhas[1].ehErro, false);
  assert.equal(log.linhas[1].dados.porta, 3000);
});

test('processo de verdade: SIGTERM avisa o aparelho, registra os logs e sai com código 0', async () => {
  const { spawn } = require('child_process');
  const net = require('net');
  const porta = await new Promise((ok) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => ok(p)); }); });
  const env = Object.assign({}, process.env, { PORT: String(porta) });
  delete env.DATABASE_URL;
  const filho = spawn(process.execPath, [path.join(__dirname, '../server/index.js')], { env });
  let saida = '';
  filho.stdout.on('data', (d) => { saida += d; });
  filho.stderr.on('data', (d) => { saida += d; });
  const saiu = new Promise((ok) => filho.once('exit', (codigo) => ok(codigo)));
  try {
    while (!saida.includes('servidor_iniciado')) await new Promise((ok) => setTimeout(ok, 20));
    const a = cliente('http://localhost:' + porta);
    await a.pedir('criar', { nome: 'Ana', token: 'token-ana' });
    const inicio = Date.now();
    filho.kill('SIGTERM');
    assert.equal(await saiu, 0);
    assert.ok(Date.now() - inicio < 2000, 'demorou ' + (Date.now() - inicio) + ' ms');
    assert.equal(a.avisos, 1);
    const eventos = saida.trim().split('\n').map((l) => JSON.parse(l).evento);
    assert.deepEqual(eventos, ['servidor_iniciado', 'sala_criada', 'encerramento_recebido', 'aviso_reinicio', 'encerramento_concluido']);
    a.close();
  } finally {
    filho.kill('SIGKILL');
  }
});
