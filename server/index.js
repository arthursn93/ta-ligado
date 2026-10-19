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
 *   'perfil'  {token}                -> {ok, perfil} | {ok:false, erro}   estatísticas e histórico do aparelho
 *   'perfil:visual' {token, tipo, id} -> {ok, perfil} | {ok:false, erro}  escolhe um item visual já liberado
 * Eventos do servidor:
 *   'estado'        visão da sala e da partida do ponto de vista de cada jogador.
 *   'chat'          uma mensagem nova da sala.
 *   'chat:historico' as últimas mensagens, ao entrar.
 *   'voz:sinal'     {de, dados} sinal WebRTC vindo de outro jogador.
 * Na visão de cada um, `progresso` traz o XP ganho na partida que acabou de terminar
 * ({carregando} enquanto grava) e cada jogador da sala traz `selo` {nivel, titulo, moldura}.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { Server } = require('socket.io');
const { criarGerenciador } = require('./Salas.js');
const Log = require('./log.js');

const RAIZ = path.join(__dirname, '..');
const TEMPO_SALA_VAZIA_MS = 10 * 60 * 1000;
// No desligamento, quanto esperar os aparelhos confirmarem o aviso de reinício. Quem confirma
// antes encurta a espera; o Render dá 30 s até forçar o fim.
const ESPERA_AVISO_MS = 1000;
const TAMANHO_MAX_SINAL = 20000;
const TAMANHO_MAX_TOKEN = 100;
const TAMANHO_MAX_MENSAGEM_SOCKET = 64 * 1024; // sinais de voz cabem com folga

// Limites por endereço de IP, contra robôs e adivinhação de código de sala.
const LIMITES = {
  conexoes: 60,                                 // simultâneas (uma escola inteira no mesmo Wi-Fi cabe)
  criar: { vezes: 10, janelaMs: 60 * 1000 },    // salas criadas por minuto
  entrarErrado: { vezes: 10, janelaMs: 60 * 1000 }, // códigos errados por minuto
  perfil: { vezes: 30, janelaMs: 60 * 1000 }     // leituras do perfil por minuto
};

// Se o banco falhar ao gravar uma partida, tenta de novo depois destes intervalos.
const ESPERAS_GRAVACAO_MS = [2000, 8000];

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
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json'
};
const ARQUIVOS_SOLTOS = ['style.css', 'privacidade.html', 'favicon.svg', 'icone-180.png', 'previa.png'];
function arquivoPublico(url) {
  let caminho;
  try { caminho = decodeURIComponent(url.split('?')[0]); } catch (e) { return null; } // URL malformada
  if (caminho === '/' || caminho === '/index.html') return 'index.html';
  if (ARQUIVOS_SOLTOS.indexOf(caminho.slice(1)) !== -1) return caminho.slice(1);
  const js = /^\/js\/([A-Za-z]+\.js)$/.exec(caminho);
  return js ? 'js/' + js[1] : null;
}

// Cabeçalhos de segurança: o jogo só carrega o que é dele (mais as fontes do Google).
const CABECALHOS_SEGURANCA = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'microphone=(self), camera=(), geolocation=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'"
  ].join('; ')
};

/** Lê o arquivo e guarda a versão comprimida enquanto ele não mudar no disco. */
const cacheArquivos = new Map();
function lerArquivo(arquivo, pronto) {
  const caminho = path.join(RAIZ, arquivo);
  fs.stat(caminho, (err, info) => {
    if (err) return pronto(err);
    const guardado = cacheArquivos.get(arquivo);
    if (guardado && guardado.mtime === info.mtimeMs) return pronto(null, guardado);
    fs.readFile(caminho, (err2, conteudo) => {
      if (err2) return pronto(err2);
      const comprimivel = /\.(html|css|js|svg|webmanifest)$/.test(arquivo);
      const item = { mtime: info.mtimeMs, conteudo, gzip: comprimivel ? zlib.gzipSync(conteudo) : null };
      cacheArquivos.set(arquivo, item);
      pronto(null, item);
    });
  });
}

