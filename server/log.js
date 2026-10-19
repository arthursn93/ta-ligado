/**
 * Log — uma linha JSON por acontecimento importante, para ler e filtrar nos logs do Render.
 *
 * Só recebe nomes de evento e contagens: nunca nomes de jogadores, códigos de sala, tokens ou IPs.
 * Mensagens de erro passam por `limparTexto`, que troca qualquer endereço (como uma URL de banco
 * com usuário e senha) por "[endereço]" antes de escrever.
 */
'use strict';

const TAMANHO_MAX_TEXTO = 300;

function limparTexto(texto) {
  return String(texto == null ? '' : texto)
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, '[endereço]')
    .replace(/\b(password|senha|token)=\S+/gi, '$1=[oculto]')
    // IPs (ex.: "connect ECONNREFUSED 10.0.0.5:5432"). IPv6 só com "::" ou 6+ grupos, para não pegar
    // "arquivo.js:12:34" das pilhas.
    .replace(/(?:\b[0-9a-f]{1,4}:)*[0-9a-f]{0,4}::(?:[0-9a-f.:]*[0-9a-f])?|(?:\b[0-9a-f]{1,4}:){5,7}[0-9a-f]{1,4}\b/gi, '[ip]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[ip]')
    .slice(0, TAMANHO_MAX_TEXTO);
}

/** `escrever(linha, ehErro)` decide para onde vai a linha; por padrão, stdout e stderr. */
function criarLog(escrever) {
  escrever = escrever || ((linha, ehErro) => (ehErro ? process.stderr : process.stdout).write(linha + '\n'));

  function registrar(nivel, evento, dados) {
    const linha = Object.assign({ hora: new Date().toISOString(), nivel, evento }, dados);
    try {
      escrever(JSON.stringify(linha), nivel === 'erro');
    } catch (e) {
      // Log nunca derruba o jogo.
    }
  }

  return {
    info: (evento, dados) => registrar('info', evento, dados),
    aviso: (evento, dados) => registrar('aviso', evento, dados),
    erro: (evento, e, dados) => {
      const extra = { mensagem: limparTexto(e && e.message !== undefined ? e.message : e) };
      // Só as linhas de código do jogo, para achar onde quebrou.
      const pilha = e && typeof e.stack === 'string' ? e.stack.split('\n').slice(1, 4).map((l) => limparTexto(l.trim())) : null;
      if (pilha && pilha.length) extra.pilha = pilha;
      registrar('erro', evento, Object.assign(extra, dados));
    }
  };
}

/**
 * Contador agrupado: em vez de uma linha por bloqueio (um ataque encheria os logs), soma por tipo e
 * escreve uma linha só por intervalo, e nenhuma se nada aconteceu. Os tipos são fixos: qualquer
 * outro vira "outro", então a memória usada não cresce.
 */
function criarContador(log, evento, tipos, intervaloMs) {
  let contagens = {};
  let vazio = true;
  const relogio = setInterval(despejar, intervaloMs);
  if (relogio.unref) relogio.unref();

  function contar(tipo) {
    const chave = tipos.indexOf(tipo) !== -1 ? tipo : 'outro';
    contagens[chave] = (contagens[chave] || 0) + 1;
    vazio = false;
  }

  function despejar() {
    if (vazio) return;
    const dados = Object.assign({ segundos: Math.round(intervaloMs / 1000) }, contagens);
    contagens = {};
    vazio = true;
    log.aviso(evento, dados);
  }

  /** Para o relógio e escreve o que faltava (usado no desligamento). */
  function parar() {
    clearInterval(relogio);
    despejar();
  }

  return { contar, despejar, parar };
}

/**
 * Erro não tratado: escreve uma linha "erro_fatal" em JSON e encerra com código 1, como o Node faria
 * sozinho. O Render vê o processo cair e o reinicia, igual a antes.
 */
function registrarErrosFatais(processo, log) {
  let saindo = false;
  function fatal(tipo, e) {
    if (!saindo) {
      saindo = true;
      try { log.erro('erro_fatal', e, { tipo }); } catch (falha) { /* sai mesmo assim */ }
    }
    processo.exit(1);
  }
  processo.on('uncaughtException', (e) => fatal('excecao', e));
  processo.on('unhandledRejection', (motivo) => fatal('promessa_rejeitada', motivo));
}

module.exports = { criarLog, limparTexto, criarContador, registrarErrosFatais, padrao: criarLog() };
