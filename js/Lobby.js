/**
 * Lobby — tela de entrada do modo online: criar sala, entrar com código e esperar a turma.
 * Quando o anfitrião começa a partida, entrega a tela para a UI do jogo (`aoComecar`).
 */
var Lobby = (function () {
  'use strict';

  var t = Textos.t;

  function esc(texto) {
    return String(texto).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function codigoDaUrl() {
    var m = /[?&]sala=([A-Za-z]{4})\b/.exec(window.location.search);
    return m ? m[1].toUpperCase() : '';
  }

  function avisoDaUrl() {
    return /[?&]aviso=sala-encerrada\b/.test(window.location.search);
  }

  function linkConvite(codigo) {
    return window.location.origin + window.location.pathname + '?sala=' + codigo;
  }

  function moldeInicio() {
    return [
      '<div class="lobby">',
      '  <h1 class="marca marca-grande">Tá <span>Ligado?</span></h1>',
      '  <p class="lobby-sub">' + t('lobby.sub') + '</p>',
      '  <p class="lobby-aviso" role="status" hidden>' + t('lobby.salaEncerrada') + '</p>',
      '  <form class="cartao-modal lobby-cartao" data-form="entrar" autocomplete="off">',
      '    <label class="lobby-rotulo" for="lobby-nome">' + t('lobby.seuNome') + '</label>',
      '    <input class="lobby-campo" id="lobby-nome" name="nome" maxlength="20" placeholder="' + t('lobby.nomeExemplo') + '">',
      '    <div class="lobby-codigo">',
      '      <div>',
      '        <label class="lobby-rotulo" for="lobby-codigo">' + t('lobby.codigoSala') + '</label>',
      '        <input class="lobby-campo campo-codigo" id="lobby-codigo" name="codigo" maxlength="4" placeholder="ABCD" autocapitalize="characters" spellcheck="false">',
      '      </div>',
      '      <button type="submit" class="botao botao-primario" data-lobby="entrar">' + t('lobby.entrar') + '</button>',
      '    </div>',
      '    <div class="lobby-ou"><span>' + t('lobby.ou') + '</span></div>',
      '    <button type="button" class="botao botao-primario botao-largo" data-lobby="criar">' + t('lobby.criar') + '</button>',
      '    <div class="erro-campo" role="alert"></div>',
      '  </form>',
      '  <div class="lobby-extras">',
      '    <button type="button" class="botao botao-fantasma" data-lobby="perfil">' + t('geral.meuPerfil') + '</button>',
      '    <button type="button" class="botao botao-fantasma" data-lobby="local">' + t('geral.jogarLocal') + '</button>',
      '  </div>',
      '  <a class="lobby-rodape" href="privacidade.html">' + t('lobby.privacidade') + '</a>',
      '</div>'
    ].join('');
  }

  function moldeSala() {
    return [
      '<div class="lobby">',
      '  <h1 class="marca">Tá <span>Ligado?</span></h1>',
      '  <p class="lobby-aviso" data-lobby="reinicio" role="status" hidden>' + t('geral.salaReiniciando') + '</p>',
      '  <section class="cartao-modal lobby-cartao">',
      '    <p class="rotulo">' + t('lobby.codigoSala') + '</p>',
      '    <div class="codigo-sala" aria-live="polite"></div>',
      '    <button type="button" class="botao botao-fantasma botao-pequeno" data-lobby="copiar">' + t('lobby.copiar') + '</button>',
      '    <p class="lobby-copiado suave" aria-live="polite"></p>',
      '    <div class="lobby-social"></div>',
      '    <h2>' + t('lobby.quemEsta') + '</h2>',
      '    <ul class="lista-jogadores"></ul>',
      '    <div class="lobby-acoes"></div>',
      '    <div class="erro-campo" role="alert"></div>',
      '  </section>',
      '  <div class="lobby-extras">',
      '    <button type="button" class="botao botao-fantasma" data-lobby="perfil">' + t('geral.meuPerfil') + '</button>',
      '    <button type="button" class="botao botao-fantasma" data-lobby="sair">' + t('lobby.sair') + '</button>',
      '  </div>',
      '</div>'
    ].join('');
  }

  function criar(raiz, rede, opcoes) {
    var tela = null;
    var ocupado = false;
    var acoesAtuais = null;
    var onlineAntes = -1; // para tocar um som quando alguém entra na sala de espera

    function render() {
      var sala = rede.sala();
      var jogo = rede.visao();
      if (sala && jogo) { comecar(); return; }

      var novaTela = sala ? 'sala' : rede.temSalaSalva() ? 'voltando' : 'inicio';
      if (novaTela !== tela) {
        tela = novaTela;
        acoesAtuais = null;
        if (tela === 'inicio') {
          raiz.innerHTML = moldeInicio();
          raiz.querySelector('[name="nome"]').value = rede.nomeSalvo();
          raiz.querySelector('[name="codigo"]').value = codigoDaUrl();
          raiz.querySelector('.lobby-aviso').hidden = !(rede.salaEncerrada() || avisoDaUrl());
          var foco = rede.nomeSalvo() ? (codigoDaUrl() ? '[data-lobby="entrar"]' : '[name="codigo"]') : '[name="nome"]';
          raiz.querySelector(foco).focus();
        } else if (tela === 'sala') {
          raiz.innerHTML = moldeSala();
          if (opcoes.social) raiz.querySelector('.lobby-social').innerHTML = opcoes.social.slot();
          if (opcoes.som) raiz.querySelector('.lobby-extras').insertAdjacentHTML('afterbegin', Som.botao(opcoes.som.ligado()));
        } else {
          raiz.innerHTML = '<div class="lobby"><h1 class="marca marca-grande">Tá <span>Ligado?</span></h1>' +
            '<p class="lobby-sub">' + t('lobby.voltando') + '</p></div>';
        }
      }
      if (tela === 'sala') renderSala(sala);
    }

    function renderSala(sala) {
      raiz.querySelector('[data-lobby="reinicio"]').hidden = !rede.reiniciando();
      raiz.querySelector('.codigo-sala').innerHTML = sala.codigo.split('').map(function (l) {
        return '<span>' + l + '</span>';
      }).join('');

      raiz.querySelector('.lista-jogadores').innerHTML = sala.jogadores.map(function (j) {
        return '<li class="' + (j.online ? '' : 'is-offline') + '" data-jogador-id="' + esc(j.id) + '">' +
          '<span class="avatar' + Progresso.classeMoldura(j) + '">' + esc(j.nome.charAt(0).toUpperCase()) + '</span>' +
          '<span class="jogador-nome">' + esc(j.nome) + (j.id === sala.euId ? ' <small>' + t('lobby.voce') + '</small>' : '') + '</span>' +
          Progresso.selo(j) +
          (opcoes.social ? opcoes.social.iconeVoz(j) : '') +
          (j.id === sala.anfitriaoId ? '<span class="selo-anfitriao" title="' + t('lobby.anfitriao') + '">👑</span>' : '') +
          (j.online ? '' : '<small class="jogador-status">' + t('lobby.saiu') + '</small>') +
          '</li>';
      }).join('');

      var online = sala.jogadores.filter(function (j) { return j.online; }).length;
      if (opcoes.som && onlineAntes >= 0 && online > onlineAntes) opcoes.som.tocar('entrou');
      onlineAntes = online;
      var html;
      if (rede.souAnfitriao()) {
        html = '<button type="button" class="botao botao-primario botao-largo" data-lobby="comecar"' +
          (online < 2 ? ' disabled' : '') + '>' + t('lobby.comecar') + '</button>' +
          (online < 2 ? '<p class="suave">' + t('lobby.precisaDois') + '</p>' : '');
      } else {
        var anfitriao = rede.jogador(sala.anfitriaoId);
        html = '<p class="suave">' + t('lobby.esperando', { nome: esc(anfitriao ? anfitriao.nome : t('geral.oAnfitriao')) }) + '</p>';
      }
      if (html !== acoesAtuais) { acoesAtuais = html; raiz.querySelector('.lobby-acoes').innerHTML = html; }
      if (opcoes.social) opcoes.social.atualizar();
    }

    function mostrarErro(mensagem) {
      var erro = raiz.querySelector('.erro-campo');
      if (erro) erro.textContent = mensagem || '';
    }

    function executar(promessa) {
      if (ocupado) return;
      ocupado = true;
      mostrarErro('');
      promessa.then(function (r) {
        ocupado = false;
        if (r && !r.ok) mostrarErro(r.erro);
      });
    }

    function valor(nome) {
      var campo = raiz.querySelector('[name="' + nome + '"]');
      return campo ? campo.value.trim() : '';
    }

    function agir(acao) {
      switch (acao) {
        case 'criar':
          if (!valor('nome')) { mostrarErro(t('geral.digiteNome')); raiz.querySelector('[name="nome"]').focus(); return; }
          executar(rede.criarSala(valor('nome')));
          break;
        case 'entrar':
          if (!valor('nome')) { mostrarErro(t('geral.digiteNome')); raiz.querySelector('[name="nome"]').focus(); return; }
          if (valor('codigo').length !== 4) { mostrarErro(t('lobby.codigoQuatro')); raiz.querySelector('[name="codigo"]').focus(); return; }
          executar(rede.entrar(valor('codigo'), valor('nome')));
          break;
        case 'comecar':
          executar(rede.iniciar());
          break;
        case 'copiar':
          copiarConvite(rede.sala().codigo);
          break;
        case 'sair':
          rede.sair().then(function () { window.location.href = window.location.pathname; });
          break;
        case 'perfil':
          Progresso.abrir(rede);
          break;
        case 'local':
          desligar();
          opcoes.aoJogarLocal();
          break;
      }
    }

    function copiarConvite(codigo) {
      var link = linkConvite(codigo);
      var aviso = raiz.querySelector('.lobby-copiado');
      function mostrar(texto) { if (aviso) aviso.textContent = texto; }
      try {
        navigator.clipboard.writeText(link).then(
          function () { mostrar(t('lobby.copiado')); },
          function () { mostrar(link); }
        );
      } catch (e) {
        mostrar(link);
      }
    }

    function aoClicar(ev) {
      var botao = ev.target.closest('[data-lobby]');
      if (botao && !botao.disabled && botao.type !== 'submit') agir(botao.getAttribute('data-lobby'));
    }
    function aoEnviar(ev) {
      ev.preventDefault();
      agir('entrar');
    }
    function aoDigitar(ev) {
      if (ev.target.name === 'codigo') ev.target.value = ev.target.value.toUpperCase().replace(/[^A-Z]/g, '');
    }

    raiz.addEventListener('click', aoClicar);
    raiz.addEventListener('submit', aoEnviar);
    raiz.addEventListener('input', aoDigitar);
    var cancelar = rede.assinar(render);

    function desligar() {
      cancelar();
      raiz.removeEventListener('click', aoClicar);
      raiz.removeEventListener('submit', aoEnviar);
      raiz.removeEventListener('input', aoDigitar);
    }

    function comecar() {
      desligar();
      raiz.innerHTML = '';
      opcoes.aoComecar();
    }

    render();
  }

  return { criar: criar };
})();
