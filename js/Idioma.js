/**
 * Idioma — qual idioma a interface usa e o botão PT / EN / ES da tela inicial.
 *
 * Ordem: a escolha salva no aparelho; senão `?idioma=` no endereço (convite ou prévia); senão o idioma
 * do navegador, se for um dos três; senão português.
 * Só a escolha feita no botão fica salva. O idioma do endereço vale para esta visita.
 */
var Idioma = (function () {
  'use strict';

  var TextosRef = typeof Textos !== 'undefined' ? Textos : require('./Textos.js');
  var CHAVE = 'taligado.idioma';
  // Nome de cada idioma escrito nele mesmo: não se traduz.
  var NOMES = { pt: 'Português', en: 'English', es: 'Español' };

  function janelaPadrao() {
    return typeof window !== 'undefined' ? window : {};
  }

  function valido(idioma) {
    return TextosRef.IDIOMAS.indexOf(idioma) !== -1;
  }

  function salvo(janela) {
    try {
      var valor = janela.localStorage.getItem(CHAVE);
      return valido(valor) ? valor : null;
    } catch (e) {
      return null;
    }
  }

  function doEndereco(janela) {
    var m = /[?&]idioma=([a-z]+)/.exec((janela.location && janela.location.search) || '');
    return m && valido(m[1]) ? m[1] : null;
  }

  /** Primeiro idioma do navegador que o jogo tem ('en-US' vale 'en'). */
  function doNavegador(janela) {
    var nav = janela.navigator || {};
    var lista = nav.languages && nav.languages.length ? nav.languages : [nav.language];
    for (var i = 0; i < lista.length; i++) {
      var codigo = String(lista[i] || '').slice(0, 2).toLowerCase();
      if (valido(codigo)) return codigo;
    }
    return null;
  }

  /** O idioma desta visita. */
  function inicial(janela) {
    janela = janela || janelaPadrao();
    return salvo(janela) || doEndereco(janela) || doNavegador(janela) || 'pt';
  }

  /** Passa a usar o idioma na interface (sem salvar). */
  function aplicar(idioma, janela) {
    janela = janela || janelaPadrao();
    if (!TextosRef.usar(idioma)) return false;
    if (janela.document) janela.document.documentElement.lang = TextosRef.t('geral.local');
    return true;
  }

  /** Escolha feita no botão: usa e salva no aparelho. */
  function escolher(idioma, janela) {
    janela = janela || janelaPadrao();
    if (!aplicar(idioma, janela)) return false;
    try { janela.localStorage.setItem(CHAVE, idioma); } catch (e) { /* sem armazenamento: só não lembra */ }
    return true;
  }

  /** `&idioma=xx` para levar no convite e na volta da sala. Português é o padrão e não precisa. */
  function noEndereco() {
    var atual = TextosRef.idioma();
    return atual === 'pt' ? '' : '&idioma=' + atual;
  }

  /** Botão PT / EN / ES da interface, na tela inicial. */
  function botao() {
    return seletor(TextosRef.idioma(), 'data-idioma', TextosRef.t('idioma.rotulo'));
  }

  /** Mesmo visual, para outra escolha de idioma (ex.: as palavras da sala, com `data-palavras`). */
  function seletor(atual, atributo, rotulo) {
    return '<div class="idiomas" role="group" aria-label="' + rotulo + '">' +
      TextosRef.IDIOMAS.map(function (id) {
        return '<button type="button" class="idioma' + (id === atual ? ' is-atual' : '') + '" ' + atributo + '="' + id + '"' +
          ' lang="' + id + '" aria-label="' + NOMES[id] + '" aria-pressed="' + (id === atual) + '">' + id.toUpperCase() + '</button>';
      }).join('') +
      '</div>';
  }

  return { inicial: inicial, aplicar: aplicar, escolher: escolher, noEndereco: noEndereco, botao: botao, seletor: seletor, CHAVE: CHAVE, NOMES: NOMES };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Idioma;
