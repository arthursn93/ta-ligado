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

const LETRAS_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sem I e O, que confundem com 1 e 0
const MAX_JOGADORES = 10;
const TAMANHO_MAX_NOME = 20;

function criarGerenciador(opcoes) {
  opcoes = opcoes || {};
  const criarJogo = opcoes.criarJogo || (() => Game.criar());
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
    const jogador = { id: crypto.randomUUID().slice(0, 8), token, nome, online: true };
    sala.jogadores.push(jogador);
    return jogador;
  }

  /** Cria uma sala e coloca quem criou como anfitrião. */
  function criarSala(token, nome) {
    nome = limparNome(nome);
    if (!token) return erro('Aparelho sem identificação. Recarregue a página.');
    if (!nome) return erro('Digite seu nome.');
    const sala = { codigo: novoCodigo(), jogadores: [], anfitriaoId: null, jogo: null, dadorId: null, rodadaDoDador: 0 };
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
    if (jogador) jogador.online = false;
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
      salas.delete(codigo);
      return null;
    }
    garantirAnfitriao(sala);
    garantirDador(sala);
    return sala;
  }

  function removerSeVazia(codigo) {
    const sala = salas.get(codigo);
    if (sala && sala.jogadores.every((j) => !j.online)) salas.delete(codigo);
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
      sala.jogo.executar({ tipo: 'NOVA_PARTIDA' });
    }
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

    const resultado = sala.jogo.executar(acao);
    if (resultado.ok) garantirDador(sala);
    return Object.assign({ sala }, resultado);
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
        jogadores: sala.jogadores.map((j) => ({ id: j.id, nome: j.nome, online: j.online }))
      },
      jogo: sala.jogo ? sala.jogo.visao(souDador ? 'dador' : 'grupo') : null
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
    obter: (codigo) => salas.get(codigo),
    total: () => salas.size
  };
}

module.exports = { criarGerenciador, MAX_JOGADORES };
