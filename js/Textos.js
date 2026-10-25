/**
 * Textos — busca os textos da interface pela chave: `Textos.t('lobby.criar')`.
 * Com valores, troca cada `{nome}`: `Textos.t('lobby.esperando', { nome: 'Ana' })`.
 *
 * Por enquanto só existe português (TextosPt). Roda no navegador e no servidor, como o Game.
 * Chave que não existe volta como a própria chave, para aparecer na tela e ser corrigida.
 */
var Textos = (function () {
  'use strict';

  var tabela = typeof TextosPt !== 'undefined' ? TextosPt : require('./TextosPt.js');

  function t(chave, valores) {
    var texto = Object.prototype.hasOwnProperty.call(tabela, chave) ? tabela[chave] : chave;
    if (!valores) return texto;
    return texto.replace(/\{(\w+)\}/g, function (marca, nome) {
      return Object.prototype.hasOwnProperty.call(valores, nome) ? String(valores[nome]) : marca;
    });
  }

  return { t: t, tabela: tabela };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Textos;
