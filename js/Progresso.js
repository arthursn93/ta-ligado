/**
 * Progresso — o que o jogador vê da progressão: selo ao lado do nome, resumo de XP no placar final
 * e a tela de perfil (nível, estatísticas, conquistas, itens e histórico).
 *
 * Só mostra: XP, nível e conquistas chegam prontos do servidor. Escolher um item visual é um pedido
 * que o servidor confere antes de salvar.
 */
var Progresso = (function () {
  'use strict';

  function esc(texto) {
    return String(texto).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function numero(n) {
    return Number(n).toLocaleString('pt-BR');
  }

  function porcentagem(p) {
    return p === null || p === undefined ? '—' : String(p).replace('.', ',') + '%';
  }

  var TIPOS = [
    { id: 'titulo', nome: 'Títulos' },
    { id: 'moldura', nome: 'Molduras' },
    { id: 'tabuleiro', nome: 'Cores do tabuleiro' }
  ];
  var CATEGORIAS = { iniciacao: 'Primeiros passos', consistencia: 'Consistência', experiencia: 'Experiência', habilidade: 'Habilidade' };

  // ---------- Selo ao lado do nome ----------

  /** Classe da moldura do avatar (vazia sem moldura). */
  function classeMoldura(jogador) {
    var m = jogador && jogador.selo && jogador.selo.moldura;
    return m && m !== 'moldura_nenhuma' ? ' moldura-' + m.replace('moldura_', '') : '';
  }

  /** Nível e título, para a lista de quem está na sala. */
  function selo(jogador) {
    var s = jogador && jogador.selo;
    if (!s) return '';
    return '<span class="selo-nivel" title="Nível ' + s.nivel + ' · ' + esc(s.titulo) + '">' +
      '<b>' + s.nivel + '</b><span class="selo-titulo">' + esc(s.titulo) + '</span></span>';
  }

  // ---------- Barra de XP ----------

  function barra(nivel) {
    var pct = Math.round(nivel.progresso * 100);
    var texto = nivel.xpProximoNivel === null
      ? numero(nivel.xp) + ' XP · nível máximo'
      : numero(nivel.xp) + ' XP · faltam ' + numero(nivel.falta) + ' para o nível ' + (nivel.nivel + 1);
    return '<div class="xp">' +
      '<div class="xp-topo"><span class="xp-nivel">Nível ' + nivel.nivel + '</span><span class="xp-titulo">' + esc(nivel.titulo) + '</span></div>' +
      '<div class="xp-barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="Progresso até o próximo nível">' +
        '<span style="width:' + pct + '%"></span></div>' +
      '<p class="xp-texto">' + texto + '</p>' +
      '</div>';
  }

  // ---------- Placar final ----------

  function motivo(d, nomes) {
    switch (d.motivo) {
      case 'participacao': return 'Partida concluída';
      case 'acertos_turma': return d.quantidade + (d.quantidade === 1 ? ' acerto' : ' acertos') + ' da turma';
      case 'pistas_certas': return d.quantidade + (d.quantidade === 1 ? ' pista sua acertada' : ' pistas suas acertadas');
      case 'desafio': return 'Turma com 20 acertos ou mais';
      default: return d.motivo;
    }
  }

  /** Bloco "Seu progresso" do placar final. `p` vem do servidor (ou null sem progressão). */
  function blocoFim(p) {
    if (!p) return '';
    var html;
    if (p.carregando) {
      html = '<p class="suave">Calculando seu XP…</p>';
    } else if (p.erro) {
      html = '<p class="suave">Não deu para salvar esta partida no seu histórico.</p>';
    } else if (p.semXp || !p.valida) {
      html = '<p class="suave">Esta partida não rendeu XP: só conta quem estava na sala no fim e participou.</p>';
    } else {
      var nomes = {};
      (p.conquistas || []).forEach(function (c) { nomes[c.id] = c.nome; });
      // As conquistas já aparecem com o motivo logo acima; na conta entram numa linha só.
      var linhas = p.detalhe.filter(function (d) { return d.motivo !== 'conquista'; });
      var deConquistas = p.detalhe.filter(function (d) { return d.motivo === 'conquista'; });
      if (deConquistas.length) {
        linhas.push({
          texto: deConquistas.length === 1 ? 'Conquista nova' : deConquistas.length + ' conquistas novas',
          xp: deConquistas.reduce(function (s, d) { return s + d.xp; }, 0)
        });
      }
      html =
        (p.subiuDeNivel ? '<p class="progresso-destaque">Você chegou ao nível ' + p.nivel.nivel + ': ' + esc(p.nivel.titulo) + '!</p>' : '') +
        (p.conquistas || []).map(function (c) {
          return '<p class="progresso-conquista"><span aria-hidden="true">🏅</span> <b>' + esc(c.nome) + '</b> · ' + esc(c.descricao) + '</p>';
        }).join('') +
        '<ul class="xp-detalhe">' + linhas.map(function (d) {
          return '<li><span>' + esc(d.texto || motivo(d, nomes)) + '</span><b>+' + d.xp + '</b></li>';
        }).join('') +
        '<li class="xp-total"><span>Total</span><b>+' + p.xpGanho + ' XP</b></li></ul>' +
        (p.limitado ? '<p class="suave xp-aviso">Depois de 10 partidas em 24 horas, só a participação conta.</p>' : '') +
        barra(p.nivel);
    }
    return '<section class="progresso-fim" aria-live="polite"><p class="rotulo">Seu progresso</p>' + html + '</section>';
  }

  // ---------- Tela de perfil ----------

  function condicao(item, conquistas) {
    if (item.condicao.nivel) return 'Nível ' + item.condicao.nivel;
    var c = conquistas.filter(function (x) { return x.id === item.condicao.conquista; })[0];
    return 'Conquista ' + (c ? c.nome : '');
  }

  function data(ms) {
    try {
      return new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    } catch (e) {
      return '';
    }
  }

  function htmlPerfil(p) {
    var jogou = p.historico.length > 0;
    var html = '<p class="rotulo">Seu perfil</p>' +
      '<h2 id="perfil-titulo">' + esc(p.nome || 'Você') + '</h2>' + barra(p.nivel);

    if (!jogou) {
      html += '<p class="perfil-vazio">Você ainda não tem partidas salvas. Jogue uma partida online até o fim para começar seu histórico.</p>';
    } else {
      var r = p.recordes;
      var numeros = [
        ['Partidas concluídas', numero(p.partidas.concluidas)],
        ['Acertos da turma', porcentagem(p.precisaoTurma), numero(p.acertosTurma) + ' de ' + numero(p.cartas) + ' cartas'],
        ['Suas pistas certeiras', porcentagem(p.precisaoPistas), numero(p.pistasCertas) + ' de ' + numero(p.pistasDadas)],
        ['Melhor partida', r.melhorPontuacao === null ? '—' : r.melhorPontuacao + '/25'],
        ['Maior sequência', r.maiorSequencia === null ? '—' : String(r.maiorSequencia)],
        ['Tabuleiros perfeitos', String(r.perfeitas)]
      ];
      html += '<h3>Estatísticas gerais</h3><dl class="perfil-numeros">' + numeros.map(function (n) {
        return '<div><dt>' + n[0] + '</dt><dd>' + n[1] + (n[2] ? '<small>' + n[2] + '</small>' : '') + '</dd></div>';
      }).join('') + '</dl>';
      if (p.partidas.saiuAntes || p.partidas.interrompidas) {
        html += '<p class="suave perfil-nota">' +
          (p.partidas.saiuAntes ? p.partidas.saiuAntes + ' que você saiu antes do fim. ' : '') +
          (p.partidas.interrompidas ? p.partidas.interrompidas + ' interrompidas.' : '') + '</p>';
      }
    }

    var feitas = p.conquistas.filter(function (c) { return c.desbloqueada; }).length;
    html += '<h3>Conquistas <small>' + feitas + ' de ' + p.conquistas.length + '</small></h3>';
    Object.keys(CATEGORIAS).forEach(function (cat) {
      var lista = p.conquistas.filter(function (c) { return c.categoria === cat; });
      html += '<p class="perfil-categoria">' + CATEGORIAS[cat] + '</p><ul class="perfil-conquistas">' + lista.map(function (c) {
        return '<li class="' + (c.desbloqueada ? 'is-feita' : '') + '">' +
          '<span class="conquista-icone" aria-hidden="true">' + (c.desbloqueada ? '🏅' : '🔒') + '</span>' +
          '<span><b>' + esc(c.nome) + '</b><small>' + esc(c.descricao) +
          (c.desbloqueada ? ' · ' + data(c.em) : ' · +' + c.xp + ' XP') + '</small></span></li>';
      }).join('') + '</ul>';
    });

    html += '<h3>Itens</h3><p class="suave perfil-nota">Só mudam o visual. Ninguém ganha vantagem no jogo.</p>';
    TIPOS.forEach(function (tipo) {
      var itens = p.recompensas.filter(function (x) { return x.tipo === tipo.id; });
      html += '<p class="perfil-categoria">' + tipo.nome + '</p><div class="perfil-itens">' + itens.map(function (x) {
        var escolhido = p.visual[tipo.id] === x.id;
        return '<button type="button" class="item' + (escolhido ? ' is-escolhido' : '') + '"' +
          ' data-item-tipo="' + tipo.id + '" data-item-id="' + esc(x.id) + '"' +
          ' aria-pressed="' + escolhido + '"' + (x.liberada ? '' : ' disabled') + '>' +
          esc(x.nome) + (x.liberada ? '' : '<small>🔒 ' + esc(condicao(x, p.conquistas)) + '</small>') + '</button>';
      }).join('') + '</div>';
    });
    html += '<div class="erro-campo" role="alert"></div>';

    if (jogou) {
      html += '<h3>Últimas partidas</h3><ol class="perfil-historico">' + p.historico.map(function (h) {
        var estado = h.estado === 'interrompida' ? 'interrompida' : h.presenteNoFim ? '' : 'você saiu antes';
        return '<li><span class="hist-data">' + data(h.encerradaEm) + '</span>' +
          '<span class="hist-barra" aria-hidden="true"><span style="width:' + Math.round(h.acertos / h.totalCartas * 100) + '%"></span></span>' +
          '<span class="hist-placar">' + h.acertos + '/' + h.totalCartas + (estado ? ' <small>' + estado + '</small>' : '') + '</span>' +
          '<span class="hist-xp">' + (h.xpGanho ? '+' + h.xpGanho + ' XP' : '—') + '</span></li>';
      }).join('') + '</ol>';
    }

    html += '<p class="suave perfil-nota">Seu progresso fica salvo neste navegador. Em outro aparelho, em outro navegador ou numa aba anônima ele começa do zero.</p>';
    return html;
  }

  /** Abre a tela de perfil por cima do que estiver na tela. */
  function abrir(rede) {
    var antes = document.activeElement;
    var camada = document.createElement('div');
    camada.className = 'sobreposicao perfil-sobreposicao';
    camada.innerHTML = '<div class="cartao-modal modal-perfil" role="dialog" aria-modal="true" aria-labelledby="perfil-titulo">' +
      '<button type="button" class="perfil-fechar" data-perfil="fechar" aria-label="Fechar perfil">✕</button>' +
      '<div class="perfil-conteudo"><p class="suave" role="status">Carregando seu perfil…</p></div></div>';
    document.body.appendChild(camada);
    var conteudo = camada.querySelector('.perfil-conteudo');
    camada.querySelector('[data-perfil="fechar"]').focus();
    var ocupado = false;

    function mostrar(p) {
      conteudo.innerHTML = htmlPerfil(p);
      if (typeof Theme !== 'undefined' && p.visual.tabuleiro) Theme.aplicar(p.visual.tabuleiro);
    }

    function fechar() {
      document.removeEventListener('keydown', teclado);
      camada.remove();
      if (antes && antes.focus) antes.focus();
    }

    function teclado(ev) {
      if (ev.key === 'Escape') fechar();
    }

    camada.addEventListener('click', function (ev) {
      if (ev.target === camada || ev.target.closest('[data-perfil="fechar"]')) { fechar(); return; }
      var item = ev.target.closest('[data-item-id]');
      if (!item || item.disabled || ocupado) return;
      ocupado = true;
      rede.escolherVisual(item.getAttribute('data-item-tipo'), item.getAttribute('data-item-id')).then(function (r) {
        ocupado = false;
        if (!camada.isConnected) return;
        if (r.ok) {
          var rolagem = camada.scrollTop;
          mostrar(r.perfil);
          camada.scrollTop = rolagem;
          var mesmo = conteudo.querySelector('[data-item-id="' + item.getAttribute('data-item-id') + '"]');
          if (mesmo) mesmo.focus();
        } else {
          var erro = conteudo.querySelector('.erro-campo');
          if (erro) erro.textContent = r.erro;
        }
      });
    });
    document.addEventListener('keydown', teclado);

    rede.perfil().then(function (r) {
      if (!camada.isConnected) return;
      if (r.ok) mostrar(r.perfil);
      else conteudo.innerHTML = '<p class="rotulo">Seu perfil</p><h2 id="perfil-titulo">Perfil indisponível</h2><p class="suave">' + esc(r.erro) + '</p>';
    });
  }

  return { selo: selo, classeMoldura: classeMoldura, blocoFim: blocoFim, barra: barra, abrir: abrir };
})();
