/**
 * Som — efeitos sonoros curtos, gerados pelo próprio navegador (Web Audio), sem arquivos de áudio.
 *
 * Só toca depois do primeiro toque na tela (exigência dos navegadores) e respeita o botão de som,
 * guardado no aparelho. Começa ligado. Um som que falha nunca atrapalha a partida.
 *
 * Sons: selecionar, pista, casa, acerto, erro, recusada, suaVez, fim, vitoria, entrou.
 */
var Som = (function () {
  'use strict';

  var t = typeof Textos !== 'undefined' ? Textos.t : require('./Textos.js').t;
  var CHAVE = 'taligado.som';
  var VOLUME = 0.12;

  // Cada som é uma lista de notas: [frequência em Hz, início em s, duração em s, forma da onda].
  var SONS = {
    selecionar: [[660, 0, 0.05, 'sine']],
    pista: [[880, 0, 0.09, 'triangle'], [1320, 0.07, 0.14, 'triangle']],
    casa: [[440, 0, 0.08, 'triangle']],
    acerto: [[523, 0, 0.11, 'triangle'], [659, 0.09, 0.11, 'triangle'], [784, 0.18, 0.2, 'triangle']],
    erro: [[392, 0, 0.14, 'sine'], [330, 0.13, 0.22, 'sine']],
    recusada: [[180, 0, 0.12, 'square']],
    suaVez: [[988, 0, 0.12, 'sine'], [1319, 0.1, 0.25, 'sine']],
    fim: [[523, 0, 0.12, 'triangle'], [659, 0.12, 0.12, 'triangle'], [784, 0.24, 0.3, 'triangle']],
    vitoria: [[523, 0, 0.1, 'triangle'], [659, 0.1, 0.1, 'triangle'], [784, 0.2, 0.1, 'triangle'],
      [1047, 0.3, 0.4, 'triangle'], [784, 0.3, 0.4, 'sine']],
    entrou: [[740, 0, 0.06, 'sine'], [988, 0.05, 0.08, 'sine']]
  };

  function criar(opcoes) {
    opcoes = opcoes || {};
    var janela = opcoes.janela || (typeof window !== 'undefined' ? window : {});
    var Contexto = janela.AudioContext || janela.webkitAudioContext;
    var contexto = null;
    var liberado = false;
    var ligado = ler() !== 'desligado';

    function ler() {
      try { return janela.localStorage.getItem(CHAVE); } catch (e) { return null; }
    }

    function gravar(valor) {
      try { janela.localStorage.setItem(CHAVE, valor); } catch (e) { /* sem armazenamento: vale só nesta visita */ }
    }

    /** Chamado no primeiro toque: só então o navegador deixa o áudio começar. */
    function liberar() {
      liberado = true;
      if (!Contexto) return;
      try {
        if (!contexto) contexto = new Contexto();
        if (contexto.state === 'suspended') contexto.resume();
      } catch (e) { contexto = null; }
    }

    function tocar(nome) {
      var notas = SONS[nome];
      if (!ligado || !liberado || !contexto || !notas) return false;
      try {
        var agora = contexto.currentTime;
        notas.forEach(function (n) {
          var osc = contexto.createOscillator();
          var ganho = contexto.createGain();
          var inicio = agora + n[1], fim = inicio + n[2];
          osc.type = n[3];
          osc.frequency.setValueAtTime(n[0], inicio);
          // Entrada e saída rápidas, para não estalar.
          ganho.gain.setValueAtTime(0.0001, inicio);
          ganho.gain.exponentialRampToValueAtTime(VOLUME, inicio + 0.01);
          ganho.gain.exponentialRampToValueAtTime(0.0001, fim);
          osc.connect(ganho);
          ganho.connect(contexto.destination);
          osc.start(inicio);
          osc.stop(fim + 0.02);
        });
        return true;
      } catch (e) {
        return false;
      }
    }

    function alternar() {
      ligado = !ligado;
      gravar(ligado ? 'ligado' : 'desligado');
      return ligado;
    }

    return {
      tocar: tocar,
      liberar: liberar,
      alternar: alternar,
      ligado: function () { return ligado; }
    };
  }

  /** Botão de ligar/desligar, igual no jogo e na sala de espera. */
  function botao(ligado) {
    return '<button type="button" class="botao botao-fantasma botao-som" data-som aria-pressed="' + (ligado ? 'true' : 'false') +
      '" aria-label="' + t('som.rotulo') + '" title="' + (ligado ? t('som.desligar') : t('som.ligar')) + '">' +
      '<span aria-hidden="true">' + (ligado ? '🔊' : '🔇') + '</span></button>';
  }

  return { criar: criar, botao: botao, SONS: SONS };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Som;
