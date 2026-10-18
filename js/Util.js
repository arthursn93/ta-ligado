/**
 * Util — funções puras compartilhadas pelos módulos.
 * Funciona como script comum no navegador (global `Util`) e como módulo no Node.
 */
var Util = (function () {
  'use strict';

  /** Embaralha uma cópia do array (Fisher–Yates). `rng` retorna [0, 1). */
  function embaralhar(lista, rng) {
    var aleatorio = rng || Math.random;
    var copia = lista.slice();
    for (var i = copia.length - 1; i > 0; i--) {
      var j = Math.floor(aleatorio() * (i + 1));
      var tmp = copia[i];
      copia[i] = copia[j];
      copia[j] = tmp;
    }
    return copia;
  }

  /** Minúsculas e sem acentos, para comparar palavras ("Pão" == "pao"). */
  function normalizar(texto) {
    return String(texto)
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
  }

  var SUFIXOS = [
    '', 'a', 'e', 'o', 's', 'as', 'es', 'os', 'is', 'ais', 'eis', 'oes', 'aes', 'ao', 'oa', 'ona', 'zao', 'zona',
    'inho', 'inha', 'inhos', 'inhas', 'zinho', 'zinha', 'ito', 'ita', 'ete', 'eta',
    'al', 'ar', 'onar', 'ario', 'aria', 'eiro', 'eira', 'eiros', 'eiras', 'ico', 'ica', 'oso', 'osa',
    'ineo', 'inea', 'ista', 'ismo', 'ada', 'ado', 'agem', 'ento', 'udo', 'uda', 'ear', 'ecer', 'izar'
  ];

  /**
   * As duas palavras são da mesma família? (igual, plural, diminutivo, mesma raiz)
   * Ex.: ritual/rituais, sangue/sanguíneo, pulmão/pulmonar, lobo/lobinho.
   * Palavras de até 3 letras só casam com plurais e diminutivos, para "mar" não barrar "marte".
   */
  function mesmaFamilia(a, b) {
    var x = normalizar(a);
    var y = normalizar(b);
    if (!x || !y) return false;
    if (x === y) return true;
    var curta = x.length <= y.length ? x : y;
    var longa = curta === x ? y : x;
    // Plural, diminutivo e aumentativo: gato/gatinho, mar/mares, lobo/lobinhos, mão/mãozona.
    var radical = /[aeo]$/.test(curta) && curta.length > 3 ? curta.slice(0, -1) : curta;
    var flexao = ['s', 'es', 'inho', 'inha', 'inhos', 'inhas', 'zinho', 'zinha', 'zao', 'zona', 'ao', 'ona', 'oes'];
    if (flexao.some(function (fim) { return longa === curta + fim || longa === radical + fim; })) return true;
    if (curta.length <= 3) return false;
    var prefixo = 0;
    while (prefixo < curta.length && curta.charAt(prefixo) === longa.charAt(prefixo)) prefixo++;
    if (prefixo < 4 || prefixo < curta.length - 2) return false;
    // Raiz comum só conta se o resto da palavra maior for um sufixo de derivação
    // (sangu+íneo, caval+eiro, ritua+is), para "flor" não barrar "floresta".
    var resto = longa.slice(prefixo);
    return SUFIXOS.indexOf(resto) !== -1;
  }

  /** Gerador determinístico (mulberry32), útil em testes e para reproduzir partidas. */
  function rngComSemente(semente) {
    var a = semente >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  return { embaralhar: embaralhar, normalizar: normalizar, mesmaFamilia: mesmaFamilia, rngComSemente: rngComSemente };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Util;