/** Endereço público de quem pediu (atrás do Render, vem do proxy). */
function origemPublica(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  return proto + '://' + req.headers.host;
}

/** IP de quem conectou. No Render o IP real vem no primeiro item de X-Forwarded-For. */
function ipDe(req) {
  const encaminhado = req.headers['x-forwarded-for'];
  if (encaminhado) return String(encaminhado).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'desconhecido';
}

/** Contador de eventos por chave numa janela de tempo. */
function criarLimitador(limite) {
  const registros = new Map();
  return {
    estourou(chave, agora) {
      agora = agora || Date.now();
      const lista = (registros.get(chave) || []).filter((t) => agora - t < limite.janelaMs);
      registros.set(chave, lista);
      return lista.length >= limite.vezes;
    },
    contar(chave, agora) {
      const lista = registros.get(chave) || [];
      lista.push(agora || Date.now());
      registros.set(chave, lista);
    },
    limpar(agora) {
      agora = agora || Date.now();
      for (const [chave, lista] of registros) {
        if (!lista.some((t) => agora - t < limite.janelaMs)) registros.delete(chave);
      }
    }
  };
}

/** Só aceita conexões vindas do próprio site (ou das origens liberadas em ORIGENS_PERMITIDAS). */
function origemPermitida(req, env) {
  const origem = req.headers.origin;
  if (!origem) return true; // apps nativos e testes não mandam Origin
  const extras = String(env.ORIGENS_PERMITIDAS || '').split(',').map((o) => o.trim()).filter(Boolean);
  if (extras.indexOf(origem) !== -1) return true;
  try { return new URL(origem).host === req.headers.host; } catch (e) { return false; }
}

