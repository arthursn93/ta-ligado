/**
 * Perfil — estatísticas gerais e histórico de um jogador, montados a partir das linhas gravadas
 * de cada partida. Igual para o banco e para o armazenamento em memória dos testes.
 */
'use strict';

const crypto = require('crypto');
const { precisao } = require('./Partida.js');
const Regras = require('./regras.js');

const TAMANHO_HISTORICO = 20;

/** O banco guarda só o hash do token: quem ler o banco não consegue se passar por ninguém. */
function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/** As linhas de um jogador, uma por partida, a partir do resumo que o Partida.encerrar() devolve. */
function linhasDoResumo(resumo) {
  return resumo.jogadores.map((j) => ({
    tokenHash: hashToken(j.token),
    nome: j.nome,
    partidaId: resumo.id,
    estado: resumo.estado,
    encerradaEm: resumo.encerradaEm,
    totalCartas: resumo.totalCartas,
    acertos: resumo.acertos,
    erros: resumo.erros,
    maiorSequencia: resumo.maiorSequencia,
    jogadores: resumo.jogadores.length,
    cartasPresente: j.cartasPresente,
    acertosTurma: j.acertosTurma,
    errosTurma: j.errosTurma,
    pistasDadas: j.pistasDadas,
    pistasCertas: j.pistasCertas,
    palpites: j.palpites,
    palpitesCertos: j.palpitesCertos,
    presenteNoFim: j.presenteNoFim,
    participou: j.participou
  }));
}

/**
 * Aplica as regras de XP a uma linha (o mesmo cálculo no banco e na memória).
 * `validasRecentes` = partidas válidas do jogador nas últimas 24 horas antes desta.
 */
function comXp(resumo, linha, validasRecentes) {
  const r = Regras.xpDaPartida(resumo, linha, validasRecentes);
  return Object.assign({}, linha, { valida: r.valida, xpGanho: r.total, xpDetalhe: r.detalhe, limitado: !!r.limitado });
}

/** O que a partida rendeu para um jogador, para mostrar no placar final. */
function resultadoXp(linha, xpTotal) {
  const antes = Regras.nivel(xpTotal - linha.xpGanho);
  const depois = Regras.nivel(xpTotal);
  return {
    tokenHash: linha.tokenHash,
    valida: linha.valida,
    limitado: linha.limitado,
    xpGanho: linha.xpGanho,
    detalhe: linha.xpDetalhe,
    nivel: depois,
    subiuDeNivel: depois.nivel > antes.nivel
  };
}

/** Só vale gravar partida em que pelo menos uma carta foi jogada. */
function valeGravar(resumo) {
  return resumo.tentativas > 0 && resumo.jogadores.length > 0;
}

/**
 * Monta o perfil. `linhas` vêm da mais recente para a mais antiga.
 * Recordes contam só partidas concluídas em que a pessoa estava no fim.
 */
function montar(nome, linhas, xp) {
  const t = { cartas: 0, acertosTurma: 0, errosTurma: 0, pistasDadas: 0, pistasCertas: 0, palpites: 0, palpitesCertos: 0 };
  const partidas = { concluidas: 0, saiuAntes: 0, interrompidas: 0 };
  let melhorPontuacao = null;
  let maiorSequencia = null;
  let perfeitas = 0;
  for (const l of linhas) {
    t.cartas += l.cartasPresente;
    t.acertosTurma += l.acertosTurma;
    t.errosTurma += l.errosTurma;
    t.pistasDadas += l.pistasDadas;
    t.pistasCertas += l.pistasCertas;
    t.palpites += l.palpites;
    t.palpitesCertos += l.palpitesCertos;
    if (l.estado === 'interrompida') { partidas.interrompidas += 1; continue; }
    if (!l.presenteNoFim) { partidas.saiuAntes += 1; continue; }
    partidas.concluidas += 1;
    melhorPontuacao = Math.max(melhorPontuacao || 0, l.acertos);
    maiorSequencia = Math.max(maiorSequencia || 0, l.maiorSequencia);
    if (l.erros === 0 && l.acertos === l.totalCartas) perfeitas += 1;
  }
  return {
    nome: nome || null,
    nivel: Regras.nivel(xp || 0),
    partidas,
    cartas: t.cartas,
    acertosTurma: t.acertosTurma,
    errosTurma: t.errosTurma,
    precisaoTurma: precisao(t.acertosTurma, t.cartas),
    pistasDadas: t.pistasDadas,
    pistasCertas: t.pistasCertas,
    precisaoPistas: precisao(t.pistasCertas, t.pistasDadas),
    palpites: t.palpites,
    palpitesCertos: t.palpitesCertos,
    recordes: { melhorPontuacao, maiorSequencia, perfeitas },
    historico: linhas.slice(0, TAMANHO_HISTORICO).map((l) => ({
      partidaId: l.partidaId,
      encerradaEm: l.encerradaEm,
      estado: l.estado,
      presenteNoFim: l.presenteNoFim,
      totalCartas: l.totalCartas,
      acertos: l.acertos,
      erros: l.erros,
      jogadores: l.jogadores,
      pistasDadas: l.pistasDadas,
      pistasCertas: l.pistasCertas,
      xpGanho: l.xpGanho || 0
    }))
  };
}

module.exports = { hashToken, linhasDoResumo, comXp, resultadoXp, valeGravar, montar, TAMANHO_HISTORICO };
