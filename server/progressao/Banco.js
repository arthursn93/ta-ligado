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
      for (const l of Perfil.linhasDoResumo(resumo)) {
        const jogador = await cliente.query(
          `INSERT INTO jogadores (token_hash, nome) VALUES ($1, $2)
           ON CONFLICT (token_hash) DO UPDATE SET nome = EXCLUDED.nome, visto_em = now()
           RETURNING id`,
          [l.tokenHash, l.nome]);
        await cliente.query(
          `INSERT INTO partida_jogadores (partida_id, jogador_id, nome, cartas_presente, acertos_turma, erros_turma,
             pistas_dadas, pistas_certas, palpites, palpites_certos, presente_no_fim, participou)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [resumo.id, jogador.rows[0].id, l.nome, l.cartasPresente, l.acertosTurma, l.errosTurma,
            l.pistasDadas, l.pistasCertas, l.palpites, l.palpitesCertos, l.presenteNoFim, l.participou]);
      }
      await cliente.query('COMMIT');
      return { gravada: true };
    } catch (e) {
      await cliente.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      cliente.release();
    }
  }

  async function perfil(token) {
    await migrado;
    const h = Perfil.hashToken(token);
    const r = await pool.query(
      `SELECT j.nome AS nome_atual, p.id, p.estado, p.encerrada_em, p.total_cartas, p.acertos, p.erros, p.maior_sequencia,
              p.jogadores, pj.cartas_presente, pj.acertos_turma, pj.erros_turma, pj.pistas_dadas, pj.pistas_certas,
              pj.palpites, pj.palpites_certos, pj.presente_no_fim, pj.participou
         FROM jogadores j
         JOIN partida_jogadores pj ON pj.jogador_id = j.id
         JOIN partidas p ON p.id = pj.partida_id
        WHERE j.token_hash = $1
        ORDER BY p.encerrada_em DESC`, [h]);
    const linhas = r.rows.map((x) => ({
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
      participou: x.participou
    }));
    return Perfil.montar(r.rows.length ? r.rows[0].nome_atual : null, linhas);
  }

  return {
    pronto: () => migrado,
    gravarPartida,
    perfil,
    fechar: () => pool.end()
  };
}

module.exports = { criar };
