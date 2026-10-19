/**
 * Perfil — estatísticas gerais e histórico de um jogador, montados a partir das linhas gravadas
 * de cada partida. Igual para o banco e para o armazenamento em memória dos testes.
 */
'use strict';

const crypto = require('crypto');
const { precisao } = require('./Partida.js');
const Regras = require('./regras.js');
const Catalogo = require('./catalogo.js');

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

/**
 * Conquistas novas que esta partida libera, com o XP delas somado à linha.
 * Só partida válida libera conquista, e só partidas válidas contam nos totais.
 * `anteriores` = linhas do jogador antes desta; `xpAntes` = XP total antes desta; `jaTem` = ids já desbloqueados.
 */
function comConquistas(resumo, linha, anteriores, xpAntes, jaTem) {
  if (!linha.valida) return { linha, novas: [] };
  const validas = anteriores.filter((l) => l.valida);
  const ctx = {
    valida: true,
    partida: resumo,
    eu: linha,
    validas: validas.length + 1,
    pistasCertas: validas.reduce((s, l) => s + l.pistasCertas, 0) + linha.pistasCertas,
    melhorAnterior: validas.length ? Math.max.apply(null, validas.map((l) => l.acertos)) : null,
    xp: xpAntes + linha.xpGanho
  };
  const r = Catalogo.avaliar(ctx, jaTem);
  if (r.novas.length === 0) return { linha, novas: [] };
  const extras = r.novas.map((id) => ({ motivo: 'conquista', id, xp: Catalogo.CONQUISTA_XP }));
  return {
    linha: Object.assign({}, linha, { xpGanho: linha.xpGanho + r.xpExtra, xpDetalhe: linha.xpDetalhe.concat(extras) }),
    novas: r.novas
  };
}

/** O que a partida rendeu para um jogador, para mostrar no placar final. */
function resultadoXp(linha, xpTotal, novas) {
  const antes = Regras.nivel(xpTotal - linha.xpGanho);
  const depois = Regras.nivel(xpTotal);
  return {
    tokenHash: linha.tokenHash,
    valida: linha.valida,
    limitado: linha.limitado,
    xpGanho: linha.xpGanho,
    detalhe: linha.xpDetalhe,
    nivel: depois,
    subiuDeNivel: depois.nivel > antes.nivel,
    conquistas: (novas || []).map((id) => {
      const c = Catalogo.conquista(id);
      return { id, nome: c.nome, descricao: c.descricao };
    })
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
function montar(nome, linhas, xp, conquistas, escolhido) {
  const nivel = Regras.nivel(xp || 0);
  const minhas = new Map((conquistas || []).map((c) => [c.id, c.em]));
  const ids = new Set(minhas.keys());
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
    nivel,
    conquistas: Catalogo.CONQUISTAS.map((c) => ({
      id: c.id, nome: c.nome, descricao: c.descricao, categoria: c.categoria, xp: Catalogo.CONQUISTA_XP,
      desbloqueada: minhas.has(c.id), em: minhas.get(c.id) || null
    })),
    recompensas: Catalogo.RECOMPENSAS.map((r) => ({
      id: r.id, tipo: r.tipo, nome: r.nome, condicao: r.condicao, liberada: Catalogo.liberada(r, nivel.nivel, ids)
    })),
    visual: Catalogo.visualEfetivo(escolhido, nivel.nivel, ids),
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

/**
 * Confere se o jogador pode usar o item: existe, é do tipo certo e está liberado.
 * Devolve o objeto de escolhas atualizado, ou { erro }.
 */
function escolher(escolhido, tipo, id, xp, conquistas) {
  if (Catalogo.TIPOS_VISUAIS.indexOf(tipo) === -1) return { erro: 'Tipo de item inválido.' };
  const item = Catalogo.recompensa(id);
  if (!item || item.tipo !== tipo) return { erro: 'Item não encontrado.' };
  if (!Catalogo.liberada(item, Regras.nivel(xp).nivel, new Set(conquistas.map((c) => c.id)))) {
    return { erro: 'Esse item ainda está bloqueado.' };
  }
  return { escolhido: Object.assign({}, escolhido, { [tipo]: id }) };
}

/** O que os outros veem ao lado do nome na sala: nível, título escolhido e moldura. */
function selo(xp, conquistas, escolhido) {
  const nivel = Regras.nivel(xp || 0).nivel;
  const visual = Catalogo.visualEfetivo(escolhido, nivel, new Set((conquistas || []).map((c) => c.id)));
  return { nivel, titulo: Catalogo.recompensa(visual.titulo).nome, moldura: visual.moldura };
}

module.exports = { hashToken, linhasDoResumo, comXp, comConquistas, resultadoXp, escolher, selo, valeGravar, montar, TAMANHO_HISTORICO };
