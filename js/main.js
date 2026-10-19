/**
 * main — liga as peças.
 * Aberto pelo servidor (npm start), tenta o modo online: salas por código, cada um no seu aparelho.
 * Enquanto o servidor não responde, mostra "Conectando…"; se não der, explica e oferece tentar de
 * novo ou jogar num aparelho só. Aberto direto do arquivo, joga num aparelho só.
 */
(function () {
  'use strict';
  Theme.aplicar(Theme.salva());
  var raiz = document.getElementById('app');
  var ESPERA_MAXIMA_MS = 60 * 1000; // o servidor gratuito pode levar quase 1 minuto para acordar

  function jogarLocal() {
    raiz.innerHTML = '';
    UI.criar(raiz, Game.criar());
  }

  function telaSimples(miolo) {
    raiz.innerHTML = '<div class="lobby"><h1 class="marca marca-grande">Tá <span>Ligado?</span></h1>' + miolo + '</div>';
  }

  function mostrarConectando() {
    telaSimples('<p class="lobby-sub" role="status">Conectando ao servidor…</p>' +
      '<p class="suave lobby-sub">Na primeira vez do dia pode levar até 1 minuto.</p>');
  }

  function mostrarFalha() {
    telaSimples('<section class="cartao-modal lobby-cartao" role="alert">' +
      '<h2>Não deu para falar com o servidor</h2>' +
      '<p>Confira a internet e tente de novo. Se preferir, dá para jogar passando um aparelho só.</p>' +
      '<button type="button" class="botao botao-primario botao-largo" data-main="tentar">Tentar de novo</button>' +
      '</section>' +
      '<button type="button" class="botao botao-fantasma" data-main="local">Jogar num aparelho só</button>');
  }

  raiz.addEventListener('click', function (ev) {
    var botao = ev.target.closest('[data-main]');
    if (!botao) return;
    if (botao.getAttribute('data-main') === 'tentar') window.location.reload();
    else { desistir(); jogarLocal(); }
  });

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
    function voltarAoInicio(aviso) {
      window.location.href = window.location.pathname + (aviso ? '?aviso=' + aviso : '');
    }
    Lobby.criar(raiz, rede, {
      social: social,
      aoJogarLocal: function () { desistir(); jogarLocal(); },
      aoComecar: function () {
        UI.criar(raiz, rede, {
          online: true,
          social: social,
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
