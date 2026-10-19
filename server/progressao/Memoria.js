/**
 * Armazenamento em memória com a mesma interface do Banco. Serve para testes e para rodar em casa
 * sem Postgres; some quando o processo reinicia, então não é usado em produção.
 */
'use strict';

const Perfil = require('./Perfil.js');
const Regras = require('./regras.js');

function criar() {
  const partidas = new Set();
  const linhas = []; // da mais antiga para a mais recente
  const nomes = new Map(); // tokenHash -> último nome
  const xps = new Map(); // tokenHash -> XP total
  const conquistas = new Map(); // tokenHash -> [{id, em}]
  const visuais = new Map(); // tokenHash -> {tipo: id}

  return {
    pronto: () => Promise.resolve(),
    async gravarPartida(resumo) {
      if (!Perfil.valeGravar(resumo)) return { gravada: false };
      if (partidas.has(resumo.id)) return { gravada: false, jaExistia: true };
      partidas.add(resumo.id);
      const desde = resumo.encerradaEm - Regras.LIMITE_DIARIO.janelaMs;
      const jogadores = [];
      for (const bruta of Perfil.linhasDoResumo(resumo)) {
        const h = bruta.tokenHash;
        const anteriores = linhas.filter((l) => l.tokenHash === h);
        const recentes = anteriores.filter((l) => l.valida && l.encerradaEm > desde).length;
        const minhas = conquistas.get(h) || [];
        const r = Perfil.comConquistas(resumo, Perfil.comXp(resumo, bruta, recentes), anteriores, xps.get(h) || 0,
          new Set(minhas.map((c) => c.id)));
        const l = r.linha;
        linhas.push(l);
        nomes.set(h, l.nome);
        xps.set(h, (xps.get(h) || 0) + l.xpGanho);
        conquistas.set(h, minhas.concat(r.novas.map((id) => ({ id, em: resumo.encerradaEm }))));
        jogadores.push(Perfil.resultadoXp(l, xps.get(h), r.novas));
      }
      return { gravada: true, jogadores };
    },
    async perfil(token) {
      const h = Perfil.hashToken(token);
      const minhas = linhas.filter((l) => l.tokenHash === h).reverse().sort((a, b) => b.encerradaEm - a.encerradaEm);
      return Perfil.montar(nomes.get(h), minhas, xps.get(h), conquistas.get(h), visuais.get(h));
    },
    async selo(token) {
      const h = Perfil.hashToken(token);
      if (!nomes.has(h)) return null;
      return Perfil.selo(xps.get(h), conquistas.get(h), visuais.get(h));
    },
    async escolherVisual(token, tipo, id) {
      const h = Perfil.hashToken(token);
      if (!nomes.has(h)) return { erro: 'Jogue uma partida para liberar itens.' };
      const r = Perfil.escolher(visuais.get(h), tipo, id, xps.get(h) || 0, conquistas.get(h) || []);
      if (r.erro) return r;
      visuais.set(h, r.escolhido);
      return { perfil: await this.perfil(token) };
    },
    fechar: () => Promise.resolve()
  };
}

module.exports = { criar };
