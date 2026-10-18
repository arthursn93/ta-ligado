/**
 * main — liga as peças. No multiplayer, é aqui que o Game local
 * dá lugar a um cliente que envia as ações pelo Socket.io.
 */
(function () {
  'use strict';
  Theme.aplicar(Theme.salva());
  var jogo = Game.criar();
  UI.criar(document.getElementById('app'), jogo);
})();
