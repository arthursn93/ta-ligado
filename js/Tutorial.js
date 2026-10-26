/**
 * Tutorial — "Como jogar" em 4 passos, só com toques, num tabuleiro de exemplo 3×3.
 *   1. tabuleiro → toque numa casa e veja as duas palavras que ela junta
 *   2. pista     → escolha a pista certa para a casa secreta (duas são recusadas, com o motivo)
 *   3. turma     → leia a pista, escolha a casa e confirme
 *   4. objetivo  → o jogo de verdade: 5×5, 25 cartas
 *
 * Roda só no aparelho: não fala com o servidor, não usa as regras do Game e não grava nada além
 * de "já vi o tutorial" (para não abrir sozinho de novo).
 */
var Tutorial = (function () {
  'use strict';

  var t = typeof Textos !== 'undefined' ? Textos.t : require('./Textos.js').t;
  var CHAVE = 'taligado.tutorial';
  var COLUNAS = ['A', 'B', 'C'];
  var LINHAS = ['1', '2', '3'];
  var SECRETA = 'A1';  // passo 2: a casa de quem dá a pista
  var CERTA = 'C3';    // passo 3: a casa que a pista da turma liga
  var TOTAL = 4;
  var PALAVRAS = {
    A: 'tutorial.colunaA', B: 'tutorial.colunaB', C: 'tutorial.colunaC',
    1: 'tutorial.linha1', 2: 'tutorial.linha2', 3: 'tutorial.linha3'
  };

  function palavra(coord) {
    return {
      coluna: t(PALAVRAS[coord.charAt(0)]),
      linha: t(PALAVRAS[coord.charAt(1)])
    };
  }

  // ---------- Primeira visita ----------

  function janelaPadrao() {
    return typeof window !== 'undefined' ? window : {};
  }

  /** Abre sozinho só na primeira visita e só sem convite: quem chega por convite tem gente esperando. */
  function deveAbrir(janela) {
    janela = janela || janelaPadrao();
    var busca = (janela.location && janela.location.search) || '';
    if (/[?&]sala=/.test(busca)) return false;
    try { return janela.localStorage.getItem(CHAVE) !== 'visto'; } catch (e) { return false; }
  }

  function marcarVisto(janela) {
    janela = janela || janelaPadrao();
    try { janela.localStorage.setItem(CHAVE, 'visto'); } catch (e) { /* sem armazenamento: só não lembra */ }
  }

  // ---------- Tela ----------

  function faceDica(coord) {
    return '<span class="dica-letra">' + coord.charAt(0) + '</span><span class="dica-num">' + coord.charAt(1) + '</span>';
  }

  function palavras(coord) {
    var p = palavra(coord);
    return '<div class="painel-palavras"><span>' + p.coluna + '</span><i>×</i><span>' + p.linha + '</span></div>';
  }

  /**
   * Abre o tutorial por cima do que estiver na tela.
   * opcoes.som: os efeitos sonoros (opcional). opcoes.aoFechar: chamado ao terminar ou pular.
   */
  function abrir(opcoes) {
    opcoes = opcoes || {};
    var antes = document.activeElement;
    var passo = 1;
    var tocada = null;      // passo 1: casa tocada
    var pistaOk = false;    // passo 2: escolheu a pista boa
    var recusada = null;    // passo 2: última pista recusada
    var selecionada = null; // passo 3: casa escolhida
    var resposta = null;    // passo 3: casa confirmada

    var camada = document.createElement('div');
    camada.className = 'sobreposicao tutorial-sobreposicao';
    camada.innerHTML = '<div class="cartao-modal modal-tutorial" role="dialog" aria-modal="true" aria-labelledby="tutorial-titulo"></div>';
    document.body.appendChild(camada);
    var cartao = camada.firstChild;

    function som(nome) {
      if (opcoes.som) opcoes.som.tocar(nome);
    }

    function grade(estado) {
      var html = '<div class="tut-grade" role="group" aria-label="' + t('tutorial.tabuleiro') + '"><span></span>';
      COLUNAS.forEach(function (c) {
        html += '<span class="tut-cab tut-col"><span class="tut-id">' + c + '</span><span class="etiqueta">' + t(PALAVRAS[c]) + '</span></span>';
      });
      LINHAS.forEach(function (l) {
        html += '<span class="tut-cab tut-lin"><span class="etiqueta">' + t(PALAVRAS[l]) + '</span><span class="tut-id">' + l + '</span></span>';
        COLUNAS.forEach(function (c) {
          var coord = c + l;
          var p = palavra(coord);
          var classe = estado(coord) || '';
          var conteudo = classe.indexOf('is-acerto') !== -1 ? faceDica(coord)
            : classe.indexOf('is-erro') !== -1 ? '<span class="verso-x">✕</span>' : '';
          html += '<button type="button" class="celula ' + classe + '" data-tutorial-casa="' + coord + '"' +
            ' aria-label="' + t('jogo.celula', { coord: coord, coluna: p.coluna, linha: p.linha }) + '"' +
            ' aria-pressed="' + (classe.indexOf('is-selecionada') !== -1) + '">' + conteudo + '</button>';
        });
      });
      return html + '</div>';
    }

    function botaoProximo(rotulo) {
      return '<div class="acoes"><button type="button" class="botao botao-primario" data-tutorial="proximo">' + rotulo + '</button></div>';
    }

    function conteudoPasso() {
      if (passo === 1) {
        return '<h2 id="tutorial-titulo" tabindex="-1">' + t('tutorial.p1Titulo') + '</h2>' +
          '<p class="suave">' + t('tutorial.p1Texto') + '</p>' +
          grade(function (coord) { return coord === tocada ? 'is-selecionada' : ''; }) +
          '<div class="tut-retorno" aria-live="polite">' + (tocada
            ? palavras(tocada) + '<p class="tut-ok">' + t('tutorial.p1Ok') + '</p>'
            : '<p class="suave">' + t('tutorial.p1Toque') + '</p>') + '</div>' +
          (tocada ? botaoProximo(t('tutorial.proximo')) : '');
      }
      if (passo === 2) {
        var p = palavra(SECRETA);
        var opcoesPista = [
          ['boa', t('tutorial.pistaBoa')],
          ['grade', p.coluna],
          ['duas', t('tutorial.pistaDuas')]
        ];
        return '<h2 id="tutorial-titulo" tabindex="-1">' + t('tutorial.p2Titulo') + '</h2>' +
          '<p class="suave">' + t('tutorial.p2Texto') + '</p>' +
          '<div class="tut-secreta"><div class="carta-dica tut-carta">' + faceDica(SECRETA) + '</div>' + palavras(SECRETA) + '</div>' +
          '<div class="tut-pistas">' + opcoesPista.map(function (o) {
            var escolhida = (pistaOk && o[0] === 'boa') || recusada === o[0];
            return '<button type="button" class="botao botao-fantasma tut-pista' + (escolhida ? (o[0] === 'boa' ? ' is-certa' : ' is-recusada tremer') : '') + '"' +
              ' data-tutorial-pista="' + o[0] + '"' + (pistaOk ? ' disabled' : '') + '>' + o[1] + '</button>';
          }).join('') + '</div>' +
          '<div class="tut-retorno" aria-live="polite">' + (pistaOk
            ? '<p class="tut-ok">' + t('tutorial.p2Ok', { pista: t('tutorial.pistaBoa'), coluna: p.coluna, linha: p.linha }) + '</p>'
            : recusada === 'grade' ? '<p class="erro-campo">' + t('tutorial.p2Grade') + '</p>'
              : recusada === 'duas' ? '<p class="erro-campo">' + t('tutorial.p2Duas') + '</p>'
                : '<p class="suave">' + t('tutorial.p2Escolha') + '</p>') + '</div>' +
          (pistaOk ? botaoProximo(t('tutorial.proximo')) : '');
      }
      if (passo === 3) {
        var certa = palavra(CERTA);
        var retorno;
        if (resposta === CERTA) retorno = '<p class="tut-ok">' + t('tutorial.p3Acertou') + '</p>';
        else if (resposta) retorno = '<p class="erro-campo">' + t('tutorial.p3Errou', { coord: CERTA, coluna: certa.coluna, linha: certa.linha }) + '</p>';
        else retorno = selecionada ? palavras(selecionada) : '<p class="suave">' + t('tutorial.p3Toque') + '</p>';
        return '<h2 id="tutorial-titulo" tabindex="-1">' + t('tutorial.p3Titulo') + '</h2>' +
          '<div class="tut-faixa"><span class="faixa-rotulo">' + t('jogo.faixaPista') + '</span><span class="faixa-palavra">' + t('tutorial.pistaTurma') + '</span></div>' +
          grade(function (coord) {
            if (resposta) {
              if (coord === CERTA) return 'is-acerto' + (resposta === CERTA ? ' is-recente' : '');
              if (coord === resposta) return 'is-erro';
              return '';
            }
            return coord === selecionada ? 'is-selecionada' : '';
          }) +
          '<div class="tut-retorno" aria-live="polite">' + retorno + '</div>' +
          (resposta ? botaoProximo(t('tutorial.proximo'))
            : '<div class="acoes"><button type="button" class="botao botao-primario" data-tutorial="confirmar"' + (selecionada ? '' : ' disabled') + '>' +
              (selecionada ? t('painel.confirmarCoord', { coord: selecionada }) : t('painel.confirmar')) + '</button></div>');
      }
      return '<div class="selo selo-fim" aria-hidden="true">🏆</div>' +
        '<h2 id="tutorial-titulo" tabindex="-1">' + t('tutorial.p4Titulo') + '</h2>' +
        '<p class="suave">' + t('tutorial.p4Texto') + '</p>' +
        '<p class="suave tut-meta">' + t('tutorial.p4Meta') + '</p>' +
        botaoProximo(t('tutorial.bora'));
    }

    function render(focar) {
      cartao.innerHTML =
        '<div class="tut-topo"><p class="rotulo">' + t('tutorial.passo', { passo: passo, total: TOTAL }) + '</p>' +
        (passo < TOTAL ? '<button type="button" class="botao botao-fantasma botao-pequeno" data-tutorial="pular">' + t('tutorial.pular') + '</button>' : '') + '</div>' +
        '<div class="tut-pontos" aria-hidden="true">' + [1, 2, 3, 4].map(function (n) {
          return '<span class="' + (n <= passo ? 'is-feito' : '') + '"></span>';
        }).join('') + '</div>' +
        conteudoPasso();
      var alvo = focar && cartao.querySelector(focar);
      if (alvo) alvo.focus();
    }

    function fechar() {
      marcarVisto();
      document.removeEventListener('keydown', teclado);
      camada.remove();
      if (antes && antes.focus && antes.isConnected) antes.focus();
      if (opcoes.aoFechar) opcoes.aoFechar();
    }

    function teclado(ev) {
      if (ev.key === 'Escape') fechar();
    }

    camada.addEventListener('click', function (ev) {
      var casa = ev.target.closest('[data-tutorial-casa]');
      var pista = ev.target.closest('[data-tutorial-pista]');
      var acao = ev.target.closest('[data-tutorial]');
      if (casa) {
        var coord = casa.getAttribute('data-tutorial-casa');
        if (passo === 1) { tocada = coord; som('selecionar'); render('[data-tutorial="proximo"]'); }
        else if (passo === 3 && !resposta) { selecionada = coord; som('selecionar'); render('[data-tutorial="confirmar"]'); }
        return;
      }
      if (pista && !pista.disabled) {
        var tipo = pista.getAttribute('data-tutorial-pista');
        if (tipo === 'boa') { pistaOk = true; recusada = null; som('pista'); render('[data-tutorial="proximo"]'); }
        else { recusada = tipo; som('recusada'); render(); }
        return;
      }
      if (!acao || acao.disabled) return;
      switch (acao.getAttribute('data-tutorial')) {
        case 'pular':
          fechar();
          break;
        case 'confirmar':
          if (!selecionada) return;
          resposta = selecionada;
          som(resposta === CERTA ? 'acerto' : 'erro');
          render('[data-tutorial="proximo"]');
          break;
        case 'proximo':
          if (passo === TOTAL) { fechar(); return; }
          passo++;
          render('.modal-tutorial h2');
          break;
      }
    });
    document.addEventListener('keydown', teclado);

    render('[data-tutorial="pular"]');
    return { fechar: fechar };
  }

  return { abrir: abrir, deveAbrir: deveAbrir, marcarVisto: marcarVisto, CHAVE: CHAVE };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Tutorial;
