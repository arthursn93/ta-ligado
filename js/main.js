/**
 * main — liga as peças.
 * Aberto pelo servidor (npm start), tenta o modo online: salas por código, cada um no seu aparelho.
 * Aberto direto do arquivo, ou se o servidor não tiver Socket.io, cai no modo de um aparelho só.
 */
(function () {
  'use strict';
  Theme.aplicar(Theme.salva());
  var raiz = document.getElementById('app');

  function jogarLocal() {
    raiz.innerHTML = '';
    UI.criar(raiz, Game.criar());
  }

  function jogarOnline() {
    var rede = Rede.criar(window.io());
    Lobby.criar(raiz, rede, {
      aoJogarLocal: jogarLocal,
      aoComecar: function () {
        UI.criar(raiz, rede, {
          online: true,
          aoSair: function () {
            rede.sair().then(function () { window.location.href = window.location.pathname; });
          }
        });
      }
    });
  }

  if (!/^https?:$/.test(window.location.protocol)) { jogarLocal(); return; }
  var script = document.createElement('script');
  script.src = '/socket.io/socket.io.js';
  script.onload = function () { if (typeof window.io === 'function') jogarOnline(); else jogarLocal(); };
  script.onerror = jogarLocal;
  document.head.appendChild(script);
})();
