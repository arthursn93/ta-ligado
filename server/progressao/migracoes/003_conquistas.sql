-- Fase 5 da progressão: conquistas desbloqueadas e itens visuais escolhidos.
-- O catálogo (nomes, critérios, recompensas) fica no código, em server/progressao/catalogo.js.

CREATE TABLE conquistas_jogador (
  jogador_id      BIGINT NOT NULL REFERENCES jogadores (id) ON DELETE CASCADE,
  conquista_id    TEXT NOT NULL,
  partida_id      UUID REFERENCES partidas (id) ON DELETE SET NULL,  -- a partida que desbloqueou
  desbloqueada_em TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (jogador_id, conquista_id)                             -- cada conquista uma vez só
);

-- Itens escolhidos por tipo, ex.: {"titulo": "titulo_nivel_3", "moldura": "moldura_bronze"}.
ALTER TABLE jogadores ADD COLUMN visual JSONB NOT NULL DEFAULT '{}';
