/**
 * Métricas — contadores diários de uso, sem identificar ninguém.
 *
 * Cada acontecimento soma 1 no contador do dia (horário de Brasília). Os totais ficam na memória e
 * vão para o armazém a cada minuto, numa operação só, e ao desligar. Só nomes da lista EVENTOS
 * contam: qualquer outro é ignorado, então ninguém enche o banco de lixo e a memória não cresce.
 * Sem armazém (em casa, nos testes), nada é guardado.
 */
'use strict';

// Canais de divulgação: o link de cada um leva `?de=<canal>`. Só estes contam.
const CANAIS = ['whatsapp', 'instagram', 'tiktok', 'discord', 'reddit', 'itch'];
const EVENTOS = [
  'abriu', 'abriu_convite', 'abriu_voltou', 'abriu_pt', 'abriu_en', 'abriu_es',
  'sala_criada', 'entrou_na_sala', 'partida_iniciada', 'partida_concluida', 'partida_interrompida',
  'partida_local'
].concat(CANAIS.map((canal) => 'abriu_de_' + canal));
const INTERVALO_MS = 60 * 1000;
const FUSO = 'America/Sao_Paulo';

const formatoDia = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' });

/** 'AAAA-MM-DD' do instante `ms` no horário de Brasília. */
function diaDe(ms) {
  return formatoDia.format(new Date(ms));
}

function criar(opcoes) {
  opcoes = opcoes || {};
  const armazem = opcoes.armazem && opcoes.armazem.somarMetricas ? opcoes.armazem : null;
  const log = opcoes.log;
  const agora = opcoes.agora || Date.now;
  let pendentes = new Map(); // 'dia|evento' -> total ainda não gravado
  let gravando = Promise.resolve();

  const relogio = armazem ? setInterval(() => { despejar(); }, opcoes.intervaloMs || INTERVALO_MS) : null;
  if (relogio && relogio.unref) relogio.unref();

  function contar(evento) {
    if (!armazem || EVENTOS.indexOf(evento) === -1) return;
    const chave = diaDe(agora()) + '|' + evento;
    pendentes.set(chave, (pendentes.get(chave) || 0) + 1);
  }

  /** Grava o que juntou. Se falhar, os totais voltam para a fila e vão na próxima vez. */
  function despejar() {
    gravando = gravando.then(async () => {
      if (pendentes.size === 0) return;
      const lote = pendentes;
      pendentes = new Map();
      const linhas = [...lote].map(([chave, total]) => {
        const [dia, evento] = chave.split('|');
        return { dia, evento, total };
      });
      try {
        await armazem.somarMetricas(linhas);
      } catch (e) {
        for (const [chave, total] of lote) pendentes.set(chave, (pendentes.get(chave) || 0) + total);
        if (log) log.erro('erro_gravar_metricas', e, { linhas: linhas.length });
      }
    });
    return gravando;
  }

  /** Para o relógio e grava o que faltava (no desligamento). */
  function parar() {
    if (relogio) clearInterval(relogio);
    return armazem ? despejar() : Promise.resolve();
  }

  return { contar, despejar, parar };
}

module.exports = { criar, diaDe, EVENTOS, CANAIS };
