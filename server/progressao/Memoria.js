/**
 * Armazenamento em memória com a mesma interface do Banco. Serve para testes e para rodar em casa
 * sem Postgres; some quando o processo reinicia, então não é usado em produção.
 */
'use strict';

const Perfil = require('./Perfil.js');

function criar() {
  const partidas = new Set();
  const linhas = []; // da mais antiga para a mais recente
  const nomes = new Map(); // tokenHash -> último nome

  return {
    pronto: () => Promise.resolve(),
    async gravarPartida(resumo) {
      if (!Perfil.valeGravar(resumo)) return { gravada: false };
      if (partidas.has(resumo.id)) return { gravada: false, jaExistia: true };
      partidas.add(resumo.id);
      for (const l of Perfil.linhasDoResumo(resumo)) {
        linhas.push(l);
        nomes.set(l.tokenHash, l.nome);
      }
      return { gravada: true };
    },
    async perfil(token) {
      const h = Perfil.hashToken(token);
      const minhas = linhas.filter((l) => l.tokenHash === h).reverse().sort((a, b) => b.encerradaEm - a.encerradaEm);
      return Perfil.montar(nomes.get(h), minhas);
    },
    fechar: () => Promise.resolve()
  };
}

module.exports = { criar };
