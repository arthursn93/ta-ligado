/**
 * Theme — skins de cor do tabuleiro.
 * Cada skin é um bloco [data-skin="id"] no style.css que redefine as variáveis de cor.
 * Skins novas (inclusive pagas) entram aqui e no CSS, sem tocar na UI.
 */
var Theme = (function () {
  'use strict';

  var CHAVE = 'ta-ligado:skin';
  var SKINS = [
    { id: 'padrao', nome: 'Grafite' },
    { id: 'oceano', nome: 'Oceano' }
  ];

  function existe(id) {
    return SKINS.some(function (s) { return s.id === id; });
  }

  function aplicar(id) {
    var skin = existe(id) ? id : 'padrao';
    document.body.setAttribute('data-skin', skin);
    try { localStorage.setItem(CHAVE, skin); } catch (e) { /* armazenamento indisponível */ }
    return skin;
  }

  function salva() {
    try { return localStorage.getItem(CHAVE) || 'padrao'; } catch (e) { return 'padrao'; }
  }

  return { SKINS: SKINS, aplicar: aplicar, salva: salva };
})();