function criarServidor(opcoes) {
  opcoes = opcoes || {};
  // Onde a progressão é guardada (Banco ou Memoria). Sem armazém, o jogo funciona sem progressão.
  const armazem = opcoes.armazem || null;
  const esperasGravacao = opcoes.esperasGravacao || ESPERAS_GRAVACAO_MS;
  const esperaAviso = opcoes.esperaAviso || ESPERA_AVISO_MS;
  const gravacoes = new Set();
  const log = opcoes.log || Log.padrao;

  /** Grava a partida que acabou. A gravação é idempotente, então tentar de novo é seguro. */
  function gravarPartida(resumo) {
    if (!armazem) return;
    const tarefa = (async () => {
      for (let tentativa = 0; ; tentativa++) {
        try {
          const r = await armazem.gravarPartida(resumo);
          if (r.gravada) await mostrarProgresso(resumo, r.jogadores);
          return;
        } catch (e) {
          if (tentativa >= esperasGravacao.length) {
            log.erro('erro_gravar_partida', e, { partida: resumo.id, tentativas: tentativa + 1 });
            transmitir(salas.registrarProgresso(resumo.codigoSala, resumo.id, new Map(), true));
            return;
          }
          await new Promise((pronto) => setTimeout(pronto, esperasGravacao[tentativa]).unref());
        }
      }
    })();
    gravacoes.add(tarefa);
    tarefa.finally(() => gravacoes.delete(tarefa));
  }

  /** Manda a cada um o XP da partida e atualiza o selo (nível e título) de quem está na sala. */
  async function mostrarProgresso(resumo, jogadores) {
    const porHash = new Map(jogadores.map((j) => {
      const sem = Object.assign({}, j);
      delete sem.tokenHash;
      return [j.tokenHash, sem];
    }));
    const sala = salas.registrarProgresso(resumo.codigoSala, resumo.id, porHash);
    if (!sala) return;
    await Promise.all(sala.jogadores.map((j) => atualizarSelo(sala.codigo, j.token, false)));
    transmitir(salas.obter(resumo.codigoSala));
  }

  /** Lê do armazém o selo de quem entrou na sala. Falha aqui só deixa o nome sem selo. */
  async function atualizarSelo(codigo, token, transmitirDepois) {
    if (!armazem) return;
    try {
      const sala = salas.definirSelo(codigo, token, await armazem.selo(token));
      if (transmitirDepois) transmitir(sala);
    } catch (e) {
      log.erro('erro_ler_selo', e);
    }
  }

  /** Registra no log como a partida terminou (só números) e grava a progressão. */
  function partidaEncerrada(resumo) {
    log.info('partida_encerrada', { estado: resumo.estado, jogadores: resumo.jogadores.length, cartas: resumo.tentativas });
    gravarPartida(resumo);
  }

  const salas = criarGerenciador({ criarJogo: opcoes.criarJogo, aoEncerrarPartida: partidaEncerrada, progressaoAtiva: !!armazem, log });
  const tempoSalaVazia = opcoes.tempoSalaVazia || TEMPO_SALA_VAZIA_MS;
  const env = opcoes.env || process.env;
  const iceServers = servidoresIce(env);
  const limites = Object.assign({}, LIMITES, opcoes.limites);
  const limiteCriar = criarLimitador(limites.criar);
  const limiteEntrar = criarLimitador(limites.entrarErrado);
  const limitePerfil = criarLimitador(limites.perfil);
  const conexoesPorIp = new Map();
  setInterval(() => { limiteCriar.limpar(); limiteEntrar.limpar(); limitePerfil.limpar(); }, 5 * 60 * 1000).unref();

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
    lerArquivo(arquivo, (err, item) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Não encontrado');
        return;
      }
      let corpo = item.conteudo;
      let gzip = item.gzip;
      if (arquivo === 'index.html') {
        // A prévia do link (WhatsApp etc.) precisa do endereço completo da imagem.
        corpo = Buffer.from(corpo.toString('utf8').split('{{ORIGEM}}').join(origemPublica(req)));
        gzip = zlib.gzipSync(corpo);
      }
      const cabecalhos = Object.assign({ 'Content-Type': TIPOS[path.extname(arquivo)], 'Cache-Control': 'no-cache', Vary: 'Accept-Encoding' }, CABECALHOS_SEGURANCA);
      if (gzip && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
        cabecalhos['Content-Encoding'] = 'gzip';
        corpo = gzip;
      }
      res.writeHead(200, cabecalhos);
      res.end(corpo);
    });
  });

  const io = new Server(servidorHttp, {
    maxHttpBufferSize: TAMANHO_MAX_MENSAGEM_SOCKET,
    allowRequest: (req, aceitar) => {
      if (!origemPermitida(req, env)) return aceitar('Origem não permitida', false);
      if ((conexoesPorIp.get(ipDe(req)) || 0) >= limites.conexoes) return aceitar('Conexões demais', false);
      aceitar(null, true);
    },
    cors: { origin: (origem, pronto) => pronto(null, !origem || String(env.ORIGENS_PERMITIDAS || '').split(',').map((o) => o.trim()).indexOf(origem) !== -1) }
  });

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

  /** Um erro inesperado num evento não pode derrubar o servidor (e todas as salas junto). */
  function protegido(nome, fn) {
    return function () {
      const args = arguments;
      try {
        fn.apply(null, args);
      } catch (e) {
        log.erro('erro_evento', e, { nome });
        const ack = args[args.length - 1];
        if (typeof ack === 'function') ack({ ok: false, erro: 'Algo deu errado. Tente de novo.' });
      }
    };
  }

  function tokenValido(token) {
    return typeof token === 'string' && token.length > 0 && token.length <= TAMANHO_MAX_TOKEN;
  }

  io.on('connection', (socket) => {
    const ip = ipDe(socket.request);
    conexoesPorIp.set(ip, (conexoesPorIp.get(ip) || 0) + 1);
    socket.on('disconnect', () => {
      const n = (conexoesPorIp.get(ip) || 1) - 1;
      if (n <= 0) conexoesPorIp.delete(ip); else conexoesPorIp.set(ip, n);
    });
    // Todos os eventos passam pela rede de segurança.
    const on = socket.on.bind(socket);
    socket.on = (nome, fn) => on(nome, protegido(nome, fn));

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
      if (!tokenValido(dados.token)) return responder(ack, { ok: false, erro: 'Aparelho sem identificação. Recarregue a página.' });
      if (limiteCriar.estourou(ip)) return responder(ack, { ok: false, erro: 'Muitas salas criadas daqui. Espere um minuto.' });
      limiteCriar.contar(ip);
      const r = salas.criarSala(dados.token, dados.nome);
      if (!r.ok) return responder(ack, r);
      responder(ack, { ok: true, codigo: r.sala.codigo });
      entrarNoCanal(r.sala, String(dados.token));
      atualizarSelo(r.sala.codigo, String(dados.token), true);
      log.info('sala_criada', { salas: salas.total() });
    });

    socket.on('entrar', (dados, ack) => {
      dados = dados || {};
      if (!tokenValido(dados.token)) return responder(ack, { ok: false, erro: 'Aparelho sem identificação. Recarregue a página.' });
      // Só tentativas que falham contam: quem joga normalmente nunca esbarra no limite.
      if (limiteEntrar.estourou(ip)) return responder(ack, { ok: false, erro: 'Muitas tentativas. Espere um minuto e confira o código.' });
      const r = salas.entrar(dados.codigo, dados.token, dados.nome);
      if (!r.ok) {
        limiteEntrar.contar(ip);
        return responder(ack, r);
      }
      responder(ack, { ok: true, codigo: r.sala.codigo });
      entrarNoCanal(r.sala, String(dados.token));
      atualizarSelo(r.sala.codigo, String(dados.token), true);
    });

    socket.on('iniciar', (_dados, ack) => {
      if (typeof _dados === 'function') ack = _dados;
      const r = salas.iniciar(socket.data.codigo, socket.data.token);
      responder(ack, r.ok ? { ok: true } : r);
      if (!r.ok) return;
      transmitir(r.sala);
      log.info('partida_iniciada', { jogadores: r.sala.jogadores.filter((j) => j.online).length });
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

    socket.on('perfil', (dados, ack) => {
      dados = dados || {};
      if (!armazem) return responder(ack, { ok: false, erro: 'O histórico não está disponível neste servidor.' });
      if (!tokenValido(dados.token)) return responder(ack, { ok: false, erro: 'Aparelho sem identificação. Recarregue a página.' });
      if (limitePerfil.estourou(ip)) return responder(ack, { ok: false, erro: 'Muitos pedidos. Espere um minuto.' });
      limitePerfil.contar(ip);
      armazem.perfil(dados.token).then(
        (perfil) => responder(ack, { ok: true, perfil }),
        (e) => {
          log.erro('erro_ler_perfil', e);
          responder(ack, { ok: false, erro: 'Não deu para carregar o histórico agora.' });
        });
    });

    socket.on('perfil:visual', (dados, ack) => {
      dados = dados || {};
      if (!armazem) return responder(ack, { ok: false, erro: 'O perfil não está disponível neste servidor.' });
      if (!tokenValido(dados.token)) return responder(ack, { ok: false, erro: 'Aparelho sem identificação. Recarregue a página.' });
      if (typeof dados.tipo !== 'string' || typeof dados.id !== 'string') return responder(ack, { ok: false, erro: 'Item inválido.' });
      if (limitePerfil.estourou(ip)) return responder(ack, { ok: false, erro: 'Muitos pedidos. Espere um minuto.' });
      limitePerfil.contar(ip);
      armazem.escolherVisual(dados.token, dados.tipo, dados.id).then(
        (r) => {
          responder(ack, r.erro ? { ok: false, erro: r.erro } : { ok: true, perfil: r.perfil });
          if (!r.erro && socket.data.codigo && socket.data.token === dados.token) atualizarSelo(socket.data.codigo, dados.token, true);
        },
        (e) => {
          log.erro('erro_escolher_visual', e);
          responder(ack, { ok: false, erro: 'Não deu para salvar agora.' });
        });
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

  /** Espera as partidas que ainda estão sendo gravadas (usado antes de desligar). */
  function aguardarGravacoes() {
    return Promise.all([...gravacoes]);
  }

  /**
   * Manda a todos os aparelhos o aviso de que a sala vai fechar. Não conta com todos recebendo:
   * espera no máximo `esperaAviso` pelas confirmações e segue. Quem não recebeu vê "Reconectando…"
   * e depois o aviso de sala encerrada, como antes.
   */
  function avisarReinicio() {
    const aparelhos = io.sockets.sockets.size;
    const inicio = Date.now();
    if (!aparelhos) return Promise.resolve({ aparelhos: 0, confirmaram: 0, ms: 0 });
    return new Promise((pronto) => {
      const fim = (confirmaram) => pronto({ aparelhos, confirmaram, ms: Date.now() - inicio });
      setTimeout(() => fim(0), esperaAviso + 200).unref(); // se o Socket.io nunca responder
      try {
        io.timeout(esperaAviso).emit('servidor:reiniciando', (_erro, respostas) => fim((respostas || []).length));
      } catch (e) {
        log.erro('erro_aviso_reinicio', e);
        fim(0);
      }
    });
  }

  /**
   * Desligamento pedido pela hospedagem (SIGTERM, antes de trocar de versão): avisa os aparelhos,
   * fecha as conexões e termina de gravar as partidas que já acabaram. As partidas em andamento
   * seguem como antes do aviso: não são gravadas. Chamar de novo devolve o mesmo desligamento.
   */
  let encerramento = null;
  function encerrar(sinal) {
    if (encerramento) return encerramento;
    const inicio = Date.now();
    log.info('encerramento_recebido', Object.assign({ sinal }, salas.contagem()));
    encerramento = (async () => {
      log.info('aviso_reinicio', await avisarReinicio());
      io.close();
      servidorHttp.close();
      await aguardarGravacoes();
      try {
        if (armazem && armazem.fechar) await armazem.fechar();
      } catch (e) {
        log.erro('erro_fechar_banco', e);
      }
      log.info('encerramento_concluido', { ms: Date.now() - inicio });
    })();
    return encerramento;
  }

  return { servidorHttp, io, salas, aguardarGravacoes, encerrar };
}

module.exports = { criarServidor, servidoresIce, sinalValido, arquivoPublico, origemPermitida, LIMITES };

if (require.main === module) {
  // Na hospedagem a porta vem de PORT; em casa, 3000.
  const porta = Number(process.env.PORT) || 3000;
  // Com DATABASE_URL a progressão fica no Postgres; sem ela, o jogo roda como antes, sem histórico.
  const armazem = process.env.DATABASE_URL ? require('./progressao/Banco.js').criar(process.env.DATABASE_URL) : null;
  const { servidorHttp, encerrar } = criarServidor({ armazem });
  servidorHttp.listen(porta, () => {
    // Sem DATABASE_URL, progressao: false (as partidas não são gravadas).
    Log.padrao.info('servidor_iniciado', { porta, progressao: !!armazem });
    if (!process.env.PORT) console.log('Abra http://localhost:' + porta);
  });
  // O Render manda SIGTERM antes de trocar de versão e espera 30 s até forçar. Aqui o limite é
  // 5 s, para nunca travar o desligamento.
  process.on('SIGTERM', () => {
    setTimeout(() => process.exit(0), 5000).unref();
    encerrar('SIGTERM').finally(() => process.exit(0));
  });
}
