/**
 * Servidor do Tá Ligado?: serve os arquivos do jogo e liga as salas ao Socket.io.
 *
 * Eventos do cliente (todos com resposta via ack):
 *   'criar'   {nome, token}          -> {ok, codigo} | {ok:false, erro}
 *   'entrar'  {codigo, nome, token}  -> {ok, codigo} | {ok:false, erro}
 *   'iniciar'                        -> {ok} | {ok:false, erro}
 *   'acao'    {acao}                 -> {ok} | {ok:false, erro}
 *   'sair'                           -> {ok}
 *   'chat'    {texto}                -> {ok} | {ok:false, erro}
 *   'voz:config'                     -> {iceServers}
 *   'voz:estado' {estado}            -> {ok}   estado: null | 'ouvindo' | 'mudo' | 'ligado'
 *   'voz:sinal'  {para, dados}       (oferta/resposta/candidato WebRTC para outro jogador da sala)
 * Eventos do servidor:
 *   'estado'        visão da sala e da partida do ponto de vista de cada jogador.
 *   'chat'          uma mensagem nova da sala.
 *   'chat:historico' as últimas mensagens, ao entrar.
 *   'voz:sinal'     {de, dados} sinal WebRTC vindo de outro jogador.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const { criarGerenciador } = require('./Salas.js');

const RAIZ = path.join(__dirname, '..');
const TEMPO_SALA_VAZIA_MS = 10 * 60 * 1000;
const TAMANHO_MAX_SINAL = 20000;

/**
 * Servidores para o WebRTC achar o caminho entre aparelhos. STUN público resolve a maioria das redes;
 * para redes mais fechadas (alguns 4G e redes de empresa), configure um TURN pelas variáveis
 * TURN_URL (ex.: "turn:turn.exemplo.com:3478"), TURN_USERNAME e TURN_CREDENTIAL.
 */
function servidoresIce(env) {
  const lista = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  if (env.TURN_URL) {
    lista.push({
      urls: env.TURN_URL.split(',').map((u) => u.trim()).filter(Boolean),
      username: env.TURN_USERNAME || '',
      credential: env.TURN_CREDENTIAL || ''
    });
  }
  return lista;
}

/** Só repassa ofertas, respostas e candidatos WebRTC bem formados e pequenos. */
function sinalValido(dados) {
  if (!dados || typeof dados !== 'object') return false;
  let tamanho;
  try { tamanho = JSON.stringify(dados).length; } catch (e) { return false; }
  if (tamanho > TAMANHO_MAX_SINAL) return false;
  if (dados.sdp) {
    return typeof dados.sdp === 'object' && (dados.sdp.type === 'offer' || dados.sdp.type === 'answer') &&
      typeof dados.sdp.sdp === 'string';
  }
  if ('candidato' in dados) return dados.candidato === null || typeof dados.candidato === 'object';
  return false;
}

// Só estes arquivos são servidos; nada do servidor nem do repositório vaza.
const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
function arquivoPublico(url) {
  const caminho = decodeURIComponent(url.split('?')[0]);
  if (caminho === '/' || caminho === '/index.html') return 'index.html';
  if (caminho === '/style.css') return 'style.css';
  const js = /^\/js\/([A-Za-z]+\.js)$/.exec(caminho);
  return js ? 'js/' + js[1] : null;
}

