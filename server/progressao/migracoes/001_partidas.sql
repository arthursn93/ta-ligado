-- Fase 3 da progressão: jogadores, partidas e o desempenho de cada jogador em cada partida.

CREATE TABLE jogadores (
  id          BIGSERIAL PRIMARY KEY,
  token_hash  TEXT NOT NULL UNIQUE,          -- sha256 do token do aparelho; o token em si nunca é guardado
  nome        TEXT NOT NULL,                 -- último nome usado
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  visto_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE partidas (
  id              UUID PRIMARY KEY,          -- gerado no início da partida: gravar de novo não duplica
  codigo_sala     TEXT NOT NULL,
  iniciada_em     TIMESTAMPTZ NOT NULL,
  encerrada_em    TIMESTAMPTZ NOT NULL,
  estado          TEXT NOT NULL CHECK (estado IN ('concluida', 'interrompida')),
  total_cartas    SMALLINT NOT NULL,
  acertos         SMALLINT NOT NULL,
  erros           SMALLINT NOT NULL,
  maior_sequencia SMALLINT NOT NULL,
  jogadores       SMALLINT NOT NULL
);

CREATE TABLE partida_jogadores (
  partida_id      UUID NOT NULL REFERENCES partidas (id) ON DELETE CASCADE,
  jogador_id      BIGINT NOT NULL REFERENCES jogadores (id) ON DELETE CASCADE,
  nome            TEXT NOT NULL,             -- nome usado nesta partida
  cartas_presente SMALLINT NOT NULL,
  acertos_turma   SMALLINT NOT NULL,
  erros_turma     SMALLINT NOT NULL,
  pistas_dadas    SMALLINT NOT NULL,
  pistas_certas   SMALLINT NOT NULL,
  palpites        SMALLINT NOT NULL,
  palpites_certos SMALLINT NOT NULL,
  presente_no_fim BOOLEAN NOT NULL,
  participou      BOOLEAN NOT NULL,
  PRIMARY KEY (partida_id, jogador_id)
);

CREATE INDEX partida_jogadores_por_jogador ON partida_jogadores (jogador_id);
