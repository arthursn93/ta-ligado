/**
 * UI — tela do jogo. Só lê `jogo.visao(papel)` e envia ações com `jogo.executar(...)`.
 * Não guarda regra nenhuma: o estado daqui é só visual (etapa da tela, quadrado selecionado, hover).
 *
 * Etapas da tela (fluxo de "passar o aparelho"):
 *   passar    → cobre a tela e pede para entregar o aparelho ao dador
 *   dador     → mostra a coordenada secreta e recebe a pista
 *   palpite   → grupo vê a pista, seleciona um quadrado e confirma
 *   resultado → mostra acerto/erro no painel; "Próxima rodada" volta para passar
 *   fim       → placar final (pode ser fechado para ver o tabuleiro: etapa 'encerrada')
 *
 * Modo online (`opcoes.online`): `jogo` é a Rede, cada um joga no seu aparelho e a etapa sai do
 * estado que o servidor manda. Não existe 'passar'; aparecem:
 *   aguardando   → outra pessoa está pensando na pista
 *   assistindo   → eu dei a pista e a turma está escolhendo
 *   dador-oculto → sou o dador e escondi a carta para olhar o tabuleiro
 */
var UI = (function () {
  'use strict';

  var COLUNAS = Game.COLUNAS;
  var LINHAS = Game.LINHAS;
  var AVISO_REINICIO = 'O jogo está sendo atualizado. Esta sala vai fechar em instantes.';

  var MOLDE = [
    '<header class="topo">',
    '  <h1 class="marca">Tá <span>Ligado?</span></h1>',
    '  <div class="placar" aria-live="polite">',
    '    <span class="placar-rodada"></span>',
    '    <span class="pilula pilula-acerto" title="Acertos"></span>',
    '    <span class="pilula pilula-erro" title="Erros"></span>',
    '  </div>',
    '  <button class="botao botao-fantasma" data-acao="nova-pedir">Nova partida</button>',
    '</header>',
    '<section class="barra-sala" hidden></section>',
    '<section class="faixa-pista" aria-live="polite"></section>',
    '<section class="tabuleiro"><div class="grade" role="group" aria-label="Tabuleiro 5 por 5"></div></section>',
    '<section class="painel" aria-live="polite"></section>',
    '<div class="sobreposicao" hidden><div class="cartao-modal" role="dialog" aria-modal="true"></div></div>'
  ].join('');

  /** Conteúdo de uma carta de dica: letra grande com o número num selinho redondo. */
  function faceDica(coord) {
    return '<span class="dica-letra">' + coord.charAt(0) + '</span><span class="dica-num">' + coord.charAt(1) + '</span>';
  }

  /** Carta de dica completa (usada no painel e na tela do dador). */
  function cartaDica(coord, classe) {
    return '<div class="carta-dica ' + (classe || '') + '">' + faceDica(coord) + '</div>';
  }

  function esc(texto) {
    return String(texto).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function palavrasDe(v, coord) {
    return {
      coluna: v.colunas[COLUNAS.indexOf(coord.charAt(0))],
      linha: v.linhas[LINHAS.indexOf(coord.charAt(1))]
    };
  }

  function criar(raiz, jogo, opcoes) {
    opcoes = opcoes || {};
    var online = !!opcoes.online;
    var etapa = 'passar';
    var jogadasVistas = -1; // online: tamanho do histórico na última atualização
    var enviando = false;
    var avisoPainel = '';
    var barraAtual = null;
    var selecionada = null;
    var emFoco = null; // hover no desktop
    var confirmandoNova = false;
    var chaveModal = null;
    var painelAtual = null;
    var faixaAtual = null;

    raiz.innerHTML = MOLDE;
    var el = {
      nova: raiz.querySelector('.topo [data-acao="nova-pedir"]'),
      barra: raiz.querySelector('.barra-sala'),
      rodada: raiz.querySelector('.placar-rodada'),
      acertos: raiz.querySelector('.pilula-acerto'),
      erros: raiz.querySelector('.pilula-erro'),
      faixa: raiz.querySelector('.faixa-pista'),
      grade: raiz.querySelector('.grade'),
      painel: raiz.querySelector('.painel'),
      sobreposicao: raiz.querySelector('.sobreposicao'),
      modal: raiz.querySelector('.cartao-modal')
    };
    var celulas = {};
    var cabColunas = {};
    var cabLinhas = {};
    montarGrade();

    // ---------- Montagem ----------

    function montarGrade() {
      var canto = document.createElement('div');
      canto.className = 'canto';
      el.grade.appendChild(canto);

      COLUNAS.forEach(function (c) {
        var cab = document.createElement('div');
        cab.className = 'cab cab-coluna';
        cab.innerHTML = '<span class="cab-id">' + c + '</span><span class="cab-palavra"></span>';
        cabColunas[c] = cab;
        el.grade.appendChild(cab);
      });

      LINHAS.forEach(function (l) {
        var cab = document.createElement('div');
        cab.className = 'cab cab-linha';
        cab.innerHTML = '<span class="cab-id">' + l + '</span><span class="cab-palavra"></span>';
        cabLinhas[l] = cab;
        el.grade.appendChild(cab);

        COLUNAS.forEach(function (c) {
          var coord = c + l;
          var botao = document.createElement('button');
          botao.type = 'button';
          botao.className = 'celula';
          botao.setAttribute('data-coord', coord);
          celulas[coord] = botao;
          el.grade.appendChild(botao);
        });
      });
    }

    // ---------- Eventos ----------

    el.grade.addEventListener('click', function (ev) {
      var alvo = ev.target.closest('[data-coord]');
      if (!alvo) return;
      var coord = alvo.getAttribute('data-coord');
      selecionada = selecionada === coord ? null : coord;
      render();
    });

    el.grade.addEventListener('mouseover', function (ev) {
      var alvo = ev.target.closest('[data-coord]');
      var coord = alvo ? alvo.getAttribute('data-coord') : null;
      if (coord !== emFoco) { emFoco = coord; realcar(); renderPainel(jogo.visao()); }
    });
    el.grade.addEventListener('mouseleave', function () {
      emFoco = null; realcar(); renderPainel(jogo.visao());
    });

    raiz.addEventListener('click', function (ev) {
      var botao = ev.target.closest('[data-acao]');
      if (botao && !botao.disabled) agir(botao.getAttribute('data-acao'));
    });

    raiz.addEventListener('submit', function (ev) {
      ev.preventDefault();
      agir('confirmar-pista');
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && confirmandoNova) { agir('nova-cancelar'); return; }
      if (ev.key === 'Escape' && selecionada) { selecionada = null; render(); return; }
      if (ev.key === 'Enter' && etapa === 'palpite' && selecionada && !el.sobreposicao.contains(document.activeElement)) {
        ev.preventDefault();
        agir('confirmar-palpite');
      }
    });

    // ---------- Ações ----------

    function agir(acao) {
      var v = jogo.visao();
      switch (acao) {
        case 'ver-coordenada':
          etapa = 'dador';
          break;
        case 'voltar-passar':
          etapa = online ? 'dador-oculto' : 'passar';
          break;
        case 'confirmar-pista': {
          var campo = el.modal.querySelector('input[name="pista"]');
          enviar({ tipo: 'DAR_PISTA', pista: campo ? campo.value : '' }, function (r) {
            if (!r.ok) { mostrarErroPista(r.erro); return; }
            if (online) return; // a tela muda quando o servidor mandar o novo estado
            etapa = 'palpite';
            selecionada = null;
            render();
          });
          return;
        }
        case 'confirmar-palpite': {
          if (!selecionada || v.celulas[selecionada] !== null) return;
          enviar({ tipo: 'CHUTAR', coordenada: selecionada }, function (res) {
            if (!res.ok) {
              if (online && etapa === 'palpite') { avisoPainel = res.erro; render(); }
              return;
            }
            if (online) return;
            etapa = 'resultado';
            selecionada = null;
            if (jogo.visao().ultimaJogada.acertou) confete(40);
            render();
          });
          return;
        }
        case 'proxima':
          etapa = online ? etapaDoEstado(v) : v.fase === Game.FASE.FIM ? 'fim' : 'passar';
          if (etapa === 'fim' && v.vitoriaMaxima) confete(120);
          break;
        case 'sair-sala':
          opcoes.aoSair();
          return;
        case 'fechar-fim':
          etapa = 'encerrada';
          break;
        case 'perfil':
          Progresso.abrir(jogo);
          return;
        case 'ver-placar':
          etapa = 'fim';
          break;
        case 'nova-pedir':
          // Sem nada jogado ou com a partida encerrada, não precisa confirmar.
          if ((v.historico.length === 0 && !v.pista) || v.fase === Game.FASE.FIM) { novaPartida(); break; }
          confirmandoNova = true;
          break;
        case 'nova-cancelar':
          confirmandoNova = false;
          break;
        case 'nova-confirmar':
          novaPartida();
          break;
        default:
          return;
      }
      render();
    }

    function novaPartida() {
      confirmandoNova = false;
      selecionada = null;
      if (online) {
        // O servidor só aceita do anfitrião; a tela reinicia quando chegar o estado novo.
        enviar({ tipo: 'NOVA_PARTIDA' }, function () {});
        return;
      }
      jogo.executar({ tipo: 'NOVA_PARTIDA' });
      etapa = 'passar';
    }

    /** Envia uma ação. No modo local a resposta vem na hora; no online, quando o servidor responde. */
    function enviar(acao, depois) {
      if (enviando) return;
      var r = jogo.executar(acao);
      if (!r || typeof r.then !== 'function') { depois(r); return; }
      enviando = true;
      r.then(function (res) { enviando = false; depois(res); });
    }

    // ---------- Modo online ----------

    function souDador() {
      return online && jogo.souDador();
    }

    function etapaDoEstado(v) {
      if (v.fase === Game.FASE.FIM) return 'fim';
      if (v.fase === Game.FASE.PISTA) return souDador() ? 'dador' : 'aguardando';
      return souDador() ? 'assistindo' : 'palpite';
    }

    function nomeDoDador() {
      var dador = jogo.jogador(jogo.sala().dadorId);
      return dador ? dador.nome : 'Alguém';
    }

    /** Chegou estado novo do servidor: decide a etapa da tela deste aparelho. */
    function aoMudarOnline() {
      var v = jogo.visao();
      if (!v) {
        // A sala sumiu do servidor: não deixa o tabuleiro congelado na tela.
        if (!jogo.sala() && opcoes.aoSalaEncerrada) opcoes.aoSalaEncerrada();
        return;
      }
      var jogadas = v.historico.length;
      if (jogadasVistas >= 0 && jogadas < jogadasVistas) {
        // O anfitrião começou outra partida.
        etapa = null;
        selecionada = null;
        confirmandoNova = false;
      } else if (jogadasVistas >= 0 && jogadas > jogadasVistas) {
        // Alguém chutou: todo mundo vê o resultado da carta.
        etapa = 'resultado';
        selecionada = null;
        if (v.ultimaJogada && v.ultimaJogada.acertou) confete(40);
      }
      jogadasVistas = jogadas;
      if (v.fase !== Game.FASE.PALPITE) avisoPainel = '';

      var fica = etapa === 'resultado' ||
        (etapa === 'encerrada' && v.fase === Game.FASE.FIM) ||
        (etapa === 'dador-oculto' && v.fase === Game.FASE.PISTA && souDador());
      if (!fica) etapa = etapaDoEstado(v);
      render();
    }

    function renderBarra() {
      if (!online) return;
      var sala = jogo.sala();
      var html = '<span class="barra-codigo">Sala <b>' + esc(sala.codigo) + '</b></span>' +
        '<ul class="barra-jogadores">' + sala.jogadores.map(function (j) {
          var classes = (j.online ? '' : ' is-offline') + (j.id === sala.dadorId ? ' is-dador' : '') + (j.id === sala.euId ? ' is-eu' : '') +
            Progresso.classeMoldura(j);
          return '<li class="chip' + classes + '" data-jogador-id="' + esc(j.id) + '" title="' + esc(j.nome) +
            (j.selo ? ', nível ' + j.selo.nivel + ' · ' + esc(j.selo.titulo) : '') +
            (j.id === sala.dadorId ? ' está dando a pista' : '') + (j.online ? '' : ' (desconectado)') + '">' +
            (j.id === sala.dadorId ? '<span aria-hidden="true">🎤</span> ' : '') + esc(j.nome) +
            (j.id === sala.anfitriaoId ? ' <span aria-label="anfitrião">👑</span>' : '') +
            (opcoes.social ? opcoes.social.iconeVoz(j) : '') + '</li>';
        }).join('') + '</ul>' +
        (jogo.reiniciando() ? '<span class="chip chip-alerta chip-longo" role="status">' + AVISO_REINICIO + '</span>' :
          jogo.conectado() ? '' : '<span class="chip chip-alerta">Reconectando…</span>') +
        (opcoes.social ? opcoes.social.slot() : '') +
        '<button class="botao botao-fantasma botao-pequeno" data-acao="sair-sala">Sair</button>';
      if (barraAtual !== html) { barraAtual = html; el.barra.innerHTML = html; }
      el.barra.hidden = false;
      if (opcoes.social) opcoes.social.atualizar();
    }

    function mostrarErroPista(mensagem) {
      var erro = el.modal.querySelector('.erro-campo');
      var campo = el.modal.querySelector('input[name="pista"]');
      if (erro) erro.textContent = mensagem;
      if (campo) {
        campo.classList.remove('tremer');
        void campo.offsetWidth; // reinicia a animação
        campo.classList.add('tremer');
        campo.focus();
      }
    }

    // ---------- Renderização ----------

    function render() {
      var v = jogo.visao(etapa === 'dador' ? 'dador' : 'grupo');
      if (!v) return;
      if (online) el.nova.hidden = !jogo.souAnfitriao();
      renderBarra();
      renderPlacar(v);
      renderFaixa(v);
      renderGrade(v);
      realcar();
      renderPainel(v);
      renderModal(v);
    }

    function renderPlacar(v) {
      var rodada = v.fase === Game.FASE.FIM ? v.totalCartas : v.rodada;
      el.rodada.innerHTML = 'Carta <b>' + rodada + '</b>/' + v.totalCartas;
      el.acertos.textContent = '✓ ' + v.acertos;
      el.erros.textContent = '✕ ' + v.erros;
    }

    function renderFaixa(v) {
      var html;
      // No resultado a carta seguinte já foi comprada, então a pista exibida vem da última jogada.
      var pista = etapa === 'resultado' && v.ultimaJogada ? v.ultimaJogada.pista
        : etapa === 'palpite' || etapa === 'assistindo' ? v.pista : null;
      if (pista) {
        html = '<span class="faixa-rotulo">Pista</span><span class="faixa-palavra">' + esc(pista) + '</span>';
      } else if (v.fase === Game.FASE.FIM) {
        html = '<span class="faixa-rotulo">Partida encerrada</span><span class="faixa-status">' +
          v.acertos + ' de ' + v.totalCartas + ' coordenadas</span>';
      } else {
        html = '<span class="faixa-rotulo">Carta ' + v.rodada + '</span><span class="faixa-status">Aguardando a pista…</span>';
      }
      // Só troca quando muda, para não reiniciar a animação da pista a cada toque.
      if (faixaAtual !== html) { faixaAtual = html; el.faixa.innerHTML = html; }
    }

    function renderGrade(v) {
      COLUNAS.forEach(function (c, i) {
        cabColunas[c].querySelector('.cab-palavra').textContent = v.colunas[i];
        cabColunas[c].title = c + ': ' + v.colunas[i];
      });
      LINHAS.forEach(function (l, i) {
        cabLinhas[l].querySelector('.cab-palavra').textContent = v.linhas[i];
        cabLinhas[l].title = l + ': ' + v.linhas[i];
      });

      var pistas = {};
      v.historico.forEach(function (j) { pistas[j.coordenada] = j.pista; });
      var ultima = etapa === 'resultado' ? v.ultimaJogada : null;

      Object.keys(celulas).forEach(function (coord) {
        var botao = celulas[coord];
        var estado = v.celulas[coord];
        var p = palavrasDe(v, coord);
        botao.className = 'celula' +
          (estado ? ' is-' + estado : '') +
          (coord === selecionada ? ' is-selecionada' : '') +
          (ultima && ultima.coordenada === coord ? ' is-recente' : '') +
          (ultima && !ultima.acertou && ultima.palpite === coord ? ' is-palpite-errado' : '');
        // Acerto: a carta de dica fica no lugar, de face para cima. Erro: carta virada (verso) com um X.
        botao.innerHTML = estado === Game.RESULTADO.ACERTO
          ? faceDica(coord) + '<span class="celula-pista">' + esc(pistas[coord] || '') + '</span>'
          : estado === Game.RESULTADO.ERRO
            ? '<span class="verso-x">✕</span><span class="celula-pista">' + esc(pistas[coord] || '') + '</span>'
            : '';
        botao.setAttribute('aria-label', coord + ', ' + p.coluna + ' e ' + p.linha +
          (estado === Game.RESULTADO.ACERTO ? ', acerto' : estado === Game.RESULTADO.ERRO ? ', bloqueado' : ''));
        botao.setAttribute('aria-pressed', coord === selecionada ? 'true' : 'false');
      });
    }

    function realcar() {
      var ativa = selecionada || emFoco;
      var col = ativa ? ativa.charAt(0) : null;
      var lin = ativa ? ativa.charAt(1) : null;
      Object.keys(celulas).forEach(function (coord) {
        var naCruz = ativa && coord !== ativa && (coord.charAt(0) === col || coord.charAt(1) === lin);
        celulas[coord].classList.toggle('is-cruz', !!naCruz);
      });
      COLUNAS.forEach(function (c) { cabColunas[c].classList.toggle('is-ativo', c === col); });
      LINHAS.forEach(function (l) { cabLinhas[l].classList.toggle('is-ativo', l === lin); });
    }

    function blocoPalavras(v, coord, extra) {
      var p = palavrasDe(v, coord);
      return cartaDica(coord, 'carta-mini') +
        '<div class="painel-texto">' +
          '<div class="painel-palavras"><span>' + esc(p.coluna) + '</span><i>×</i><span>' + esc(p.linha) + '</span></div>' +
          (extra || '') +
        '</div>';
    }

    function renderPainel(v) {
      var html;
      var ativa = selecionada || emFoco;

      if (etapa === 'resultado' && v.ultimaJogada) {
        var j = v.ultimaJogada;
        var fim = v.fase === Game.FASE.FIM;
        html =
          '<div class="painel-info painel-resultado">' +
            '<div class="painel-titulo ' + (j.acertou ? 'txt-acerto' : 'txt-erro') + '">' +
              (j.acertou ? '🎉 Tá ligado! Acertaram.' : '💥 Errou! A carta foi descartada.') + '</div>' +
            '<div class="painel-detalhe">Era <b>' + j.coordenada + '</b>: ' + esc(j.palavraColuna) + ' × ' + esc(j.palavraLinha) +
              (j.acertou ? '' : '. Vocês escolheram <b>' + j.palpite + '</b>.') + '</div>' +
          '</div>' +
          '<button class="botao botao-primario" data-acao="proxima">' + (fim ? 'Ver resultado' : 'Próxima carta') + '</button>';
      } else if (etapa === 'palpite') {
        var podeConfirmar = selecionada && v.celulas[selecionada] === null;
        var dica = selecionada && !podeConfirmar ? '<div class="painel-detalhe">Esse quadrado já foi resolvido.</div>'
          : avisoPainel ? '<div class="painel-detalhe txt-erro">' + esc(avisoPainel) + '</div>' : '';
        html =
          '<div class="painel-info">' +
            (ativa ? blocoPalavras(v, ativa, dica)
                   : '<div class="painel-detalhe">Toque num quadrado para ver as duas palavras.</div>') +
          '</div>' +
          '<button class="botao botao-primario" data-acao="confirmar-palpite"' + (podeConfirmar ? '' : ' disabled') + '>' +
            (podeConfirmar ? 'Confirmar ' + selecionada : 'Confirmar') + '</button>';
      } else if (etapa === 'encerrada' || etapa === 'fim') {
        html =
          '<div class="painel-info">' + (ativa ? blocoPalavras(v, ativa)
            : '<div class="painel-detalhe">Você acertou ' + v.acertos + ' de ' + v.totalCartas + ' coordenadas.</div>') + '</div>' +
          (podeRecomecar() ? '<button class="botao botao-primario" data-acao="nova-confirmar">Jogar de novo</button>' : '');
      } else if (etapa === 'assistindo') {
        html = '<div class="painel-info">' + (ativa ? blocoPalavras(v, ativa)
          : '<div class="painel-detalhe">Você deu a pista <b>' + esc(v.pista) + '</b>. Agora é com a turma!</div>') + '</div>';
      } else if (etapa === 'dador-oculto') {
        html = '<div class="painel-info">' + (ativa ? blocoPalavras(v, ativa)
          : '<div class="painel-detalhe">Sua vez de dar a pista. Olhe o tabuleiro com calma.</div>') + '</div>' +
          '<button class="botao botao-primario" data-acao="ver-coordenada">Ver minha carta</button>';
      } else if (etapa === 'aguardando') {
        html = '<div class="painel-info">' + (ativa ? blocoPalavras(v, ativa)
          : '<div class="painel-detalhe"><b>' + esc(nomeDoDador()) + '</b> está pensando na pista. Vá estudando o tabuleiro.</div>') + '</div>';
      } else {
        html = '<div class="painel-info"><div class="painel-detalhe">Aguardando a pista…</div></div>';
      }
      if (painelAtual !== html) { painelAtual = html; el.painel.innerHTML = html; }
    }

    function podeRecomecar() {
      return !online || jogo.souAnfitriao();
    }

    function esperandoAnfitriao() {
      var anfitriao = jogo.jogador(jogo.sala().anfitriaoId);
      return '<p class="suave">Esperando ' + esc(anfitriao ? anfitriao.nome : 'o anfitrião') + ' começar outra partida.</p>';
    }

    function miniMapa(v, secreta) {
      var html = '<div class="mini-mapa" aria-hidden="true"><span></span>';
      COLUNAS.forEach(function (c) { html += '<span class="mini-cab">' + c + '</span>'; });
      LINHAS.forEach(function (l) {
        html += '<span class="mini-cab">' + l + '</span>';
        COLUNAS.forEach(function (c) {
          var coord = c + l;
          var estado = v.celulas[coord];
          html += '<span class="mini-celula' + (coord === secreta ? ' is-alvo' : estado ? ' is-' + estado : '') + '"></span>';
        });
      });
      return html + '</div>';
    }

    function renderModal(v) {
      var progresso = online && etapa === 'fim' ? jogo.progresso() : null;
      // O XP chega um instante depois do fim: a chave muda quando ele chega, para redesenhar.
      var chave = confirmandoNova ? 'nova' : etapa === 'fim' ? 'fim' + (progresso ? (progresso.carregando ? '-calculando' : '-pronto') : '') : etapa;
      var conteudo = null;

      if (confirmandoNova) {
        conteudo =
          '<h2>Começar outra partida?</h2>' +
          '<p class="suave">O placar desta partida será perdido.</p>' +
          '<div class="acoes">' +
            '<button class="botao botao-fantasma" data-acao="nova-cancelar">Continuar jogando</button>' +
            '<button class="botao botao-primario" data-acao="nova-confirmar">Nova partida</button>' +
          '</div>';
      } else if (etapa === 'passar') {
        conteudo =
          '<div class="selo" aria-hidden="true">🤫</div>' +
          '<p class="rotulo">Carta ' + v.rodada + ' de ' + v.totalCartas + '</p>' +
          '<h2>Passe o aparelho para quem vai dar a pista</h2>' +
          '<p class="suave">Só o dador pode olhar a próxima tela.</p>' +
          '<div class="acoes"><button class="botao botao-primario" data-acao="ver-coordenada">Sou o dador, ver a coordenada</button></div>';
      } else if (etapa === 'dador' && v.coordenadaSecreta) {
        var p = v.palavrasSecretas;
        conteudo =
          '<p class="rotulo">Sua coordenada secreta</p>' +
          '<div class="dador-topo">' +
            cartaDica(v.coordenadaSecreta, 'carta-grande') + miniMapa(v, v.coordenadaSecreta) +
          '</div>' +
          '<div class="dador-palavras">' +
            '<div class="dador-palavra"><small>Coluna ' + v.coordenadaSecreta.charAt(0) + '</small><b>' + esc(p.coluna) + '</b></div>' +
            '<i>×</i>' +
            '<div class="dador-palavra"><small>Linha ' + v.coordenadaSecreta.charAt(1) + '</small><b>' + esc(p.linha) + '</b></div>' +
          '</div>' +
          '<form class="form-pista" autocomplete="off">' +
            '<label for="campo-pista">Uma palavra que ligue as duas</label>' +
            '<input id="campo-pista" name="pista" type="text" maxlength="30" autocapitalize="none" spellcheck="false" placeholder="Sua pista">' +
            '<div class="erro-campo" role="alert"></div>' +
            '<div class="acoes">' +
              '<button type="button" class="botao botao-fantasma" data-acao="voltar-passar">' + (online ? 'Ver tabuleiro' : 'Esconder') + '</button>' +
              '<button type="submit" class="botao botao-primario">Confirmar pista</button>' +
            '</div>' +
          '</form>';
      } else if (etapa === 'fim') {
        var perfeito = v.vitoriaMaxima;
        conteudo =
          '<div class="selo selo-fim" aria-hidden="true">' + (perfeito ? '🏆' : '⭐') + '</div>' +
          '<p class="rotulo">' + (perfeito ? 'Vitória máxima' : 'Fim do baralho') + '</p>' +
          '<div class="placar-final ' + (perfeito ? 'txt-acerto' : '') + '">' + v.acertos + '<small>/' + v.totalCartas + '</small></div>' +
          '<h2>' + (perfeito
            ? 'Vocês posicionaram as 25 cartas sem nenhum erro!'
            : 'Você acertou ' + v.acertos + ' de ' + v.totalCartas + ' coordenadas!') + '</h2>' +
          Progresso.blocoFim(progresso) +
          '<div class="acoes">' +
            '<button class="botao botao-fantasma" data-acao="fechar-fim">Ver tabuleiro</button>' +
            (podeRecomecar() ? '<button class="botao botao-primario" data-acao="nova-confirmar">Jogar de novo</button>' : '') +
          '</div>' +
          (podeRecomecar() ? '' : esperandoAnfitriao()) +
          (progresso ? '<button type="button" class="botao botao-fantasma botao-pequeno fim-perfil" data-acao="perfil">Ver meu perfil</button>' : '');
      }

      if (!conteudo) {
        el.sobreposicao.hidden = true;
        el.modal.innerHTML = ''; // não deixa a carta secreta escondida no HTML
        chaveModal = null;
        return;
      }
      if (chave === chaveModal) return; // mantém o que o dador já digitou
      chaveModal = chave;
      el.modal.innerHTML = conteudo;
      el.modal.className = 'cartao-modal modal-' + (confirmandoNova ? 'nova' : etapa);
      el.sobreposicao.hidden = false;
      var focar = el.modal.querySelector('input') || el.modal.querySelector('.botao-primario');
      if (focar) focar.focus();
    }

    /** Chuva de confete nas cores do jogo. Some sozinha e respeita "reduzir movimento". */
    function confete(quantidade) {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      var camada = document.createElement('div');
      camada.className = 'confete';
      camada.setAttribute('aria-hidden', 'true');
      for (var i = 0; i < quantidade; i++) {
        var peca = document.createElement('i');
        peca.className = 'cor-' + COLUNAS[i % COLUNAS.length];
        peca.style.left = (Math.random() * 100) + '%';
        peca.style.animationDelay = (Math.random() * 0.4) + 's';
        peca.style.animationDuration = (1.4 + Math.random() * 1.2) + 's';
        peca.style.setProperty('--giro', (Math.random() * 720 - 360) + 'deg');
        peca.style.setProperty('--desvio', (Math.random() * 120 - 60) + 'px');
        camada.appendChild(peca);
      }
      document.body.appendChild(camada);
      setTimeout(function () { camada.remove(); }, 3000);
    }

    if (online) {
      jogo.assinar(aoMudarOnline);
      aoMudarOnline();
    } else {
      render();
    }
    return { render: render };
  }

  return { criar: criar };
})();
