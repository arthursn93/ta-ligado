-- Fase 4 da progressão: XP acumulado e o XP que cada partida rendeu, com o detalhe do cálculo.

ALTER TABLE jogadores ADD COLUMN xp INTEGER NOT NULL DEFAULT 0;

ALTER TABLE partida_jogadores
  ADD COLUMN valida     BOOLEAN NOT NULL DEFAULT false,   -- contou como partida válida para XP
  ADD COLUMN xp_ganho   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN xp_detalhe JSONB   NOT NULL DEFAULT '[]';    -- [{motivo, xp, quantidade?}]
