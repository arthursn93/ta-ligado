/**
 * Salas — salas privadas por código de convite. Não sabe nada de rede: o index.js liga isto ao Socket.io.
 *
 * Cada sala tem jogadores, um anfitrião e, depois de iniciada, uma instância de Game (a mesma lógica
 * do modo local). O servidor é o juiz: só ele vê a coordenada secreta e decide quem pode agir.
 *
 * Identidade: cada aparelho manda um `token` secreto (guardado no navegador). Ele permite voltar
 * para o mesmo lugar depois de recarregar a página. Para os outros jogadores só aparece o `id` público.
 */
'use strict';

const crypto = require('crypto');
const Game = require('../js/Game.js');
const Partida = require('./progressao/Partida.js');
const { hashToken } = require('./progressao/Perfil.js');

const LETRAS_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sem I e O, que confundem com 1 e 0
const MAX_JOGADORES = 10;
const TAMANHO_MAX_NOME = 20;
const TAMANHO_MAX_MENSAGEM = 200;
const HISTORICO_CHAT = 50;
const LIMITE_MENSAGENS = 6; // por jogador, a cada JANELA_MENSAGENS_MS
const JANELA_MENSAGENS_MS = 10000;
const ESTADOS_VOZ = ['ouvindo', 'mudo', 'ligado']; // null = fora da voz

