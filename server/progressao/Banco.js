/**
 * Banco — progressão guardada no PostgreSQL (DATABASE_URL). Sobrevive a reinícios e deploys.
 *
 * Na subida aplica as migrações de `migracoes/` que ainda não rodaram. Cada partida é gravada numa
 * transação só: ou entra tudo (partida + linha de cada jogador), ou nada. O id da partida é a chave,
 * então gravar a mesma partida de novo não duplica nada.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const Perfil = require('./Perfil.js');
const Regras = require('./regras.js');

const PASTA_MIGRACOES = path.join(__dirname, 'migracoes');
const TRAVA_MIGRACOES = 7319001; // pg_advisory_lock: duas instâncias subindo juntas não migram em dobro

async function migrar(pool) {
  const cliente = await pool.connect();
  try {
    await cliente.query('SELECT pg_advisory_lock($1)', [TRAVA_MIGRACOES]);
    await cliente.query('CREATE TABLE IF NOT EXISTS migracoes (nome TEXT PRIMARY KEY, aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now())');
    const feitas = new Set((await cliente.query('SELECT nome FROM migracoes')).rows.map((r) => r.nome));
    const arquivos = fs.readdirSync(PASTA_MIGRACOES).filter((a) => a.endsWith('.sql')).sort();
    for (const arquivo of arquivos) {
      if (feitas.has(arquivo)) continue;
      await cliente.query('BEGIN');
      try {
        await cliente.query(fs.readFileSync(path.join(PASTA_MIGRACOES, arquivo), 'utf8'));
        await cliente.query('INSERT INTO migracoes (nome) VALUES ($1)', [arquivo]);
        await cliente.query('COMMIT');
        console.log('Migração aplicada: ' + arquivo);
      } catch (e) {
        await cliente.query('ROLLBACK');
        throw e;
      }
    }
  } finally {
    await cliente.query('SELECT pg_advisory_unlock($1)', [TRAVA_MIGRACOES]).catch(() => {});
    cliente.release();
  }
}

function criar(url) {
  const pool = new Pool({ connectionString: url, max: 5 });
  pool.on('error', (e) => console.error('Erro na conexão com o banco:', e.message));
  const migrado = migrar(pool);
  migrado.catch((e) => console.error('Migração do banco falhou; a progressão não será gravada:', e.message));

  async function gravarPartida(resumo) {
    await migrado;
    if (!Perfil.valeGravar(resumo)) return { gravada: false };
    const cliente = await pool.connect();
    try {
      await cliente.query('BEGIN');
      const nova = await cliente.query(
        `INSERT INTO partidas (id, codigo_sala, iniciada_em, encerrada_em, estado, total_cartas, acertos, erros, maior_sequencia, jogadores)
         VALUES ($1, $2, to_timestamp($3 / 1000.0), to_timestamp($4 / 1000.0), $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO NOTHING RETURNING id`,
        [resumo.id, resumo.codigoSala, resumo.iniciadaEm, resumo.encerradaEm, resumo.estado, resumo.totalCartas,
          resumo.acertos, resumo.erros, resumo.maiorSequencia, resumo.jogadores.length]);
      if (nova.rowCount === 0) {
        await cliente.query('ROLLBACK');
        return { gravada: false, jaExistia: true };
      }
      const jogadores = [];
      for (const bruta of Perfil.linhasDoResumo(resumo)) {
        // O upsert trava a linha do jogador até o fim da transação: duas salas terminando juntas
        // com a mesma pessoa somam XP e conquistas uma depois da outra.
        const jogador = await cliente.query(
          `INSERT INTO jogadores (token_hash, nome) VALUES ($1, $2)
           ON CONFLICT (token_hash) DO UPDATE SET nome = EXCLUDED.nome, visto_em = now()
           RETURNING id, xp`,
          [bruta.tokenHash, bruta.nome]);
        const { id: jogadorId, xp: xpAntes } = jogador.rows[0];
        const anteriores = await linhasDoJogador(cliente, jogadorId);
        const desde = resumo.encerradaEm - Regras.LIMITE_DIARIO.janelaMs;
        const recentes = anteriores.filter((l) => l.valida && l.encerradaEm > desde).length;
        const jaTem = new Set((await conquistasDoJogador(cliente, jogadorId)).map((c) => c.id));
        const r = Perfil.comConquistas(resumo, Perfil.comXp(resumo, bruta, recentes), anteriores, xpAntes, jaTem);
        const l = r.linha;
        await cliente.query(
          `INSERT INTO partida_jogadores (partida_id, jogador_id, nome, cartas_presente, acertos_turma, erros_turma,
             pistas_dadas, pistas_certas, palpites, palpites_certos, presente_no_fim, participou, valida, xp_ganho, xp_detalhe)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [resumo.id, jogadorId, l.nome, l.cartasPresente, l.acertosTurma, l.errosTurma,
            l.pistasDadas, l.pistasCertas, l.palpites, l.palpitesCertos, l.presenteNoFim, l.participou,
            l.valida, l.xpGanho, JSON.stringify(l.xpDetalhe)]);
        for (const id of r.novas) {
          await cliente.query(
            `INSERT INTO conquistas_jogador (jogador_id, conquista_id, partida_id, desbloqueada_em)
             VALUES ($1, $2, $3, to_timestamp($4 / 1000.0))`,
            [jogadorId, id, resumo.id, resumo.encerradaEm]);
        }
        const xp = await cliente.query('UPDATE jogadores SET xp = xp + $2 WHERE id = $1 RETURNING xp', [jogadorId, l.xpGanho]);
        jogadores.push(Perfil.resultadoXp(l, xp.rows[0].xp, r.novas));
      }
      await cliente.query('COMMIT');
      return { gravada: true, jogadores };
    } catch (e) {
      await cliente.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      cliente.release();
    }
  }

  /** Partidas de um jogador, da mais recente para a mais antiga. `q` é o pool ou um cliente em transação. */
  async function linhasDoJogador(q, jogadorId) {
    const r = await q.query(
      `SELECT p.id, p.estado, p.encerrada_em, p.total_cartas, p.acertos, p.erros, p.maior_sequencia, p.jogadores,
              pj.cartas_presente, pj.acertos_turma, pj.erros_turma, pj.pistas_dadas, pj.pistas_certas,
              pj.palpites, pj.palpites_certos, pj.presente_no_fim, pj.participou, pj.valida, pj.xp_ganho
         FROM partida_jogadores pj JOIN partidas p ON p.id = pj.partida_id
        WHERE pj.jogador_id = $1
        ORDER BY p.encerrada_em DESC`, [jogadorId]);
    return r.rows.map((x) => ({
      partidaId: x.id,
      estado: x.estado,
      encerradaEm: x.encerrada_em.getTime(),
      totalCartas: x.total_cartas,
      acertos: x.acertos,
      erros: x.erros,
      maiorSequencia: x.maior_sequencia,
      jogadores: x.jogadores,
      cartasPresente: x.cartas_presente,
      acertosTurma: x.acertos_turma,
      errosTurma: x.erros_turma,
      pistasDadas: x.pistas_dadas,
      pistasCertas: x.pistas_certas,
      palpites: x.palpites,
      palpitesCertos: x.palpites_certos,
      presenteNoFim: x.presente_no_fim,
      participou: x.participou,
      valida: x.valida,
      xpGanho: x.xp_ganho
    }));
  }

  async function conquistasDoJogador(q, jogadorId) {
    const r = await q.query('SELECT conquista_id, desbloqueada_em FROM conquistas_jogador WHERE jogador_id = $1', [jogadorId]);
    return r.rows.map((x) => ({ id: x.conquista_id, em: x.desbloqueada_em.getTime() }));
  }

  async function perfil(token) {
    await migrado;
    const j = await pool.query('SELECT id, nome, xp, visual FROM jogadores WHERE token_hash = $1', [Perfil.hashToken(token)]);
    if (j.rowCount === 0) return Perfil.montar(null, [], 0, [], {});
    const eu = j.rows[0];
    return Perfil.montar(eu.nome, await linhasDoJogador(pool, eu.id), eu.xp, await conquistasDoJogador(pool, eu.id), eu.visual);
  }

  async function selo(token) {
    await migrado;
    const j = await pool.query('SELECT id, xp, visual FROM jogadores WHERE token_hash = $1', [Perfil.hashToken(token)]);
    if (j.rowCount === 0) return null;
    return Perfil.selo(j.rows[0].xp, await conquistasDoJogador(pool, j.rows[0].id), j.rows[0].visual);
  }

  /** Escolhe um item visual já liberado. O servidor confere nível e conquistas antes de gravar. */
  async function escolherVisual(token, tipo, id) {
    await migrado;
    const cliente = await pool.connect();
    try {
      await cliente.query('BEGIN');
      const j = await cliente.query('SELECT id, xp, visual FROM jogadores WHERE token_hash = $1 FOR UPDATE', [Perfil.hashToken(token)]);
      if (j.rowCount === 0) {
        await cliente.query('ROLLBACK');
        return { erro: 'Jogue uma partida para liberar itens.' };
      }
      const eu = j.rows[0];
      const r = Perfil.escolher(eu.visual, tipo, id, eu.xp, await conquistasDoJogador(cliente, eu.id));
      if (r.erro) {
        await cliente.query('ROLLBACK');
        return r;
      }
      await cliente.query('UPDATE jogadores SET visual = $2 WHERE id = $1', [eu.id, JSON.stringify(r.escolhido)]);
      await cliente.query('COMMIT');
    } catch (e) {
      await cliente.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      cliente.release();
    }
    return { perfil: await perfil(token) };
  }

  return {
    pronto: () => migrado,
    gravarPartida,
    perfil,
    selo,
    escolherVisual,
    fechar: () => pool.end()
  };
}

module.exports = { criar };
