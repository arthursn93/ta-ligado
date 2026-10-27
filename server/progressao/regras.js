/**
 * Regras de XP e níveis. Todos os números de balanceamento ficam aqui; o resto do código só chama
 * as funções. O servidor é quem calcula: o aparelho só recebe o resultado para mostrar.
 *
 * XP nunca diminui. Erro não tira nada; a pior partida ainda rende a participação.
 */
'use strict';

const XP = {
  participacao: 30,       // concluir uma partida válida
  acertoTurma: 2,         // por acerto da turma enquanto você estava conectado
  limiteAcertosTurma: 50,
  pistaCerta: 5,          // por pista sua que levou a acerto
  desafio: 20,            // turma com DESAFIO_ACERTOS ou mais
  desafioAcertos: 20
};

// Partidas com XP cheio por jogador numa janela de 24 horas. Depois disso, só a participação conta.
const LIMITE_DIARIO = { partidas: 10, janelaMs: 24 * 60 * 60 * 1000 };

// Títulos por nível. Níveis sem título usam o último anterior.
const TITULOS = {
  1: 'Novato', 2: 'Curioso', 3: 'Investigador', 4: 'Estrategista', 5: 'Mestre das Pistas',
  6: 'Decifrador', 8: 'Conector', 10: 'Lenda do Tabuleiro'
};
const NIVEL_MAXIMO = 50;

/** XP total para chegar ao nível n: 0, 100, 300, 600, 1000, 1500... (cada nível pede 100 a mais). */
function xpDoNivel(n) {
  return 50 * n * (n - 1);
}

/** Nível em que se ganhou o título de quem está no nível n. */
function nivelDoTitulo(n) {
  for (let i = n; i >= 1; i--) if (TITULOS[i]) return i;
  return 1;
}

function titulo(n) {
  return TITULOS[nivelDoTitulo(n)];
}

/** Nível e progresso a partir do XP total. */
function nivel(xp) {
  xp = Math.max(0, Math.floor(Number(xp) || 0));
  let n = 1;
  while (n < NIVEL_MAXIMO && xp >= xpDoNivel(n + 1)) n += 1;
  const maximo = n === NIVEL_MAXIMO;
  return {
    nivel: n,
    titulo: titulo(n),
    tituloId: 'titulo_nivel_' + nivelDoTitulo(n), // para o aparelho mostrar o título no idioma dele
    xp,
    xpDoNivel: xpDoNivel(n),
    xpProximoNivel: maximo ? null : xpDoNivel(n + 1),
    falta: maximo ? 0 : xpDoNivel(n + 1) - xp,
    // Fração do caminho até o próximo nível, de 0 a 1 (barra de progresso).
    progresso: maximo ? 1 : (xp - xpDoNivel(n)) / (xpDoNivel(n + 1) - xpDoNivel(n))
  };
}

/**
 * Partida válida para XP: concluída (25 cartas), com pelo menos 2 pessoas, e o jogador estava na
 * sala no fim e participou (deu pista ou acompanhou metade das cartas).
 */
function valida(resumo, jogador) {
  return resumo.estado === 'concluida' && resumo.jogadores.length >= 2 && jogador.presenteNoFim && jogador.participou;
}

/**
 * XP de um jogador numa partida, com o motivo de cada parcela (a tela mostra linha a linha).
 * `validasRecentes` = partidas válidas que ele já teve nas últimas 24 horas, sem contar esta.
 */
function xpDaPartida(resumo, jogador, validasRecentes) {
  if (!valida(resumo, jogador)) return { valida: false, total: 0, detalhe: [] };
  const detalhe = [{ motivo: 'participacao', xp: XP.participacao }];
  const limitado = validasRecentes >= LIMITE_DIARIO.partidas;
  if (!limitado) {
    const acertos = Math.min(jogador.acertosTurma * XP.acertoTurma, XP.limiteAcertosTurma);
    if (acertos > 0) detalhe.push({ motivo: 'acertos_turma', xp: acertos, quantidade: jogador.acertosTurma });
    if (jogador.pistasCertas > 0) {
      detalhe.push({ motivo: 'pistas_certas', xp: jogador.pistasCertas * XP.pistaCerta, quantidade: jogador.pistasCertas });
    }
    if (resumo.acertos >= XP.desafioAcertos) detalhe.push({ motivo: 'desafio', xp: XP.desafio });
  }
  return {
    valida: true,
    limitado,
    total: detalhe.reduce((soma, d) => soma + d.xp, 0),
    detalhe
  };
}

module.exports = { XP, LIMITE_DIARIO, TITULOS, NIVEL_MAXIMO, xpDoNivel, nivel, valida, xpDaPartida };