function criarGerenciador(opcoes) {
  opcoes = opcoes || {};
  const criarJogo = opcoes.criarJogo || (() => Game.criar());
  // Chamado com o resumo de cada partida que termina (concluída ou interrompida).
  const aoEncerrarPartida = opcoes.aoEncerrarPartida || (() => {});
  // Com progressão ligada, a tela do placar final espera o XP de cada um.
  const progressaoAtiva = !!opcoes.progressaoAtiva;
  const salas = new Map(); // codigo -> sala

  function novoCodigo() {
    let codigo;
    do {
      codigo = Array.from({ length: 4 }, () => LETRAS_CODIGO[crypto.randomInt(LETRAS_CODIGO.length)]).join('');
    } while (salas.has(codigo));
    return codigo;
  }

  function limparNome(nome) {
    const limpo = String(nome || '').trim().replace(/\s+/g, ' ').slice(0, TAMANHO_MAX_NOME);
    return limpo;
  }

  function erro(mensagem) {
    return { ok: false, erro: mensagem };
  }

  function acharJogador(sala, token) {
    return sala.jogadores.find((j) => j.token === token);
  }

  function novoJogador(sala, token, nome) {
    const jogador = { id: crypto.randomUUID().slice(0, 8), token, nome, online: true, voz: null, vozSocket: null, envios: [], selo: null };
    sala.jogadores.push(jogador);
    return jogador;
  }

  /** Cria uma sala e coloca quem criou como anfitrião. */
  function criarSala(token, nome) {
    nome = limparNome(nome);
    if (!token) return erro('Aparelho sem identificação. Recarregue a página.');
    if (!nome) return erro('Digite seu nome.');
    const sala = {
      codigo: novoCodigo(), jogadores: [], anfitriaoId: null, jogo: null, dadorId: null, rodadaDoDador: 0,
      chat: [], seqMensagem: 0, partida: null, ultimaPartida: null, progresso: null
    };
    const jogador = novoJogador(sala, token, nome);
    sala.anfitriaoId = jogador.id;
    salas.set(sala.codigo, sala);
    return { ok: true, sala };
  }

  /** Entra numa sala existente. Quem já estava (mesmo token) só volta ao seu lugar. */
  function entrar(codigo, token, nome) {
    const sala = salas.get(String(codigo || '').trim().toUpperCase());
    if (!sala) return erro('Sala não encontrada. Confira o código.');
    const existente = acharJogador(sala, token);
    if (existente) {
      existente.online = true;
      return { ok: true, sala };
    }
    nome = limparNome(nome);
    if (!nome) return erro('Digite seu nome.');
    if (sala.jogadores.length >= MAX_JOGADORES) return erro('A sala está cheia.');
    if (sala.jogadores.some((j) => j.nome.toLowerCase() === nome.toLowerCase())) {
      return erro('Já tem alguém com esse nome na sala.');
    }
    novoJogador(sala, token, nome);
    return { ok: true, sala };
  }

  /** Marca o jogador como desconectado. Ele continua na sala e pode voltar. */
  function desconectar(codigo, token) {
    const sala = salas.get(codigo);
    if (!sala) return null;
    const jogador = acharJogador(sala, token);
    if (jogador) {
      jogador.online = false;
      jogador.voz = null;
      jogador.vozSocket = null;
    }
    if (sala.jogadores.every((j) => !j.online)) return sala; // index.js agenda a limpeza
    garantirDador(sala);
    garantirAnfitriao(sala);
    return sala;
  }

  /** Sai de vez da sala. */
  function sair(codigo, token) {
    const sala = salas.get(codigo);
    if (!sala) return null;
    sala.jogadores = sala.jogadores.filter((j) => j.token !== token);
    if (sala.jogadores.length === 0) {
      fecharPartida(sala, Partida.ESTADO.INTERROMPIDA);
      salas.delete(codigo);
      return null;
    }
    garantirAnfitriao(sala);
    garantirDador(sala);
    return sala;
  }

  function removerSeVazia(codigo) {
    const sala = salas.get(codigo);
    if (sala && sala.jogadores.every((j) => !j.online)) {
      fecharPartida(sala, Partida.ESTADO.INTERROMPIDA);
      salas.delete(codigo);
    }
  }

  /** Fecha o registro da partida em andamento (se houver) e entrega o resumo. */
  function fecharPartida(sala, estado) {
    if (!sala.partida) return null;
    const online = sala.jogadores.filter((j) => j.online).map((j) => j.token);
    const resumo = Partida.encerrar(sala.partida, estado, online, sala.jogo.visao().totalCartas);
    sala.partida = null;
    if (!resumo) return null;
    sala.ultimaPartida = resumo;
    try {
      aoEncerrarPartida(resumo);
    } catch (e) {
      // A contagem nunca pode travar a sala.
      console.error('Erro ao encerrar a partida:', e);
    }
    return resumo;
  }

  function garantirAnfitriao(sala) {
    const atual = sala.jogadores.find((j) => j.id === sala.anfitriaoId);
    if (atual && atual.online) return;
    const proximo = sala.jogadores.find((j) => j.online);
    if (proximo) sala.anfitriaoId = proximo.id;
  }

  /**
   * Define quem dá a pista da carta atual. Gira entre os jogadores conectados, um por carta.
   * Se o dador cair antes de dar a pista, a vez passa para o próximo.
   */
  function garantirDador(sala) {
    if (!sala.jogo) return;
    const v = sala.jogo.visao();
    const online = sala.jogadores.filter((j) => j.online);
    if (online.length === 0) return;
    const atual = sala.jogadores.find((j) => j.id === sala.dadorId);
    const cartaNova = v.rodada !== sala.rodadaDoDador;
    const dadorSumiu = !atual || (!atual.online && v.fase === Game.FASE.PISTA);
    if (!cartaNova && !dadorSumiu) return;

    // Próximo jogador conectado depois do dador anterior, na ordem de chegada.
    const indiceAtual = sala.jogadores.findIndex((j) => j.id === sala.dadorId);
    for (let passo = 1; passo <= sala.jogadores.length; passo++) {
      const candidato = sala.jogadores[(indiceAtual + passo + sala.jogadores.length) % sala.jogadores.length];
      if (candidato.online) {
        sala.dadorId = candidato.id;
        break;
      }
    }
    sala.rodadaDoDador = v.rodada;
  }

  /** O anfitrião começa a partida (ou uma nova). */
  function iniciar(codigo, token) {
    const sala = salas.get(codigo);
    if (!sala) return erro('Sala não encontrada.');
    const jogador = acharJogador(sala, token);
    if (!jogador || jogador.id !== sala.anfitriaoId) return erro('Só o anfitrião pode começar a partida.');
    if (sala.jogadores.filter((j) => j.online).length < 2) return erro('Chame pelo menos mais uma pessoa.');
    if (!sala.jogo) {
      sala.jogo = criarJogo();
    } else {
      // Recomeçar no meio deixa a partida anterior como interrompida.
      fecharPartida(sala, Partida.ESTADO.INTERROMPIDA);
      sala.jogo.executar({ tipo: 'NOVA_PARTIDA' });
    }
    sala.partida = Partida.iniciar(sala.codigo);
    sala.rodadaDoDador = 0; // força a troca: a vez segue para o próximo da roda
    garantirDador(sala);
    return { ok: true, sala };
  }

  /** Uma ação de jogo vinda de um jogador. O servidor confere se é a vez dele. */
  function agir(codigo, token, acao) {
    const sala = salas.get(codigo);
    if (!sala || !sala.jogo) return erro('A partida ainda não começou.');
    const jogador = acharJogador(sala, token);
    if (!jogador) return erro('Você não está nesta sala.');
    const tipo = acao && acao.tipo;
    const souDador = jogador.id === sala.dadorId;

    if (tipo === 'DAR_PISTA' && !souDador) return erro('Só quem está dando a pista pode fazer isso.');
    if (tipo === 'CHUTAR' && souDador) return erro('Quem deu a pista não pode chutar.');
    if (tipo === 'NOVA_PARTIDA') return iniciar(codigo, token);
    if (tipo !== 'DAR_PISTA' && tipo !== 'CHUTAR') return erro('Ação desconhecida.');

    const dador = sala.jogadores.find((j) => j.id === sala.dadorId);
    const resultado = sala.jogo.executar(acao);
    if (resultado.ok && tipo === 'CHUTAR') contarCarta(sala, dador, jogador);
    if (resultado.ok) garantirDador(sala);
    return Object.assign({ sala }, resultado);
  }

  /** Registra a carta que o Game acabou de resolver e fecha a partida se as cartas acabaram. */
  function contarCarta(sala, dador, chutador) {
    if (!sala.partida) return;
    const v = sala.jogo.visao();
    const quem = (j) => (j ? { token: j.token, nome: j.nome } : null);
    Partida.registrarCarta(sala.partida, {
      rodada: v.ultimaJogada.rodada,
      acertou: v.ultimaJogada.acertou,
      dador: quem(dador),
      chutador: quem(chutador),
      presentes: sala.jogadores.filter((j) => j.online).map(quem)
    });
    if (v.fase === Game.FASE.FIM) fecharPartida(sala, Partida.ESTADO.CONCLUIDA);
  }

  /**
   * Mensagem do chat. Só vai para quem está na mesma sala (o index.js manda para o canal da sala).
   * Texto limpo de caracteres de controle, até 200 letras, e um limite de envios contra spam.
   */
  function enviarMensagem(codigo, token, texto, agora) {
    agora = agora || Date.now();
    const sala = salas.get(codigo);
    if (!sala) return erro('Sala não encontrada.');
    const jogador = acharJogador(sala, token);
    if (!jogador) return erro('Você não está nesta sala.');
    // Como no jogo de mesa, quem dá a pista não pode dar dicas extras enquanto a carta está em jogo.
    if (sala.jogo && jogador.id === sala.dadorId && sala.jogo.visao().fase !== Game.FASE.FIM) {
      return erro('Você está dando a pista: o chat volta quando a turma chutar.');
    }
    if (typeof texto !== 'string') return erro('Mensagem inválida.');
    texto = texto.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!texto) return erro('Escreva alguma coisa.');
    if (texto.length > TAMANHO_MAX_MENSAGEM) return erro('Mensagem longa demais (até ' + TAMANHO_MAX_MENSAGEM + ' letras).');
    jogador.envios = jogador.envios.filter((t) => agora - t < JANELA_MENSAGENS_MS);
    if (jogador.envios.length >= LIMITE_MENSAGENS) return erro('Calma! Espere um pouquinho para mandar outra.');
    jogador.envios.push(agora);
    const mensagem = { id: ++sala.seqMensagem, autorId: jogador.id, nome: jogador.nome, texto, em: agora };
    sala.chat.push(mensagem);
    if (sala.chat.length > HISTORICO_CHAT) sala.chat.shift();
    return { ok: true, sala, mensagem };
  }

  /** Entrar, sair ou mudar o microfone na conversa por voz da sala. `socketId` é o aparelho que fala. */
  function definirVoz(codigo, token, estado, socketId) {
    const sala = salas.get(codigo);
    if (!sala) return erro('Sala não encontrada.');
    const jogador = acharJogador(sala, token);
    if (!jogador) return erro('Você não está nesta sala.');
    if (estado !== null && ESTADOS_VOZ.indexOf(estado) === -1) return erro('Estado de voz inválido.');
    jogador.voz = estado;
    jogador.vozSocket = estado ? socketId : null;
    return { ok: true, sala };
  }

  /** O aparelho que estava na voz caiu: tira a pessoa da voz (ela volta sozinha ao reconectar). */
  function vozCaiu(codigo, socketId) {
    const sala = salas.get(codigo);
    if (!sala) return null;
    const jogador = sala.jogadores.find((j) => j.vozSocket === socketId);
    if (!jogador) return null;
    jogador.voz = null;
    jogador.vozSocket = null;
    return sala;
  }

  /** Para quem repassar um sinal de voz: os dois precisam estar na voz e na mesma sala. */
  function destinoDoSinal(codigo, token, paraId) {
    const sala = salas.get(codigo);
    if (!sala) return null;
    const de = acharJogador(sala, token);
    const para = sala.jogadores.find((j) => j.id === paraId);
    if (!de || !de.voz || !para || !para.voz || !para.vozSocket || para === de) return null;
    return { deId: de.id, socketId: para.vozSocket };
  }

  /** Nível, título e moldura de quem tem esse token, mostrados ao lado do nome (null = sem perfil). */
  function definirSelo(codigo, token, selo) {
    const sala = salas.get(codigo);
    const jogador = sala && acharJogador(sala, token);
    if (!jogador) return null;
    jogador.selo = selo || null;
    return sala;
  }

  /** O XP que cada um ganhou na partida que terminou. `porHash`: hash do token -> resultado. */
  function registrarProgresso(codigo, partidaId, porHash, falhou) {
    const sala = salas.get(codigo);
    if (!sala) return null;
    sala.progresso = { partidaId, porHash, falhou: !!falhou };
    return sala;
  }

  /** O resultado de XP deste jogador, só no placar final da partida a que ele se refere. */
  function progressoPara(sala, eu) {
    if (!progressaoAtiva || !eu || !sala.jogo || sala.jogo.visao().fase !== Game.FASE.FIM || !sala.ultimaPartida) return null;
    const pronto = sala.progresso && sala.progresso.partidaId === sala.ultimaPartida.id;
    if (!pronto) return { carregando: true };
    if (sala.progresso.falhou) return { erro: true };
    return sala.progresso.porHash.get(hashToken(eu.token)) || { semXp: true };
  }

  /** Tudo o que um jogador pode ver: a sala e a partida do ponto de vista dele. */
  function visaoPara(sala, token) {
    const eu = acharJogador(sala, token);
    const souDador = !!eu && eu.id === sala.dadorId;
    return {
      sala: {
        codigo: sala.codigo,
        anfitriaoId: sala.anfitriaoId,
        dadorId: sala.dadorId,
        euId: eu ? eu.id : null,
        jogadores: sala.jogadores.map((j) => ({ id: j.id, nome: j.nome, online: j.online, voz: j.voz, selo: j.selo }))
      },
      jogo: sala.jogo ? sala.jogo.visao(souDador ? 'dador' : 'grupo') : null,
      progresso: progressoPara(sala, eu)
    };
  }

  return {
    criarSala,
    entrar,
    desconectar,
    sair,
    removerSeVazia,
    iniciar,
    agir,
    visaoPara,
    enviarMensagem,
    definirVoz,
    vozCaiu,
    destinoDoSinal,
    definirSelo,
    registrarProgresso,
    historicoChat: (codigo) => (salas.get(codigo) ? salas.get(codigo).chat.slice() : []),
    obter: (codigo) => salas.get(codigo),
    total: () => salas.size
  };
}

module.exports = { criarGerenciador, MAX_JOGADORES, TAMANHO_MAX_MENSAGEM };
