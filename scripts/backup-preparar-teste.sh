#!/usr/bin/env bash
# Só para os testes do workflow de backup nos PRs: monta, no PostgreSQL temporário da execução, um banco
# "neondb" com as migrações do jogo, alguns dados de exemplo e o usuário backup_leitura criado pelo
# mesmo arquivo que vai para o Neon. Nunca é usado com o banco de produção.
# Uso: backup-preparar-teste.sh <url do servidor temporário, banco postgres>
set -euo pipefail
admin=$1
case "$admin" in
  *@localhost[:/]*|*@127.0.0.1[:/]*) ;;
  *) echo "::error::Este script só roda contra um PostgreSQL em localhost." >&2; exit 1 ;;
esac
raiz=$(cd "$(dirname "$0")/.." && pwd)
banco="${admin%/*}/neondb"
psql() { "${PG_BIN:-/usr/bin}/psql" -X -q -v ON_ERROR_STOP=1 "$@"; }

psql "$admin" -c 'CREATE DATABASE neondb'
psql "$banco" -c 'CREATE TABLE migracoes (nome TEXT PRIMARY KEY, aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now())'
for f in "$raiz"/server/progressao/migracoes/*.sql; do
  psql "$banco" -f "$f"
  psql "$banco" -c "INSERT INTO migracoes (nome) VALUES ('$(basename "$f")')"
done
psql "$banco" <<'SQL'
INSERT INTO jogadores (token_hash, nome, xp) VALUES ('hash-a', 'Ana', 169), ('hash-b', 'Bia', 164);
INSERT INTO partidas VALUES ('11111111-1111-1111-1111-111111111111', 'ABCD', now() - interval '20 minutes', now(), 'concluida', 25, 17, 8, 5, 2);
INSERT INTO partida_jogadores (partida_id, jogador_id, nome, cartas_presente, acertos_turma, erros_turma, pistas_dadas,
  pistas_certas, palpites, palpites_certos, presente_no_fim, participou, valida, xp_ganho, xp_detalhe)
SELECT '11111111-1111-1111-1111-111111111111', id, nome, 25, 17, 8, 13, 9, 12, 8, true, true, true, 60, '[{"motivo":"partida","xp":60}]'
FROM jogadores;
INSERT INTO conquistas_jogador SELECT id, 'estreia', '11111111-1111-1111-1111-111111111111', now() FROM jogadores;
SQL
senha=$(openssl rand -hex 16)
sed "s/TROQUE_PELA_SENHA/$senha/" "$raiz/scripts/backup-usuario-leitura.sql" | psql "$banco"
echo "${admin%%://*}://backup_leitura:$senha@${admin#*@}" | sed 's#/postgres$#/neondb#'
