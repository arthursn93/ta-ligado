/**
 * Catálogo de conquistas e recompensas. Itens novos entram só aqui.
 *
 * Conquista: desbloqueia uma vez, rende CONQUISTA_XP e vira insígnia no perfil. O critério recebe
 * o contexto da partida que acabou de terminar (ver `avaliar`) e só olha dados que o servidor validou.
 * Nenhuma premia sair da sala, alongar a partida ou clicar mais rápido que os outros.
 *
 * Recompensa: só visual (título, moldura do nome, cor do tabuleiro). Nada aqui muda pista, tempo,
 * coordenada ou o que cada um vê do tabuleiro.
 */
'use strict';

const Regras = require('./regras.js');

const CONQUISTA_XP = 15;

// ctx = { valida, partida (resumo), eu (linha desta partida), validas (partidas válidas, contando esta),
//         pistasCertas (total), nivel, melhorAnterior (melhor pontuação antes desta, ou null) }
const CONQUISTAS = [
  { id: 'primeira_ligacao', categoria: 'iniciacao', nome: 'Primeira ligação', descricao: 'Uma pista sua levou a turma ao acerto.',
    criterio: (c) => c.pistasCertas >= 1 },
  { id: 'estreia', categoria: 'iniciacao', nome: 'Estreia', descricao: 'Concluiu a primeira partida.',
    criterio: (c) => c.validas >= 1 },
  { id: 'subiu_de_nivel', categoria: 'iniciacao', nome: 'Subiu de nível', descricao: 'Chegou ao nível 2.',
    criterio: (c) => c.nivel >= 2 },
  { id: 'embalados', categoria: 'consistencia', nome: 'Embalados', descricao: 'A turma acertou 5 cartas seguidas numa partida.',
    criterio: (c) => c.valida && c.partida.maiorSequencia >= 5 },
  { id: 'sintonia', categoria: 'consistencia', nome: 'Sintonia', descricao: 'A turma acertou 80% ou mais das cartas numa partida.',
    criterio: (c) => c.valida && c.partida.acertos >= 0.8 * c.partida.tentativas },
  { id: 'ate_o_fim', categoria: 'consistencia', nome: 'Sempre até o fim', descricao: 'Concluiu 10 partidas.',
    criterio: (c) => c.validas >= 10 },
  { id: 'partidas_50', categoria: 'experiencia', nome: 'Veterano', descricao: 'Concluiu 50 partidas.',
    criterio: (c) => c.validas >= 50 },
  { id: 'partidas_100', categoria: 'experiencia', nome: 'Centenário', descricao: 'Concluiu 100 partidas.',
    criterio: (c) => c.validas >= 100 },
  { id: 'cem_ligacoes', categoria: 'experiencia', nome: 'Cem ligações', descricao: '100 pistas suas levaram a acerto.',
    criterio: (c) => c.pistasCertas >= 100 },
  { id: 'nivel_5', categoria: 'experiencia', nome: 'Mestre das Pistas', descricao: 'Chegou ao nível 5.',
    criterio: (c) => c.nivel >= 5 },
  { id: 'nivel_10', categoria: 'experiencia', nome: 'Lenda', descricao: 'Chegou ao nível 10.',
    criterio: (c) => c.nivel >= 10 },
  { id: 'recorde_pessoal', categoria: 'habilidade', nome: 'Recorde pessoal', descricao: 'Superou a melhor pontuação das suas partidas anteriores.',
    criterio: (c) => c.valida && c.melhorAnterior !== null && c.partida.acertos > c.melhorAnterior },
  { id: 'mao_certeira', categoria: 'habilidade', nome: 'Mão certeira', descricao: 'Todas as suas pistas de uma partida levaram a acerto (pelo menos 3).',
    criterio: (c) => c.valida && c.eu.pistasDadas >= 3 && c.eu.pistasCertas === c.eu.pistasDadas },
  { id: 'tabuleiro_perfeito', categoria: 'habilidade', nome: 'Tabuleiro perfeito', descricao: 'A turma acertou as 25 cartas sem nenhum erro.',
    criterio: (c) => c.valida && c.partida.perfeita }
];

