/**
 * Hooks — barramento de eventos para extensões que não fazem parte da regra do jogo.
 *
 * Eventos emitidos pelo Game:
 *   'roundResolved' → { rodada, coordenada, palavraColuna, palavraLinha, pista, palpite, acertou }
 *                     (base da coleta anônima de pistas da Fase 2)
 *   'gameEnd'       → { acertos, erros, total, vitoriaMaxima }
 *                     (ponto de entrada para anúncio entre partidas)
 */
var Hooks = (function () {
  'use strict';

  function criar() {
    var ouvintes = {};

    function on(evento, fn) {
      (ouvintes[evento] = ouvintes[evento] || []).push(fn);
      return function off() {
        ouvintes[evento] = (ouvintes[evento] || []).filter(function (f) { return f !== fn; });
      };
    }

    function emit(evento, dados) {
      (ouvintes[evento] || []).slice().forEach(function (fn) {
        try {
          fn(dados);
        } catch (erro) {
          // Uma extensão com defeito nunca pode travar a partida.
          if (typeof console !== 'undefined') console.error('[Hooks] erro em "' + evento + '":', erro);
        }
      });
    }

    return { on: on, emit: emit };
  }

  return { criar: criar };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Hooks;
