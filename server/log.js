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

module.exports = { criarLog, limparTexto, padrao: criarLog() };