function criarServidor(opcoes) {
  opcoes = opcoes || {};
  const salas = criarGerenciador({ criarJogo: opcoes.criarJogo });
  const tempoSalaVazia = opcoes.tempoSalaVazia || TEMPO_SALA_VAZIA_MS;
  const iceServers = servidoresIce(opcoes.env || process.env);

  const servidorHttp = http.createServer((req, res) => {
    // Verificação de saúde da hospedagem (Render): responde rápido, sem tocar no disco.
    if (req.url === '/saude') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('ok');
      return;
    }
    const arquivo = arquivoPublico(req.url || '/');
    if (req.method !== 'GET' || !arquivo) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Não encontrado');
      return;
    }
    fs.readFile(path.join(RAIZ, arquivo), (err, conteudo) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Não encontrado');
        return;
      }
      res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arquivo)], 'Cache-Control': 'no-cache' });
      res.end(conteudo);
    });
  });

  const io = new Server(servidorHttp);

  /** Manda para cada aparelho da sala a visão dele. */
  function transmitir(sala) {
    if (!sala) return;
    for (const socket of io.sockets.adapter.rooms.get(sala.codigo) || []) {
      const s = io.sockets.sockets.get(socket);
      if (s) s.emit('estado', salas.visaoPara(sala, s.data.token));
    }
  }

  function responder(ack, resultado) {
    if (typeof ack === 'function') ack(resultado);
  }

  io.on('connection', (socket) => {
    function entrarNoCanal(sala, token) {
      if (socket.data.codigo && socket.data.codigo !== sala.codigo) sairDaSala();
      socket.data.codigo = sala.codigo;
      socket.data.token = token;
      socket.join(sala.codigo);
      socket.emit('chat:historico', salas.historicoChat(sala.codigo));
      transmitir(sala);
    }

    function sairDaSala() {
      const { codigo, token } = socket.data;
      if (!codigo) return;
      socket.leave(codigo);
      socket.data.codigo = null;
      salas.vozCaiu(codigo, socket.id);
      transmitir(salas.sair(codigo, token));
    }

    socket.on('criar', (dados, ack) => {
      dados = dados || {};
      const r = salas.criarSala(String(dados.token || ''), dados.nome);
      if (!r.ok) return responder(ack, r);
      responder(ack, { ok: true, codigo: r.sala.codigo });
      entrarNoCanal(r.sala, String(dados.token));
    });

    socket.on('entrar', (dados, ack) => {
      dados = dados || {};
      const r = salas.entrar(dados.codigo, String(dados.token || ''), dados.nome);
      if (!r.ok) return responder(ack, r);
      responder(ack, { ok: true, codigo: r.sala.codigo });
      entrarNoCanal(r.sala, String(dados.token));
    });

    socket.on('iniciar', (_dados, ack) => {
      if (typeof _dados === 'function') ack = _dados;
      const r = salas.iniciar(socket.data.codigo, socket.data.token);
      responder(ack, r.ok ? { ok: true } : r);
      if (r.ok) transmitir(r.sala);
    });

    socket.on('acao', (dados, ack) => {
      const r = salas.agir(socket.data.codigo, socket.data.token, dados && dados.acao);
      responder(ack, r.ok ? { ok: true } : { ok: false, erro: r.erro });
      if (r.ok) transmitir(r.sala);
    });

    socket.on('chat', (dados, ack) => {
      const r = salas.enviarMensagem(socket.data.codigo, socket.data.token, dados && dados.texto);
      responder(ack, r.ok ? { ok: true } : { ok: false, erro: r.erro });
      if (r.ok) io.to(r.sala.codigo).emit('chat', r.mensagem);
    });

    socket.on('voz:config', (_dados, ack) => {
      if (typeof _dados === 'function') ack = _dados;
      responder(ack, { iceServers });
    });

    socket.on('voz:estado', (dados, ack) => {
      const estado = dados && dados.estado !== undefined ? dados.estado : null;
      const r = salas.definirVoz(socket.data.codigo, socket.data.token, estado, socket.id);
      responder(ack, r.ok ? { ok: true } : { ok: false, erro: r.erro });
      if (r.ok) transmitir(r.sala);
    });

    socket.on('voz:sinal', (dados) => {
      if (!dados || typeof dados.para !== 'string' || !sinalValido(dados.dados)) return;
      const destino = salas.destinoDoSinal(socket.data.codigo, socket.data.token, dados.para);
      if (destino) io.to(destino.socketId).emit('voz:sinal', { de: destino.deId, dados: dados.dados });
    });

    socket.on('sair', (_dados, ack) => {
      if (typeof _dados === 'function') ack = _dados;
      sairDaSala();
      responder(ack, { ok: true });
    });

    socket.on('disconnect', () => {
      const { codigo, token } = socket.data;
      if (!codigo) return;
      const semVoz = salas.vozCaiu(codigo, socket.id);
      // Outro aparelho/aba com o mesmo token ainda conectado? Então a pessoa continua online.
      const aindaAqui = [...(io.sockets.adapter.rooms.get(codigo) || [])]
        .some((id) => io.sockets.sockets.get(id)?.data.token === token);
      if (aindaAqui) { transmitir(semVoz); return; }
      const sala = salas.desconectar(codigo, token);
      transmitir(sala);
      if (sala && sala.jogadores.every((j) => !j.online)) {
        setTimeout(() => salas.removerSeVazia(codigo), tempoSalaVazia).unref();
      }
    });
  });

  return { servidorHttp, io, salas };
}

module.exports = { criarServidor, servidoresIce, sinalValido };

if (require.main === module) {
  // Na hospedagem a porta vem de PORT; em casa, 3000.
  const porta = Number(process.env.PORT) || 3000;
  const { servidorHttp, io } = criarServidor();
  servidorHttp.listen(porta, () => {
    console.log('Tá Ligado? ouvindo na porta ' + porta + (process.env.PORT ? '' : ' (http://localhost:' + porta + ')'));
  });
  // A hospedagem manda SIGTERM antes de trocar de versão: fecha as conexões sem travar.
  process.on('SIGTERM', () => {
    io.close();
    servidorHttp.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
