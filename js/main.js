/**
 * main — liga as peças.
 * Aberto pelo servidor (npm start), tenta o modo online: salas por código, cada um no seu aparelho.
 * Enquanto o servidor não responde, mostra "Conectando…"; se não der, explica e oferece tentar de
 * novo ou jogar num aparelho só. Aberto direto do arquivo, joga num aparelho só.
 */
(function () {
  'use strict';
  var t = Textos.t;
  Idioma.aplicar(Idioma.inicial());
  Theme.aplicar(Theme.salva());
  var raiz = document.getElementById('app');
  var som = Som.criar();
  // O navegador só deixa o som começar depois de um toque ou tecla.
  document.addEventListener('pointerdown', som.liberar);
  document.addEventListener('keydown', som.liberar);
  document.addEventListener('click', function (ev) {
    if (!ev.target.closest('[data-som]')) return;
    var ligado = som.alternar();
    Array.prototype.forEach.call(document.querySelectorAll('[data-som]'), function (b) { b.outerHTML = Som.botao(ligado); });
  });
  var ESPERA_MAXIMA_MS = 60 * 1000; // o servidor gratuito pode levar quase 1 minuto para acordar

  function jogarLocal() {
    raiz.innerHTML = '';
    UI.criar(raiz, Game.criar(), { som: som });
  }

  function telaSimples(miolo) {
    raiz.innerHTML = '<div class="lobby"><h1 class="marca marca-grande">Tá <span>Ligado?</span></h1>' + miolo + '</div>';
  }

  function mostrarConectando() {
    telaSimples('<p class="lobby-sub" role="status">' + t('conexao.conectando') + '</p>' +
      '<p class="suave lobby-sub">' + t('conexao.demora') + '</p>');
  }

  function mostrarFalha() {
    telaSimples('<section class="cartao-modal lobby-cartao" role="alert">' +
      '<h2>' + t('conexao.falhaTitulo') + '</h2>' +
      '<p>' + t('conexao.falhaTexto') + '</p>' +
      '<button type="button" class="botao botao-primario botao-largo" data-main="tentar">' + t('geral.tentarDeNovo') + '</button>' +
      '</section>' +
      '<button type="button" class="botao botao-fantasma" data-main="local">' + t('geral.jogarLocal') + '</button>');
  }

  raiz.addEventListener('click', function (ev) {
    var botao = ev.target.closest('[data-main]');
    if (!botao) return;
    if (botao.getAttribute('data-main') === 'tentar') window.location.reload();
    else avisarLocal(function () { desistir(); jogarLocal(); });
  });

  // Contadores de uso: o servidor só soma números do dia, sem saber quem é.
  var CHAVE_ULTIMA_VISITA = 'taligado.ultimaVisita';
  function hoje() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }
  /** Conta a abertura da tela. `voltou` = este navegador já tinha aberto o jogo em outro dia. */
  function avisarAbertura() {
    var ultima = null;
    try {
      ultima = window.localStorage.getItem(CHAVE_ULTIMA_VISITA);
      window.localStorage.setItem(CHAVE_ULTIMA_VISITA, hoje());
    } catch (e) { /* sem armazenamento: conta como primeira visita */ }
    socket.emit('metricas:abriu', {
      idioma: Textos.idioma(),
      convite: /[?&]sala=/.test(window.location.search),
      voltou: !!ultima && ultima !== hoje()
    });
  }
  /** Conta o início do modo local antes de fechar a conexão; sem conexão, só segue. */
  function avisarLocal(seguir) {
    if (!socket || !socket.connected) { seguir(); return; }
    var feito = false;
    function uma() { if (!feito) { feito = true; seguir(); } }
    socket.emit('metricas:local', uma);
    setTimeout(uma, 500);
  }

  var socket = null;
  var rede = null;
  var social = null;
  var comecou = false;
  var relogio = null;

  function desistir() {
    clearTimeout(relogio);
    if (socket) socket.close();
    socket = null;
  }

  function jogarOnline() {
    if (comecou) return;
    comecou = true;
    clearTimeout(relogio);
    avisarAbertura();
    function voltarAoInicio(aviso) {
      var busca = (aviso ? '&aviso=' + aviso : '') + Idioma.noEndereco();
      window.location.href = window.location.pathname + (busca ? '?' + busca.slice(1) : '');
    }
    Lobby.criar(raiz, rede, {
      social: social,
      som: som,
      aoJogarLocal: function () { avisarLocal(function () { desistir(); jogarLocal(); }); },
      aoComecar: function () {
        UI.criar(raiz, rede, {
          online: true,
          social: social,
          som: som,
          aoSair: function () {
            rede.sair().then(function () { voltarAoInicio(); });
          },
          aoSalaEncerrada: function () { voltarAoInicio('sala-encerrada'); }
        });
      }
    });
  }

  if (!/^https?:$/.test(window.location.protocol)) { jogarLocal(); return; }
  mostrarConectando();
  relogio = setTimeout(mostrarFalha, ESPERA_MAXIMA_MS);
  var script = document.createElement('script');
  script.src = '/socket.io/socket.io.min.js';
  script.onload = function () {
    if (typeof window.io !== 'function') { clearTimeout(relogio); mostrarFalha(); return; }
    socket = window.io();
    // A Rede assina o 'connect' antes de nós: ela volta para a sala salva assim que conectar.
    rede = Rede.criar(socket);
    social = Social.criar(rede);
    socket.once('connect', jogarOnline);
  };
  script.onerror = function () { clearTimeout(relogio); mostrarFalha(); };
  document.head.appendChild(script);
})();
