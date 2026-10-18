/**
 * Game — estado oficial e regras da partida. Não sabe nada de tela.
 *
 * Toda mudança acontece por `executar(acao)`, com ações simples e serializáveis:
 *   { tipo: 'NOVA_PARTIDA', pacote?: 'classico' }
 *   { tipo: 'DAR_PISTA', pista: 'praia' }
 *   { tipo: 'CHUTAR', coordenada: 'C2' }
 * No multiplayer, essas mesmas ações viram mensagens do Socket.io e este arquivo
 * passa a rodar no servidor; cada jogador recebe só `visao(papel)`.
 *
 * Coordenadas: letra da coluna (A–E) + número da linha (1–5). Ex.: 'C2'.
 */
var Game = (function () {
  'use strict';

  var UtilRef = typeof Util !== 'undefined' ? Util : require('./Util.js');
  var WordBankRef = typeof WordBank !== 'undefined' ? WordBank : require('./WordBank.js');
  var HooksRef = typeof Hooks !== 'undefined' ? Hooks : require('./Hooks.js');

  var COLUNAS = ['A', 'B', 'C', 'D', 'E'];
  var LINHAS = ['1', '2', '3', '4', '5'];
  var TODAS_COORDENADAS = [];
  COLUNAS.forEach(function (c) {
    LINHAS.forEach(function (l) { TODAS_COORDENADAS.push(c + l); });
  });

  var FASE = { PISTA: 'pista', PALPITE: 'palpite', FIM: 'fim' };
  var RESULTADO = { ACERTO: 'acerto', ERRO: 'erro' };
  var TAMANHO_MAX_PISTA = 30;

  function coordenadaValida(coord) {
    return typeof coord === 'string' && TODAS_COORDENADAS.indexOf(coord.toUpperCase()) !== -1;
  }

  /**
   * Cria uma partida.
   * opcoes.rng    → gerador aleatório (padrão Math.random); permite partidas reproduzíveis.
   * opcoes.hooks  → instância de Hooks (padrão: uma nova).
   * opcoes.pacote → id do pacote de palavras (padrão 'classico').
   */
  function criar(opcoes) {
    opcoes = opcoes || {};
    var rng = opcoes.rng || Math.random;
    var hooks = opcoes.hooks || HooksRef.criar();
    var assinantes = [];
    var s = null; // estado interno
    // Palavras de grade já usadas nesta sessão (todas as partidas desta instância).
    // O sorteio evita repeti-las enquanto o pacote tiver alternativas.
    var palavrasDaSessao = [];

    function novaPartida(idPacote) {
      var palavras = WordBankRef.sortear(10, idPacote || opcoes.pacote || 'classico', rng, { evitar: palavrasDaSessao });
      palavrasDaSessao = palavrasDaSessao.concat(palavras);
      var celulas = {};
      TODAS_COORDENADAS.forEach(function (c) { celulas[c] = null; });

      s = {
        pacote: idPacote || opcoes.pacote || 'classico',
        colunas: palavras.slice(0, 5), // palavras de A a E
        linhas: palavras.slice(5, 10), // palavras de 1 a 5
        baralho: UtilRef.embaralhar(TODAS_COORDENADAS, rng), // 25 cartas de posição
        cartaAtual: null,
        pista: null,
        fase: FASE.PISTA,
        rodada: 0,
        celulas: celulas,
        acertos: 0,
        erros: 0,
        ultimaJogada: null,
        historico: [] // uma entrada por carta jogada, na ordem
      };
      comprarCarta();
    }

    function comprarCarta() {
      if (s.baralho.length === 0) {
        s.cartaAtual = null;
        s.fase = FASE.FIM;
        hooks.emit('gameEnd', {
          acertos: s.acertos,
          erros: s.erros,
          total: TODAS_COORDENADAS.length,
          vitoriaMaxima: s.erros === 0
        });
        return;
      }
      s.cartaAtual = s.baralho.shift();
      s.pista = null;
      s.fase = FASE.PISTA;
      s.rodada += 1;
    }

    function palavrasDe(coord) {
      return {
        coluna: s.colunas[COLUNAS.indexOf(coord.charAt(0))],
        linha: s.linhas[LINHAS.indexOf(coord.charAt(1))]
      };
    }

    function validarPista(pista) {
      if (typeof pista !== 'string') return 'A pista precisa ser um texto.';
      var limpa = pista.trim();
      if (!limpa) return 'Digite uma pista.';
      if (/\s/.test(limpa)) return 'A pista deve ser uma única palavra.';
      if (limpa.length > TAMANHO_MAX_PISTA) return 'Pista muito longa.';
      if (/-/.test(limpa)) return 'Use uma palavra simples, sem hífen.';
      if (!/^[\p{L}]+$/u.test(limpa)) return 'Use só letras.';

      // A pista tem que acrescentar algo: nada de repetir, traduzir ou flexionar palavras da grade.
      var naGrade = s.colunas.concat(s.linhas);
      for (var i = 0; i < naGrade.length; i++) {
        if (UtilRef.normalizar(naGrade[i]) === UtilRef.normalizar(limpa)) return 'A pista não pode ser uma palavra da grade.';
        if (WordBankRef.equivalentes(limpa, naGrade[i], s.pacote)) {
          return 'Parecida demais com "' + naGrade[i].toUpperCase() + '" (mesmo sentido ou mesma raiz). Pense em outra.';
        }
      }

      // Cada pista vale uma vez por partida, incluindo plurais e variações.
      var repetida = s.historico.filter(function (j) { return UtilRef.mesmaFamilia(j.pista, limpa); })[0];
      if (repetida) return '"' + repetida.pista.toUpperCase() + '" já foi usada nesta partida. Pense em outra.';
      return null;
    }

    function darPista(pista) {
      if (s.fase !== FASE.PISTA) return falha('Não é hora de dar pista.');
      var erro = validarPista(pista);
      if (erro) return falha(erro);
      s.pista = pista.trim();
      s.fase = FASE.PALPITE;
      return sucesso();
    }

    function chutar(coordenada) {
      if (s.fase !== FASE.PALPITE) return falha('Não é hora de chutar.');
      if (!coordenadaValida(coordenada)) return falha('Coordenada inválida.');
      var palpite = coordenada.toUpperCase();
      if (s.celulas[palpite] !== null) return falha('Esse quadrado já foi resolvido.');

      // A carta sorteada é resolvida de qualquer jeito: acertou, marca acerto;
      // errou, a carta é descartada e o quadrado dela fica bloqueado como erro.
      var secreta = s.cartaAtual;
      var acertou = palpite === secreta;
      s.celulas[secreta] = acertou ? RESULTADO.ACERTO : RESULTADO.ERRO;
      if (acertou) s.acertos += 1; else s.erros += 1;

      var palavras = palavrasDe(secreta);
      s.ultimaJogada = {
        rodada: s.rodada,
        coordenada: secreta,
        palavraColuna: palavras.coluna,
        palavraLinha: palavras.linha,
        pista: s.pista,
        palpite: palpite,
        acertou: acertou
      };
      s.historico.push(s.ultimaJogada);
      hooks.emit('roundResolved', copiar(s.ultimaJogada));

      comprarCarta();
      return sucesso();
    }

    function sucesso() {
      notificar();
      return { ok: true };
    }

    function falha(mensagem) {
      return { ok: false, erro: mensagem };
    }

    function notificar() {
      assinantes.slice().forEach(function (fn) { fn(); });
    }

    /** Aplica uma ação. Retorna { ok: true } ou { ok: false, erro }. */
    function executar(acao) {
      if (!acao || typeof acao.tipo !== 'string') return falha('Ação inválida.');
      switch (acao.tipo) {
        case 'NOVA_PARTIDA':
          novaPartida(acao.pacote);
          return sucesso();
        case 'DAR_PISTA':
          return darPista(acao.pista);
        case 'CHUTAR':
          return chutar(acao.coordenada);
        default:
          return falha('Ação desconhecida: ' + acao.tipo);
      }
    }

    /**
     * O que um jogador pode ver. Só o papel 'dador' recebe a coordenada secreta,
     * e só enquanto está escrevendo a pista.
     */
    function visao(papel) {
      var v = {
        colunas: s.colunas.slice(),
        linhas: s.linhas.slice(),
        celulas: copiar(s.celulas),
        fase: s.fase,
        rodada: s.rodada,
        totalCartas: TODAS_COORDENADAS.length,
        cartasRestantes: s.baralho.length + (s.cartaAtual ? 1 : 0),
        pista: s.pista,
        acertos: s.acertos,
        erros: s.erros,
        ultimaJogada: s.ultimaJogada ? copiar(s.ultimaJogada) : null,
        historico: copiar(s.historico),
        coordenadaSecreta: null,
        vitoriaMaxima: s.fase === FASE.FIM && s.erros === 0
      };
      if (papel === 'dador' && s.fase === FASE.PISTA && s.cartaAtual) {
        v.coordenadaSecreta = s.cartaAtual;
        var palavras = palavrasDe(s.cartaAtual);
        v.palavrasSecretas = { coluna: palavras.coluna, linha: palavras.linha };
      }
      return v;
    }

    /** Chama `fn` depois de cada ação aceita. Retorna a função para cancelar. */
    function assinar(fn) {
      assinantes.push(fn);
      return function () {
        assinantes = assinantes.filter(function (f) { return f !== fn; });
      };
    }

    novaPartida(opcoes.pacote);

    return { executar: executar, visao: visao, assinar: assinar, hooks: hooks };
  }

  function copiar(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  return {
    criar: criar,
    COLUNAS: COLUNAS.slice(),
    LINHAS: LINHAS.slice(),
    FASE: FASE,
    RESULTADO: RESULTADO
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Game;
