-- Contadores diários de uso: só o dia, o nome do contador e o total. Nada que identifique alguém.
CREATE TABLE metricas_diarias (
  dia     DATE    NOT NULL,              -- dia no horário de Brasília
  evento  TEXT    NOT NULL,              -- um nome da lista fixa em server/Metricas.js
  total   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (dia, evento)
);
