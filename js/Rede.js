/**
 * Rede — o "jogo" do modo online. Tem a mesma cara do Game (visao, executar, assinar), mas quem
 * decide tudo é o servidor: as ações vão pelo Socket.io e a visão é a última que ele mandou.
 * Diferença: `executar` devolve uma Promise com {ok, erro}.
 *
 * Também cuida da identidade do aparelho (token salvo no navegador) e de voltar para a sala
 * sozinho depois de recarregar a página ou de a conexão cair.
 */
var Rede = (function () {
  'use strict';

  var CHAVE_TOKEN = 'ta-ligado:token';
  var CHAVE_SALA = 'ta-ligado:sala';
  var CHAVE_NOME = 'ta-ligado:nome';

  function ler(chave) {
    try { return window.localStorage.getItem(chave); } catch (e) { return null; }
  }
  function gravar(chave, valor) {
    try {
      if (valor === null) window.localStorage.removeItem(chave);
      else window.localStorage.setItem(chave, valor);
    } catch (e) { /* sem armazenamento: só não lembra depois de recarregar */ }
  }

  function novoToken() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function criar(socket) {
    var token = ler(CHAVE_TOKEN);
    if (!token) { token = novoToken(); gravar(CHAVE_TOKEN, token); }

    var estado = null; // { sala, jogo } vindo do servidor
    var codigo = null;
    var conectado = false;
    var assinantes = [];
    var aoEntrarFns = [];

    function entrou() {
      aoEntrarFns.slice().forEach(function (fn) { fn(); });
    }

    function avisar() {
      assinantes.slice().forEach(function (fn) { fn(estado); });
    }

    function pedir(evento, dados) {
      return new Promise(function (resolver) {
        if (!socket.connected) { resolver({ ok: false, erro: 'Sem conexão. Tentando reconectar…' }); return; }
        socket.timeout(8000).emit(evento, dados || {}, function (falhou, resposta) {
          resolver(falhou ? { ok: false, erro: 'O servidor não respondeu. Tente de novo.' } : resposta);
        });
      });
    }

    function lembrarSala(novoCodigo, nome) {
      codigo = novoCodigo;
      gravar(CHAVE_SALA, novoCodigo);
      if (nome) gravar(CHAVE_NOME, nome);
      entrou();
    }

    socket.on('estado', function (novo) {
      estado = novo;
      avisar();
    });

    socket.on('connect', function () {
      conectado = true;
      // Conexão voltou (ou página recarregada): retoma o lugar na sala com o mesmo token.
      var salva = codigo || ler(CHAVE_SALA);
      if (salva) {
        pedir('entrar', { codigo: salva, token: token }).then(function (r) {
          if (r.ok) { codigo = r.codigo; entrou(); return; }
          // A sala acabou enquanto estávamos fora.
          codigo = null;
          estado = null;
          gravar(CHAVE_SALA, null);
          avisar();
        });
      }
      avisar();
    });

    socket.on('disconnect', function () {
      conectado = false;
      avisar();
    });

    return {
      // Mesma interface do Game
      visao: function () { return estado && estado.jogo; },
      executar: function (acao) { return pedir('acao', { acao: acao }); },
      assinar: function (fn) {
        assinantes.push(fn);
        return function () { assinantes = assinantes.filter(function (f) { return f !== fn; }); };
      },

      // Sala
      sala: function () { return estado && estado.sala; },
      conectado: function () { return conectado; },
      temSalaSalva: function () { return !!(codigo || ler(CHAVE_SALA)); },
      nomeSalvo: function () { return ler(CHAVE_NOME) || ''; },
      souDador: function () { var s = estado && estado.sala; return !!s && s.dadorId === s.euId; },
      souAnfitriao: function () { var s = estado && estado.sala; return !!s && s.anfitriaoId === s.euId; },
      jogador: function (id) {
        var s = estado && estado.sala;
        if (!s) return null;
        for (var i = 0; i < s.jogadores.length; i++) if (s.jogadores[i].id === id) return s.jogadores[i];
        return null;
      },
      criarSala: function (nome) {
        return pedir('criar', { nome: nome, token: token }).then(function (r) {
          if (r.ok) lembrarSala(r.codigo, nome);
          return r;
        });
      },
      entrar: function (codigoSala, nome) {
        return pedir('entrar', { codigo: codigoSala, nome: nome, token: token }).then(function (r) {
          if (r.ok) lembrarSala(r.codigo, nome);
          return r;
        });
      },
      iniciar: function () { return pedir('iniciar'); },

      // Chat e voz (Social.js)
      emitir: pedir,
      enviar: function (evento, dados) { if (socket.connected) socket.emit(evento, dados); },
      on: function (evento, fn) { socket.on(evento, fn); },
      /** Chamado sempre que este aparelho entra (ou volta) numa sala. */
      aoEntrar: function (fn) { aoEntrarFns.push(fn); },
      sair: function () {
        codigo = null;
        gravar(CHAVE_SALA, null);
        return pedir('sair');
      }
    };
  }

  return { criar: criar };
})();
