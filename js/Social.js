/**
 * Social — chat por texto e conversa por voz da sala (só no modo online).
 *
 * Chat: mensagens vão pelo Socket.io; o servidor valida e entrega só para a mesma sala.
 * Voz: WebRTC de aparelho para aparelho (cada um conecta com cada um), com o Socket.io servindo
 * só para combinar a conexão (oferta, resposta e candidatos). O áudio não passa pelo servidor.
 *
 * A tela (Lobby/UI) só reserva espaço: `slot()` para os botões e `iconeVoz(jogador)` nos nomes.
 * O resto (painel do chat, cartão de permissão, elementos de áudio) este módulo põe no <body>.
 */
var Social = (function () {
  'use strict';

  var TAMANHO_MAX = 200;
  var LARGURA_PAINEL_FIXO = 1100; // a partir daqui o chat fica aberto ao lado do jogo

  function esc(texto) {
    return String(texto).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function telaLarga() {
    return window.matchMedia && window.matchMedia('(min-width: ' + LARGURA_PAINEL_FIXO + 'px)').matches;
  }

  function criar(rede) {
    // ---------- Estado ----------
    var mensagens = [];
    var naoLidas = 0;
    var chatAberto = telaLarga();
    var erroChat = '';
    var cartaoVoz = null; // null | 'pedir' | 'negado' | 'sem-suporte'

    var voz = {
      estado: null,       // null | 'ouvindo' | 'mudo' | 'ligado' (o que este aparelho quer)
      stream: null,       // microfone
      ice: null,          // servidores STUN/TURN vindos do servidor
      pares: {},          // jogadorId -> { pc, audio, pendentes, iniciador, tentativas }
      contexto: null,     // AudioContext para saber quem está falando
      medidores: {},      // jogadorId ou 'eu' -> AnalyserNode
      falando: {}
    };

    // ---------- Elementos fixos no <body> ----------
    var painel = document.createElement('aside');
    painel.className = 'chat';
    painel.hidden = true;
    painel.setAttribute('aria-label', 'Chat da sala');
    painel.innerHTML =
      '<header class="chat-topo"><h2>Chat da sala</h2>' +
      '<button type="button" class="chat-fechar" data-social="fechar-chat" aria-label="Fechar chat">✕</button></header>' +
      '<ol class="chat-lista" aria-live="polite"></ol>' +
      '<form class="chat-form" autocomplete="off">' +
        '<input name="texto" maxlength="' + TAMANHO_MAX + '" placeholder="Escreva para a sala…" aria-label="Mensagem">' +
        '<button type="submit" class="botao botao-primario" aria-label="Enviar">➤</button>' +
      '</form>' +
      '<p class="chat-erro" role="alert"></p>';
    document.body.appendChild(painel);
    var lista = painel.querySelector('.chat-lista');
    var campo = painel.querySelector('input[name="texto"]');
    var erroEl = painel.querySelector('.chat-erro');

    var sobreposicao = document.createElement('div');
    sobreposicao.className = 'sobreposicao social-sobreposicao';
    sobreposicao.hidden = true;
    sobreposicao.innerHTML = '<div class="cartao-modal" role="dialog" aria-modal="true"></div>';
    document.body.appendChild(sobreposicao);

    var caixaAudio = document.createElement('div');
    caixaAudio.hidden = true;
    document.body.appendChild(caixaAudio);

    // ---------- Chat ----------

    rede.on('chat:historico', function (historico) {
      mensagens = Array.isArray(historico) ? historico.slice(-50) : [];
      naoLidas = 0;
      renderLista(true);
      atualizar();
    });

    rede.on('chat', function (m) {
      if (!m || typeof m.texto !== 'string') return;
      mensagens.push(m);
      if (mensagens.length > 50) mensagens.shift();
      var sala = rede.sala();
      if (!chatAberto && (!sala || m.autorId !== sala.euId)) naoLidas++;
      renderLista(false);
      atualizar();
    });

    function renderLista(forcarFim) {
      var sala = rede.sala();
      var perto = lista.scrollHeight - lista.scrollTop - lista.clientHeight < 60;
      lista.innerHTML = mensagens.length ? mensagens.map(function (m) {
        var minha = sala && m.autorId === sala.euId;
        var hora = new Date(m.em);
        return '<li class="msg' + (minha ? ' is-minha' : '') + '">' +
          '<b class="msg-autor cor-' + 'ABCDE'.charAt(corDe(m.autorId)) + '">' + esc(m.nome) + '</b>' +
          '<span class="msg-texto">' + esc(m.texto) + '</span>' +
          '<time>' + ('0' + hora.getHours()).slice(-2) + ':' + ('0' + hora.getMinutes()).slice(-2) + '</time>' +
          '</li>';
      }).join('') : '<li class="msg-vazia">Nenhuma mensagem ainda. Diga oi para a turma!</li>';
      if (forcarFim || perto) lista.scrollTop = lista.scrollHeight;
    }

    function corDe(id) {
      var soma = 0;
      for (var i = 0; i < String(id).length; i++) soma += String(id).charCodeAt(i);
      return soma % 5;
    }

    painel.querySelector('.chat-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var texto = campo.value.trim();
      if (!texto) return;
      rede.emitir('chat', { texto: texto }).then(function (r) {
        erroChat = r && r.ok ? '' : (r && r.erro) || 'Não deu para enviar.';
        if (r && r.ok) campo.value = '';
        atualizar();
      });
    });

    function dadorDaVez() {
      var v = rede.visao();
      return !!v && rede.souDador() && v.fase !== Game.FASE.FIM;
    }

    function abrirChat(abrir) {
      chatAberto = abrir;
      if (abrir) {
        naoLidas = 0;
        renderLista(true);
        if (!telaLarga()) setTimeout(function () { campo.focus(); }, 50);
      }
      atualizar();
    }

    // ---------- Voz: entrar, sair, microfone ----------

    function suportaVoz() {
      return !!(window.RTCPeerConnection && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    }

    function pedirConfig() {
      if (voz.ice) return Promise.resolve(voz.ice);
      return rede.emitir('voz:config').then(function (r) {
        voz.ice = (r && r.iceServers) || [{ urls: 'stun:stun.l.google.com:19302' }];
        return voz.ice;
      });
    }

    /** Só depois de a pessoa tocar em "Usar microfone" o navegador pede a permissão. */
    function entrarComMicrofone() {
      fecharCartao();
      if (!suportaVoz()) { mostrarCartao('sem-suporte'); return; }
      prepararAudio();
      navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false })
        .then(function (stream) {
          voz.stream = stream;
          medir('eu', stream);
          entrarNaVoz('ligado');
        })
        .catch(function () { mostrarCartao('negado'); });
    }

    function entrarSoOuvindo() {
      fecharCartao();
      if (!window.RTCPeerConnection) { mostrarCartao('sem-suporte'); return; }
      prepararAudio();
      entrarNaVoz('ouvindo');
    }

    function entrarNaVoz(estado) {
      pedirConfig().then(function () {
        voz.estado = estado;
        aplicarMicrofone();
        rede.emitir('voz:estado', { estado: estado }).then(function () { sincronizarPares(); atualizar(); });
        atualizar();
      });
    }

    function alternarMicrofone() {
      if (!voz.stream) return;
      voz.estado = voz.estado === 'ligado' ? 'mudo' : 'ligado';
      aplicarMicrofone();
      rede.emitir('voz:estado', { estado: voz.estado });
      atualizar();
    }

    function aplicarMicrofone() {
      if (!voz.stream) return;
      voz.stream.getAudioTracks().forEach(function (t) { t.enabled = voz.estado === 'ligado'; });
    }

    function sairDaVoz() {
      voz.estado = null;
      Object.keys(voz.pares).forEach(fecharPar);
      if (voz.stream) voz.stream.getTracks().forEach(function (t) { t.stop(); });
      voz.stream = null;
      voz.medidores = {};
      voz.falando = {};
      rede.emitir('voz:estado', { estado: null });
      atualizar();
    }

    // Reconectou (ou recarregou a sala): refaz as conexões de voz do zero.
    rede.aoEntrar(function () {
      if (!voz.estado) return;
      Object.keys(voz.pares).forEach(fecharPar);
      rede.emitir('voz:estado', { estado: voz.estado }).then(function () { sincronizarPares(); });
    });

    window.addEventListener('pagehide', function () {
      if (voz.stream) voz.stream.getTracks().forEach(function (t) { t.stop(); });
    });

    // ---------- Voz: conexões WebRTC (cada um com cada um) ----------

    /** Abre conexão com quem entrou na voz e fecha com quem saiu. Quem tem o id menor faz a oferta. */
    function sincronizarPares() {
      var sala = rede.sala();
      if (!voz.estado || !sala) { Object.keys(voz.pares).forEach(fecharPar); return; }
      var naVoz = {};
      sala.jogadores.forEach(function (j) {
        if (j.id !== sala.euId && j.online && j.voz) naVoz[j.id] = j;
      });
      Object.keys(voz.pares).forEach(function (id) { if (!naVoz[id]) fecharPar(id); });
      Object.keys(naVoz).forEach(function (id) {
        if (voz.pares[id]) return;
        // Dois só-ouvintes não têm nada para trocar.
        if (!voz.stream && naVoz[id].voz === 'ouvindo') return;
        if (sala.euId < id) criarPar(id, true);
      });
    }

    function criarPar(id, iniciador) {
      var pc = new RTCPeerConnection({ iceServers: voz.ice || [] });
      var par = { pc: pc, audio: null, pendentes: [], iniciador: iniciador, temRemota: false };
      voz.pares[id] = par;

      pc.onicecandidate = function (ev) {
        rede.enviar('voz:sinal', { para: id, dados: { candidato: ev.candidate ? ev.candidate.toJSON() : null } });
      };
      pc.ontrack = function (ev) {
        var stream = ev.streams && ev.streams[0] ? ev.streams[0] : new MediaStream([ev.track]);
        if (!par.audio) {
          par.audio = document.createElement('audio');
          par.audio.autoplay = true;
          par.audio.setAttribute('playsinline', '');
          caixaAudio.appendChild(par.audio);
        }
        par.audio.srcObject = stream;
        tocar(par.audio);
        medir(id, stream);
      };
      pc.onconnectionstatechange = function () {
        // Caiu de vez: quem fez a oferta tenta de novo algumas vezes.
        if (pc.connectionState === 'failed' && voz.pares[id] === par && par.iniciador) {
          par.tentativas = (par.tentativas || 0) + 1;
          var tentativas = par.tentativas;
          fecharPar(id);
          if (tentativas <= 3) setTimeout(function () {
            if (voz.estado && !voz.pares[id]) { criarPar(id, true); voz.pares[id].tentativas = tentativas; }
          }, 1500 * tentativas);
        }
        atualizar();
      };

      if (iniciador) {
        if (voz.stream) voz.stream.getAudioTracks().forEach(function (t) { pc.addTrack(t, voz.stream); });
        else pc.addTransceiver('audio', { direction: 'recvonly' });
        pc.createOffer()
          .then(function (oferta) { return pc.setLocalDescription(oferta); })
          .then(function () { enviarDescricao(id, pc); })
          .catch(function () { fecharPar(id); });
      }
      return par;
    }

    function enviarDescricao(id, pc) {
      var d = pc.localDescription;
      rede.enviar('voz:sinal', { para: id, dados: { sdp: { type: d.type, sdp: d.sdp } } });
    }

    rede.on('voz:sinal', function (sinal) {
      if (!voz.estado || !sinal || !sinal.dados) return;
      var id = sinal.de;
      var dados = sinal.dados;
      var par = voz.pares[id];
      if (dados.sdp) {
        if (dados.sdp.type === 'offer') {
          if (par) fecharPar(id); // oferta nova do mesmo jogador: recomeça
          par = criarPar(id, false);
          var pc = par.pc;
          pc.setRemoteDescription(dados.sdp)
            .then(function () {
              par.temRemota = true;
              if (voz.stream) voz.stream.getAudioTracks().forEach(function (t) { pc.addTrack(t, voz.stream); });
              return pc.createAnswer();
            })
            .then(function (resposta) { return pc.setLocalDescription(resposta); })
            .then(function () { enviarDescricao(id, pc); aplicarPendentes(par); })
            .catch(function () { fecharPar(id); });
        } else if (par && dados.sdp.type === 'answer') {
          par.pc.setRemoteDescription(dados.sdp)
            .then(function () { par.temRemota = true; aplicarPendentes(par); })
            .catch(function () { fecharPar(id); });
        }
      } else if ('candidato' in dados && par) {
        if (par.temRemota) adicionarCandidato(par, dados.candidato);
        else par.pendentes.push(dados.candidato);
      }
    });

    function aplicarPendentes(par) {
      par.pendentes.splice(0).forEach(function (c) { adicionarCandidato(par, c); });
    }

    function adicionarCandidato(par, candidato) {
      par.pc.addIceCandidate(candidato || null).catch(function () { /* candidato velho: ignora */ });
    }

    function fecharPar(id) {
      var par = voz.pares[id];
      if (!par) return;
      delete voz.pares[id];
      delete voz.medidores[id];
      delete voz.falando[id];
      try { par.pc.close(); } catch (e) { /* já fechada */ }
      if (par.audio) { par.audio.srcObject = null; par.audio.remove(); }
    }

    // ---------- Áudio: tocar e saber quem está falando ----------

    function prepararAudio() {
      // Criado no toque do botão, para o navegador do celular liberar o som.
      if (voz.contexto || !(window.AudioContext || window.webkitAudioContext)) return;
      try { voz.contexto = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { voz.contexto = null; }
    }

    function tocar(audio) {
      var p = audio.play();
      if (p && p.catch) p.catch(function () { audiosParados = true; });
    }

    // Se o navegador barrou o som, o próximo toque na tela libera.
    var audiosParados = false;
    document.addEventListener('click', function () {
      if (voz.contexto && voz.contexto.state === 'suspended') voz.contexto.resume();
      if (!audiosParados) return;
      audiosParados = false;
      Object.keys(voz.pares).forEach(function (id) { if (voz.pares[id].audio) tocar(voz.pares[id].audio); });
    }, true);

    function medir(id, stream) {
      if (!voz.contexto) return;
      try {
        var fonte = voz.contexto.createMediaStreamSource(stream);
        var analisador = voz.contexto.createAnalyser();
        analisador.fftSize = 512;
        fonte.connect(analisador);
        voz.medidores[id] = analisador;
      } catch (e) { /* sem medidor: só não acende o "falando" */ }
    }

    var amostra = new Uint8Array(512);
    setInterval(function () {
      if (!voz.estado) return;
      var sala = rede.sala();
      var mudou = false;
      Object.keys(voz.medidores).forEach(function (id) {
        voz.medidores[id].getByteTimeDomainData(amostra);
        var pico = 0;
        for (var i = 0; i < amostra.length; i++) pico = Math.max(pico, Math.abs(amostra[i] - 128));
        var chave = id === 'eu' && sala ? sala.euId : id;
        var falando = pico > 10 && !(id === 'eu' && voz.estado !== 'ligado');
        if (!!voz.falando[chave] !== falando) { voz.falando[chave] = falando; mudou = true; }
      });
      if (mudou) marcarFalando();
    }, 200);

    function marcarFalando() {
      var nos = document.querySelectorAll('[data-jogador-id]');
      for (var i = 0; i < nos.length; i++) {
        nos[i].classList.toggle('is-falando', !!voz.falando[nos[i].getAttribute('data-jogador-id')]);
      }
    }

    // ---------- Cartão de permissão ----------

    function mostrarCartao(tipo) {
      cartaoVoz = tipo;
      var cartao = sobreposicao.firstChild;
      var html;
      if (tipo === 'pedir') {
        html = '<div class="selo" aria-hidden="true">🎙️</div>' +
          '<h2>Conversar por voz com a sala?</h2>' +
          '<p class="suave">O navegador vai perguntar se pode usar o seu microfone. Você pode desligar o microfone quando quiser.</p>' +
          '<div class="acoes acoes-coluna">' +
            '<button class="botao botao-primario" data-social="usar-mic">Usar microfone</button>' +
            '<button class="botao botao-fantasma" data-social="so-ouvir">Só ouvir</button>' +
            '<button class="botao botao-fantasma" data-social="cancelar">Agora não</button>' +
          '</div>';
      } else if (tipo === 'negado') {
        html = '<div class="selo" aria-hidden="true">🔒</div>' +
          '<h2>O microfone está bloqueado</h2>' +
          '<p class="suave">Para falar, libere o microfone para este site: toque no cadeado ao lado do endereço e permita o microfone. Enquanto isso, dá para entrar só ouvindo.</p>' +
          '<div class="acoes acoes-coluna">' +
            '<button class="botao botao-primario" data-social="so-ouvir">Entrar só ouvindo</button>' +
            '<button class="botao botao-fantasma" data-social="usar-mic">Tentar de novo</button>' +
            '<button class="botao botao-fantasma" data-social="cancelar">Fechar</button>' +
          '</div>';
      } else {
        html = '<div class="selo" aria-hidden="true">😕</div>' +
          '<h2>Este navegador não tem voz</h2>' +
          '<p class="suave">Tente pelo Chrome, Safari, Edge ou Firefox atualizados. O chat por texto continua funcionando.</p>' +
          '<div class="acoes"><button class="botao botao-primario" data-social="cancelar">Entendi</button></div>';
      }
      cartao.innerHTML = html;
      sobreposicao.hidden = false;
      var foco = cartao.querySelector('.botao-primario');
      if (foco) foco.focus();
    }

    function fecharCartao() {
      cartaoVoz = null;
      sobreposicao.hidden = true;
      sobreposicao.firstChild.innerHTML = '';
    }

    // ---------- Botões e cliques ----------

    document.addEventListener('click', function (ev) {
      var alvo = ev.target.closest('[data-social]');
      if (!alvo) return;
      switch (alvo.getAttribute('data-social')) {
        case 'voz':
          if (!voz.estado) mostrarCartao('pedir');
          else if (voz.estado === 'ouvindo') mostrarCartao('pedir');
          else alternarMicrofone();
          break;
        case 'sair-voz': sairDaVoz(); break;
        case 'usar-mic':
          if (voz.estado === 'ouvindo') sairDaVoz();
          entrarComMicrofone();
          break;
        case 'so-ouvir':
          if (voz.estado) { fecharCartao(); break; }
          entrarSoOuvindo();
          break;
        case 'cancelar': fecharCartao(); break;
        case 'chat': abrirChat(!chatAberto); break;
        case 'fechar-chat': abrirChat(false); break;
      }
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape') return;
      if (cartaoVoz) fecharCartao();
      else if (chatAberto && !telaLarga()) abrirChat(false);
    });

    function botoesHtml() {
      var rotulo, icone, classe;
      if (voz.estado === 'ligado') { icone = '🎙️'; rotulo = 'Microfone ligado. Toque para desligar'; classe = ' is-ligado'; }
      else if (voz.estado === 'mudo') { icone = '🔇'; rotulo = 'Microfone desligado. Toque para ligar'; classe = ' is-mudo'; }
      else if (voz.estado === 'ouvindo') { icone = '🎧'; rotulo = 'Só ouvindo. Toque para usar o microfone'; classe = ' is-ouvindo'; }
      else { icone = '🎙️'; rotulo = 'Entrar na conversa por voz'; classe = ''; }
      return '<button type="button" class="botao-social botao-voz' + classe + '" data-social="voz" title="' + rotulo + '" aria-label="' + rotulo + '">' +
          '<span aria-hidden="true">' + icone + '</span>' + (voz.estado ? '' : '<span class="botao-social-texto">Voz</span>') + '</button>' +
        (voz.estado ? '<button type="button" class="botao-social botao-sair-voz" data-social="sair-voz" title="Sair da voz" aria-label="Sair da conversa por voz">✕</button>' : '') +
        '<button type="button" class="botao-social botao-chat' + (chatAberto ? ' is-aberto' : '') + '" data-social="chat" title="Chat" aria-label="Chat' +
          (naoLidas ? ', ' + naoLidas + ' mensagens novas' : '') + '" aria-expanded="' + chatAberto + '">' +
          '<span aria-hidden="true">💬</span>' + (naoLidas ? '<span class="badge">' + (naoLidas > 9 ? '9+' : naoLidas) + '</span>' : '') +
        '</button>';
    }

    /** Redesenha botões, painel e conexões. A tela chama depois de cada render. */
    function atualizar() {
      var naSala = !!rede.sala();
      painel.hidden = !naSala || !chatAberto;
      document.body.classList.toggle('com-chat', naSala && chatAberto && telaLarga());

      var bloqueado = naSala && dadorDaVez();
      campo.disabled = bloqueado;
      campo.placeholder = bloqueado ? 'Você está dando a pista: o chat volta depois do chute.' : 'Escreva para a sala…';
      erroEl.textContent = bloqueado ? '' : erroChat;

      // Só troca o HTML quando muda, para não roubar o foco nem reiniciar animações.
      var html = botoesHtml();
      var slots = document.querySelectorAll('[data-social-slot]');
      for (var i = 0; i < slots.length; i++) {
        if (slots[i].__social !== html) { slots[i].innerHTML = html; slots[i].__social = html; }
      }
      if (naSala) sincronizarPares();
      marcarFalando();
    }

    rede.assinar(atualizar);
    window.addEventListener('resize', function () {
      document.body.classList.toggle('com-chat', !!rede.sala() && chatAberto && telaLarga());
    });

    return {
      slot: function () { return '<div class="social-botoes" data-social-slot></div>'; },
      /** Ícone ao lado do nome: microfone ligado, desligado ou só ouvindo. */
      iconeVoz: function (j) {
        if (!j.voz) return '';
        var icone = j.voz === 'ligado' ? '🎙️' : j.voz === 'mudo' ? '🔇' : '🎧';
        var texto = j.voz === 'ligado' ? 'microfone ligado' : j.voz === 'mudo' ? 'microfone desligado' : 'só ouvindo';
        return ' <span class="icone-voz" title="' + texto + '" aria-label="' + texto + '">' + icone + '</span>';
      },
      atualizar: atualizar
    };
  }

  return { criar: criar };
})();
