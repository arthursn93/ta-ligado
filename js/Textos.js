/**
 * Textos — busca os textos da interface pela chave: `Textos.t('lobby.criar')`.
 * Com valores, troca cada `{nome}`: `Textos.t('lobby.esperando', { nome: 'Ana' })`.
 *
 * Idiomas: português (TextosPt), inglês (TextosEn) e espanhol (TextosEs). Começa em português;
 * `Textos.usar('en')` troca. Texto que faltar no idioma escolhido sai em português.
 * Roda no navegador e no servidor, como o Game. O servidor fica sempre em português.
 * Chave que não existe volta como a própria chave, para aparecer na tela e ser corrigida.
 */
var Textos = (function () {
  'use strict';

  function carregar(global, arquivo) {
    if (global) return global;
    return typeof require === 'function' ? require(arquivo) : null;
  }

  var TABELAS = {
    pt: carregar(typeof TextosPt !== 'undefined' && TextosPt, './TextosPt.js'),
    en: carregar(typeof TextosEn !== 'undefined' && TextosEn, './TextosEn.js'),
    es: carregar(typeof TextosEs !== 'undefined' && TextosEs, './TextosEs.js')
  };
  var IDIOMAS = ['pt', 'en', 'es'];
  var atual = 'pt';

  function tem(tabela, chave) {
    return !!tabela && Object.prototype.hasOwnProperty.call(tabela, chave);
  }

  function t(chave, valores) {
    var texto = tem(TABELAS[atual], chave) ? TABELAS[atual][chave] : tem(TABELAS.pt, chave) ? TABELAS.pt[chave] : chave;
    if (!valores) return texto;
    return texto.replace(/\{(\w+)\}/g, function (marca, nome) {
      return Object.prototype.hasOwnProperty.call(valores, nome) ? String(valores[nome]) : marca;
    });
  }

  /** Troca o idioma. Devolve false (e não troca) se o idioma não existir. */
  function usar(idioma) {
    if (IDIOMAS.indexOf(idioma) === -1 || !TABELAS[idioma]) return false;
    atual = idioma;
    return true;
  }

  /** O texto da chave, ou `reserva` se a chave não existe (nome de item que só o servidor conhece). */
  function ou(chave, reserva) {
    return tem(TABELAS.pt, chave) ? t(chave) : reserva;
  }

  /**
   * Resposta de erro do servidor e das regras: a mensagem em português (como sempre foi) e também
   * a chave, para cada aparelho mostrar a mensagem no seu idioma.
   */
  function falha(chave, valores) {
    var r = { ok: false, erro: t(chave, valores), chave: chave };
    if (valores) r.valores = valores;
    return r;
  }

  /** No aparelho: troca a mensagem de erro que veio do servidor pela do idioma escolhido. */
  function traduzir(resposta) {
    if (resposta && typeof resposta.chave === 'string' && tem(TABELAS.pt, resposta.chave)) {
      resposta.erro = t(resposta.chave, resposta.valores);
    }
    return resposta;
  }

  return {
    t: t,
    usar: usar,
    idioma: function () { return atual; },
    ou: ou,
    falha: falha,
    traduzir: traduzir,
    IDIOMAS: IDIOMAS,
    tabelas: TABELAS,
    tabela: TABELAS.pt
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Textos;