const TIPOS_VISUAIS = ['titulo', 'moldura', 'tabuleiro'];

// condicao: { nivel: n } ou { conquista: id }. O primeiro de cada tipo é o padrão de todo mundo.
const RECOMPENSAS = [
  ...Object.keys(Regras.TITULOS).map(Number).sort((a, b) => a - b).map((n) => (
    { id: 'titulo_nivel_' + n, tipo: 'titulo', nome: Regras.TITULOS[n], condicao: { nivel: n } })),
  { id: 'titulo_perfeccionista', tipo: 'titulo', nome: 'Perfeccionista', condicao: { conquista: 'tabuleiro_perfeito' } },
  { id: 'titulo_certeiro', tipo: 'titulo', nome: 'Certeiro', condicao: { conquista: 'mao_certeira' } },
  { id: 'moldura_nenhuma', tipo: 'moldura', nome: 'Sem moldura', condicao: { nivel: 1 } },
  { id: 'moldura_bronze', tipo: 'moldura', nome: 'Bronze', condicao: { nivel: 2 } },
  { id: 'moldura_prata', tipo: 'moldura', nome: 'Prata', condicao: { nivel: 5 } },
  { id: 'moldura_ouro', tipo: 'moldura', nome: 'Ouro', condicao: { nivel: 10 } },
  { id: 'moldura_estrelas', tipo: 'moldura', nome: 'Estrelas', condicao: { conquista: 'tabuleiro_perfeito' } },
  // Os ids de tabuleiro são as skins do js/Theme.js.
  { id: 'padrao', tipo: 'tabuleiro', nome: 'Clássico', condicao: { nivel: 1 } },
  { id: 'oceano', tipo: 'tabuleiro', nome: 'Oceano', condicao: { nivel: 3 } }
];

function conquista(id) {
  return CONQUISTAS.find((c) => c.id === id) || null;
}

function recompensa(id) {
  return RECOMPENSAS.find((r) => r.id === id) || null;
}

/** A recompensa está liberada para quem tem esse nível e essas conquistas? */
function liberada(item, nivel, conquistas) {
  if (item.condicao.nivel) return nivel >= item.condicao.nivel;
  if (item.condicao.conquista) return conquistas.has(item.condicao.conquista);
  return false;
}

/** O que cada um usa quando ainda não escolheu nada (ou quando o item escolhido saiu do catálogo). */
function visualEfetivo(escolhido, nivel, conquistas) {
  const visual = {};
  for (const tipo of TIPOS_VISUAIS) {
    const item = recompensa(escolhido && escolhido[tipo]);
    if (item && item.tipo === tipo && liberada(item, nivel, conquistas)) {
      visual[tipo] = item.id;
    } else if (tipo === 'titulo') {
      visual[tipo] = 'titulo_nivel_' + Object.keys(Regras.TITULOS).map(Number).filter((n) => n <= nivel).pop();
    } else {
      visual[tipo] = RECOMPENSAS.find((r) => r.tipo === tipo).id;
    }
  }
  return visual;
}

/**
 * Conquistas novas desta partida. Cada uma rende CONQUISTA_XP, e o XP extra pode subir o nível,
 * que pode liberar outra conquista de nível: repete até não sobrar nenhuma.
 * ctx sem `nivel`: passe `xp` (o XP total já com o desta partida). `jaTem` = Set de ids.
 */
function avaliar(ctx, jaTem) {
  const novas = [];
  const tem = new Set(jaTem);
  let xp = ctx.xp;
  for (let mudou = true; mudou;) {
    mudou = false;
    const c = Object.assign({}, ctx, { nivel: Regras.nivel(xp).nivel });
    for (const item of CONQUISTAS) {
      if (tem.has(item.id) || !item.criterio(c)) continue;
      tem.add(item.id);
      novas.push(item.id);
      xp += CONQUISTA_XP;
      mudou = true;
    }
  }
  return { novas, xpExtra: novas.length * CONQUISTA_XP };
}

module.exports = {
  CONQUISTA_XP, CONQUISTAS, RECOMPENSAS, TIPOS_VISUAIS,
  conquista, recompensa, liberada, visualEfetivo, avaliar
};
