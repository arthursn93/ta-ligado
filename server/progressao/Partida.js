/**
 * Partida — estatísticas de uma partida online, contadas no servidor a partir do que o Game já validou.
 *
 * Não muda nenhuma regra: só observa. Cada carta resolvida (um palpite aceito pelo Game) é uma
 * tentativa válida da turma. Palpites recusados (fase errada, coordenada inválida, quadrado já
 * resolvido) nunca chegam aqui, então não contam nem como erro.
 *
 * Os jogadores são identificados pelo token do aparelho, o mesmo usado na reconexão: cair e voltar
 * continua sendo a mesma pessoa, e sair da sala não apaga o que ela já fez na partida.
 */
'use strict';

const crypto = require('crypto');

const ESTADO = { EM_ANDAMENTO: 'em_andamento', CONCLUIDA: 'concluida', INTERROMPIDA: 'interrompida' };

/** Precisão em %, ou null quando não houve tentativa (a tela mostra "—", não 0%). */
function precisao(acertos, tentativas) {
  return tentativas > 0 ? Math.round((acertos / tentativas) * 1000) / 10 : null;
}

function novoJogador(nome) {
  return {
    nome,
    cartasPresente: 0,  // cartas resolvidas enquanto estava conectado
    acertosTurma: 0,    // acertos da turma nessas cartas
    errosTurma: 0,
    pistasDadas: 0,     // cartas em que foi o dador
    pistasCertas: 0,    // ...e a turma acertou
    palpites: 0,        // palpites que confirmou (só registro)
    palpitesCertos: 0
  };
}

/** Começa o registro de uma partida. `id` é único e serve para nunca gravar a mesma partida duas vezes. */
function iniciar(codigoSala, agora) {
  return {
    id: crypto.randomUUID(),
    codigoSala,
    iniciadaEm: agora || Date.now(),
    encerradaEm: null,
    estado: ESTADO.EM_ANDAMENTO,
    ultimaRodada: 0,
    acertos: 0,
    erros: 0,
    sequencia: 0,
    maiorSequencia: 0,
    jogadores: new Map() // token -> estatísticas
  };
}

function jogador(registro, token, nome) {
  let j = registro.jogadores.get(token);
  if (!j) {
    j = novoJogador(nome);
    registro.jogadores.set(token, j);
  }
  if (nome) j.nome = nome;
  return j;
}

/**
 * Uma carta resolvida.
 * carta = { rodada, acertou, dador: {token, nome}, chutador: {token, nome}, presentes: [{token, nome}] }
 * A mesma rodada só conta uma vez, então um evento repetido não duplica nada.
 */
function registrarCarta(registro, carta) {
  if (registro.estado !== ESTADO.EM_ANDAMENTO) return false;
  if (!(carta.rodada > registro.ultimaRodada)) return false;
  registro.ultimaRodada = carta.rodada;

  if (carta.acertou) {
    registro.acertos += 1;
    registro.sequencia += 1;
    registro.maiorSequencia = Math.max(registro.maiorSequencia, registro.sequencia);
  } else {
    registro.erros += 1;
    registro.sequencia = 0;
  }

  for (const p of carta.presentes) {
    const j = jogador(registro, p.token, p.nome);
    j.cartasPresente += 1;
    if (carta.acertou) j.acertosTurma += 1; else j.errosTurma += 1;
  }
  if (carta.dador) {
    const d = jogador(registro, carta.dador.token, carta.dador.nome);
    d.pistasDadas += 1;
    if (carta.acertou) d.pistasCertas += 1;
  }
  if (carta.chutador) {
    const c = jogador(registro, carta.chutador.token, carta.chutador.nome);
    c.palpites += 1;
    if (carta.acertou) c.palpitesCertos += 1;
  }
  return true;
}

/**
 * Fecha a partida: 'concluida' quando as 25 cartas acabaram, 'interrompida' quando o anfitrião
 * recomeçou no meio ou a sala acabou. `presentesNoFim` são os tokens de quem estava na sala no fim.
 * Retorna o resumo (ou null se já estava fechada, para não fechar duas vezes).
 */
function encerrar(registro, estado, presentesNoFim, totalCartas, agora) {
  if (registro.estado !== ESTADO.EM_ANDAMENTO) return null;
  registro.estado = estado;
  registro.encerradaEm = agora || Date.now();
  const noFim = new Set(presentesNoFim || []);
  const tentativas = registro.acertos + registro.erros;

  const jogadores = [];
  for (const [token, j] of registro.jogadores) {
    jogadores.push(Object.assign({ token }, j, {
      presenteNoFim: noFim.has(token),
      // Participou de verdade: deu pista ou acompanhou pelo menos metade das cartas jogadas.
      participou: j.pistasDadas > 0 || (tentativas > 0 && j.cartasPresente * 2 >= tentativas),
      precisaoTurma: precisao(j.acertosTurma, j.cartasPresente),
      precisaoPistas: precisao(j.pistasCertas, j.pistasDadas)
    }));
  }

  return {
    id: registro.id,
    codigoSala: registro.codigoSala,
    iniciadaEm: registro.iniciadaEm,
    encerradaEm: registro.encerradaEm,
    estado,
    totalCartas,
    tentativas,
    acertos: registro.acertos,
    erros: registro.erros,
    precisao: precisao(registro.acertos, tentativas),
    maiorSequencia: registro.maiorSequencia,
    perfeita: estado === ESTADO.CONCLUIDA && registro.erros === 0 && tentativas === totalCartas,
    jogadores
  };
}

module.exports = { ESTADO, precisao, iniciar, registrarCarta, encerrar };
