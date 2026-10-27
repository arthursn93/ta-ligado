/**
 * Progresso — o que o jogador vê da progressão: selo ao lado do nome, resumo de XP no placar final
 * e a tela de perfil (nível, estatísticas, conquistas, itens e histórico).
 *
 * Só mostra: XP, nível e conquistas chegam prontos do servidor. Escolher um item visual é um pedido
 * que o servidor confere antes de salvar.
 */
var Progresso = (function () {
  'use strict';

  var t = Textos.t;

  function esc(texto) {
    return String(texto).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function numero(n) {
    return Number(n).toLocaleString(t('geral.local'));
  }

  function porcentagem(p) {
    return p === null || p === undefined ? '—' : String(p).replace('.', t('geral.decimal')) + '%';
  }

  var TIPOS = [
    { id: 'titulo', nome: 'progresso.tipoTitulo' },
    { id: 'moldura', nome: 'progresso.tipoMoldura' },
    { id: 'tabuleiro', nome: 'progresso.tipoTabuleiro' }
  ];
  var CATEGORIAS = {
    iniciacao: 'progresso.catIniciacao', consistencia: 'progresso.catConsistencia',
    experiencia: 'progresso.catExperiencia', habilidade: 'progresso.catHabilidade'
  };

  // ---------- Nomes de títulos, itens e conquistas ----------
  // O servidor manda o nome em português e o id; aqui vira o texto do idioma escolhido.

  function nomeItem(id, reserva) {
    return Textos.ou('item.' + id, reserva);
  }

  /** Título de um nível ou de um selo ({titulo, tituloId}). */
  function titulo(x) {
    return x.tituloId ? nomeItem(x.tituloId, x.titulo) : x.titulo;
  }

  function nomeConquista(c) {
    return Textos.ou('conquista.' + c.id, c.nome);
  }

  function textoConquista(c) {
    return Textos.ou('conquistaTexto.' + c.id, c.descricao);
  }

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
    return '<span class="selo-nivel" title="' + t('progresso.nivelTitulo', { nivel: s.nivel, titulo: esc(titulo(s)) }) + '">' +
      '<b>' + s.nivel + '</b><span class="selo-titulo">' + esc(titulo(s)) + '</span></span>';
  }

  // ---------- Barra de XP ----------

  function barra(nivel) {
    var pct = Math.round(nivel.progresso * 100);
    var texto = nivel.xpProximoNivel === null
      ? t('progresso.xpMaximo', { xp: numero(nivel.xp) })
      : t('progresso.xpFalta', { xp: numero(nivel.xp), falta: numero(nivel.falta), proximo: nivel.nivel + 1 });
    return '<div class="xp">' +
      '<div class="xp-topo"><span class="xp-nivel">' + t('progresso.nivel', { nivel: nivel.nivel }) + '</span><span class="xp-titulo">' + esc(titulo(nivel)) + '</span></div>' +
      '<div class="xp-barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="' + t('progresso.barraRotulo') + '">' +
        '<span style="width:' + pct + '%"></span></div>' +
      '<p class="xp-texto">' + texto + '</p>' +
      '</div>';
  }

  // ---------- Placar final ----------

  function motivo(d, nomes) {
    switch (d.motivo) {
      case 'participacao': return t('progresso.participacao');
      case 'acertos_turma': return t(d.quantidade === 1 ? 'progresso.acertoTurma' : 'progresso.acertosTurma', { n: d.quantidade });
      case 'pistas_certas': return t(d.quantidade === 1 ? 'progresso.pistaCerta' : 'progresso.pistasCertas', { n: d.quantidade });
      case 'desafio': return t('progresso.desafio');
      default: return d.motivo;
    }
  }

  /** Bloco "Seu progresso" do placar final. `p` vem do servidor (ou null sem progressão). */
  function blocoFim(p) {
    if (!p) return '';
    var html;
    if (p.carregando) {
      html = '<p class="suave">' + t('progresso.calculando') + '</p>';
    } else if (p.erro) {
      html = '<p class="suave">' + t('progresso.erroSalvar') + '</p>';
    } else if (p.semXp || !p.valida) {
      html = '<p class="suave">' + t('progresso.semXp') + '</p>';
    } else {
      var nomes = {};
      (p.conquistas || []).forEach(function (c) { nomes[c.id] = c.nome; });
      // As conquistas já aparecem com o motivo logo acima; na conta entram numa linha só.
      var linhas = p.detalhe.filter(function (d) { return d.motivo !== 'conquista'; });
      var deConquistas = p.detalhe.filter(function (d) { return d.motivo === 'conquista'; });
      if (deConquistas.length) {
        linhas.push({
          texto: deConquistas.length === 1 ? t('progresso.conquistaNova') : t('progresso.conquistasNovas', { n: deConquistas.length }),
          xp: deConquistas.reduce(function (s, d) { return s + d.xp; }, 0)
        });
      }
      html =
        (p.subiuDeNivel ? '<p class="progresso-destaque">' + t('progresso.subiu', { nivel: p.nivel.nivel, titulo: esc(titulo(p.nivel)) }) + '</p>' : '') +
        (p.conquistas || []).map(function (c) {
          return '<p class="progresso-conquista"><span aria-hidden="true">🏅</span> <b>' + esc(nomeConquista(c)) + '</b> · ' + esc(textoConquista(c)) + '</p>';
        }).join('') +
        '<ul class="xp-detalhe">' + linhas.map(function (d) {
          return '<li><span>' + esc(d.texto || motivo(d, nomes)) + '</span><b>+' + d.xp + '</b></li>';
        }).join('') +
        '<li class="xp-total"><span>' + t('progresso.total') + '</span><b>+' + p.xpGanho + ' XP</b></li></ul>' +
        (p.limitado ? '<p class="suave xp-aviso">' + t('progresso.limitado') + '</p>' : '') +
        barra(p.nivel);
    }
    return '<section class="progresso-fim" aria-live="polite"><p class="rotulo">' + t('progresso.seuProgresso') + '</p>' + html + '</section>';
  }

  // ---------- Tela de perfil ----------

  function condicao(item, conquistas) {
    if (item.condicao.nivel) return t('progresso.nivel', { nivel: item.condicao.nivel });
    var c = conquistas.filter(function (x) { return x.id === item.condicao.conquista; })[0];
    return t('progresso.condConquista', { nome: c ? nomeConquista(c) : '' });
  }

  function data(ms) {
    try {
      return new Date(ms).toLocaleDateString(t('geral.local'), { day: '2-digit', month: 'short' });
    } catch (e) {
      return '';
    }
  }

  function htmlPerfil(p) {
    var jogou = p.historico.length > 0;
    var html = '<p class="rotulo">' + t('perfil.seuPerfil') + '</p>' +
      '<h2 id="perfil-titulo">' + esc(p.nome || t('perfil.voce')) + '</h2>' + barra(p.nivel);

    if (!jogou) {
      html += '<p class="perfil-vazio">' + t('perfil.vazio') + '</p>';
    } else {
      var r = p.recordes;
      var numeros = [
        [t('perfil.partidas'), numero(p.partidas.concluidas)],
        [t('perfil.acertosTurma'), porcentagem(p.precisaoTurma), t('perfil.deCartas', { feitas: numero(p.acertosTurma), total: numero(p.cartas) })],
        [t('perfil.pistas'), porcentagem(p.precisaoPistas), t('perfil.de', { feitas: numero(p.pistasCertas), total: numero(p.pistasDadas) })],
        [t('perfil.melhor'), r.melhorPontuacao === null ? '—' : r.melhorPontuacao + '/25'],
        [t('perfil.sequencia'), r.maiorSequencia === null ? '—' : String(r.maiorSequencia)],
        [t('perfil.perfeitos'), String(r.perfeitas)]
      ];
      html += '<h3>' + t('perfil.estatisticas') + '</h3><dl class="perfil-numeros">' + numeros.map(function (n) {
        return '<div><dt>' + n[0] + '</dt><dd>' + n[1] + (n[2] ? '<small>' + n[2] + '</small>' : '') + '</dd></div>';
      }).join('') + '</dl>';
      if (p.partidas.saiuAntes || p.partidas.interrompidas) {
        html += '<p class="suave perfil-nota">' +
          (p.partidas.saiuAntes ? t('perfil.saiuAntes', { n: p.partidas.saiuAntes }) : '') +
          (p.partidas.interrompidas ? t('perfil.interrompidas', { n: p.partidas.interrompidas }) : '') + '</p>';
      }
    }

    var feitas = p.conquistas.filter(function (c) { return c.desbloqueada; }).length;
    html += '<h3>' + t('perfil.conquistas', { feitas: feitas, total: p.conquistas.length }) + '</h3>';
    Object.keys(CATEGORIAS).forEach(function (cat) {
      var lista = p.conquistas.filter(function (c) { return c.categoria === cat; });
      html += '<p class="perfil-categoria">' + t(CATEGORIAS[cat]) + '</p><ul class="perfil-conquistas">' + lista.map(function (c) {
        return '<li class="' + (c.desbloqueada ? 'is-feita' : '') + '">' +
          '<span class="conquista-icone" aria-hidden="true">' + (c.desbloqueada ? '🏅' : '🔒') + '</span>' +
          '<span><b>' + esc(nomeConquista(c)) + '</b><small>' + esc(textoConquista(c)) +
          (c.desbloqueada ? ' · ' + data(c.em) : ' · +' + c.xp + ' XP') + '</small></span></li>';
      }).join('') + '</ul>';
    });

    html += '<h3>' + t('perfil.itens') + '</h3><p class="suave perfil-nota">' + t('perfil.itensNota') + '</p>';
    TIPOS.forEach(function (tipo) {
      var itens = p.recompensas.filter(function (x) { return x.tipo === tipo.id; });
      html += '<p class="perfil-categoria">' + t(tipo.nome) + '</p><div class="perfil-itens">' + itens.map(function (x) {
        var escolhido = p.visual[tipo.id] === x.id;
        return '<button type="button" class="item' + (escolhido ? ' is-escolhido' : '') + '"' +
          ' data-item-tipo="' + tipo.id + '" data-item-id="' + esc(x.id) + '"' +
          ' aria-pressed="' + escolhido + '"' + (x.liberada ? '' : ' disabled') + '>' +
          esc(nomeItem(x.id, x.nome)) + (x.liberada ? '' : '<small>🔒 ' + esc(condicao(x, p.conquistas)) + '</small>') + '</button>';
      }).join('') + '</div>';
    });
    html += '<div class="erro-campo" role="alert"></div>';

    if (jogou) {
      html += '<h3>' + t('perfil.ultimas') + '</h3><ol class="perfil-historico">' + p.historico.map(function (h) {
        var estado = h.estado === 'interrompida' ? t('perfil.histInterrompida') : h.presenteNoFim ? '' : t('perfil.histSaiu');
        return '<li><span class="hist-data">' + data(h.encerradaEm) + '</span>' +
          '<span class="hist-barra" aria-hidden="true"><span style="width:' + Math.round(h.acertos / h.totalCartas * 100) + '%"></span></span>' +
          '<span class="hist-placar">' + h.acertos + '/' + h.totalCartas + (estado ? ' <small>' + estado + '</small>' : '') + '</span>' +
          '<span class="hist-xp">' + (h.xpGanho ? '+' + h.xpGanho + ' XP' : '—') + '</span></li>';
      }).join('') + '</ol>';
    }

    html += '<p class="suave perfil-nota">' + t('perfil.salvoNavegador') + '</p>';
    return html;
  }

  /** Abre a tela de perfil por cima do que estiver na tela. */
  function abrir(rede) {
    var antes = document.activeElement;
    var camada = document.createElement('div');
    camada.className = 'sobreposicao perfil-sobreposicao';
    camada.innerHTML = '<div class="cartao-modal modal-perfil" role="dialog" aria-modal="true" aria-labelledby="perfil-titulo">' +
      '<button type="button" class="perfil-fechar" data-perfil="fechar" aria-label="' + t('perfil.fechar') + '">✕</button>' +
      '<div class="perfil-conteudo"><p class="suave" role="status">' + t('perfil.carregando') + '</p></div></div>';
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
      else conteudo.innerHTML = '<p class="rotulo">' + t('perfil.seuPerfil') + '</p><h2 id="perfil-titulo">' + t('perfil.indisponivel') + '</h2><p class="suave">' + esc(r.erro) + '</p>';
    });
  }

  return { selo: selo, titulo: titulo, classeMoldura: classeMoldura, blocoFim: blocoFim, barra: barra, abrir: abrir };
})();
