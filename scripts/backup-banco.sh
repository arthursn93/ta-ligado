#!/usr/bin/env bash
# Backup do banco: copia o banco de ORIGEM_URL, criptografa a cópia e prova que ela restaura.
# Usado pelo workflow .github/workflows/backup.yml. Ver docs/backup.md.
#
# Variáveis (todas obrigatórias):
#   ORIGEM_URL    banco a copiar (em produção, o Neon com o usuário só de leitura). Só é lido.
#   TESTE_URL     banco VAZIO e temporário onde a cópia é restaurada. Precisa ser localhost.
#   BACKUP_SENHA  senha de criptografia (20 caracteres ou mais).
#   PG_BIN        pasta do pg_dump/pg_restore/psql (ex.: /usr/lib/postgresql/18/bin).
#   SAIDA         pasta onde fica o arquivo criptografado.
# Opcional:
#   MODO=teste    também confere que uma senha errada não abre a cópia.
#
# Imprime no fim o caminho do arquivo .gpg. Nunca escreve em ORIGEM_URL.
set -euo pipefail

erro() { echo "::error::$1" >&2; exit 1; }

for v in ORIGEM_URL TESTE_URL BACKUP_SENHA PG_BIN SAIDA; do
  [ -n "${!v:-}" ] || erro "A variável $v não foi definida. Em produção, confira os segredos NEON_BACKUP_URL e BACKUP_SENHA em Settings → Secrets and variables → Actions."
done

# Esconde do log público tudo que identifica o banco de origem, antes de qualquer conexão.
# O GitHub troca por *** qualquer ocorrência desses valores nas linhas seguintes.
python3 - "$ORIGEM_URL" <<'PY'
import sys
from urllib.parse import urlsplit, unquote
u = urlsplit(sys.argv[1])
for valor in (u.hostname, u.username and unquote(u.username), u.password and unquote(u.password), u.path.lstrip('/')):
    if valor and valor not in ('localhost', '127.0.0.1', 'postgres'):
        print('::add-mask::' + valor)
PY

host_origem=$(python3 -c 'import sys; from urllib.parse import urlsplit; print(urlsplit(sys.argv[1]).hostname or "")' "$ORIGEM_URL")
host_teste=$(python3 -c 'import sys; from urllib.parse import urlsplit; print(urlsplit(sys.argv[1]).hostname or "")' "$TESTE_URL")
case "$host_origem" in
  *-pooler*) erro "O endereço de origem usa o pooler do Neon. Use o endereço direto (Connection pooling desligado), como o Neon recomenda para pg_dump." ;;
esac
# A restauração de teste só acontece num banco desta máquina: nunca no Neon.
case "$host_teste" in
  localhost|127.0.0.1) ;;
  *) erro "TESTE_URL precisa apontar para um banco temporário em localhost. A restauração nunca é feita em outro lugar." ;;
esac
[ "${#BACKUP_SENHA}" -ge 20 ] || erro "A senha de criptografia precisa ter 20 caracteres ou mais."

# Com sslmode=verify-full, o pg_dump (libpq) procura o certificado raiz em ~/.postgresql e falha.
# sslrootcert=system o faz usar as autoridades do sistema, como o Node já faz no jogo.
ORIGEM_URL=$(python3 - "$ORIGEM_URL" <<'PY'
import sys
from urllib.parse import urlsplit, parse_qsl, urlencode, urlunsplit
u = urlsplit(sys.argv[1])
q = parse_qsl(u.query, keep_blank_values=True)
if dict(q).get('sslmode') == 'verify-full' and 'sslrootcert' not in dict(q):
    q.append(('sslrootcert', 'system'))
print(urlunsplit(u._replace(query=urlencode(q))))
PY
)
export PGCONNECT_TIMEOUT=30
# Mesmo fuso e formato de data nas duas pontas, para o md5 do conteúdo ser comparável.
export PGTZ=UTC PGDATESTYLE=ISO
export PGAPPNAME=backup-diario

consulta() { "$PG_BIN/psql" "$1" -X -q -v ON_ERROR_STOP=1 -tA -c "$2"; }

# 1. O pg_dump precisa ser da mesma versão principal do servidor, ou mais nova.
cliente=$("$PG_BIN/pg_dump" --version | sed -E 's/^pg_dump \(PostgreSQL\) ([0-9]+).*/\1/')
servidor=$(( $(consulta "$ORIGEM_URL" 'SHOW server_version_num') / 10000 ))
echo "pg_dump $cliente, servidor PostgreSQL $servidor"
[ "$cliente" -ge "$servidor" ] || erro "pg_dump $cliente é mais antigo que o servidor $servidor e não consegue copiá-lo."

[ -z "$(consulta "$TESTE_URL" "SELECT 1 FROM pg_tables WHERE schemaname = 'public' LIMIT 1")" ] \
  || erro "O banco de teste não está vazio."

# Uma linha por tabela do schema public: "nome contagem md5-do-conteúdo".
contar() {
  consulta "$1" "SELECT format('SELECT %L || '' '' || count(*) || '' '' || md5(coalesce(string_agg(t::text, chr(10) ORDER BY t::text COLLATE \"C\"), ''-'')) FROM public.%I t', tablename, tablename) FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename" \
    | while read -r sql; do consulta "$1" "$sql"; done
}

trabalho=$(mktemp -d)
export GNUPGHOME="$trabalho/gnupg"
mkdir -m 700 "$GNUPGHOME"
mkdir -p "$SAIDA"
dump="$trabalho/banco.dump"
cifrado="$SAIDA/banco-$(date -u +%Y-%m-%d).dump.gpg"

# 2. Cópia. Contagens antes e depois cobrem uma partida gravada durante a cópia.
contar "$ORIGEM_URL" > "$trabalho/antes.txt"
[ -s "$trabalho/antes.txt" ] || erro "Nenhuma tabela encontrada no banco de origem."
"$PG_BIN/pg_dump" "$ORIGEM_URL" --format=custom --no-owner --no-privileges --file="$dump"
contar "$ORIGEM_URL" > "$trabalho/depois.txt"
echo "Cópia gerada: $(du -h "$dump" | cut -f1)"

# 3. Criptografia (AES-256, senha derivada com SHA-512). O arquivo sem criptografia é apagado em seguida.
printf '%s' "$BACKUP_SENHA" | gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 0 \
  --symmetric --cipher-algo AES256 --s2k-mode 3 --s2k-digest-algo SHA512 --s2k-count 65011712 \
  --compress-algo none --output "$cifrado" "$dump"
rm -f "$dump"

# 4. A prova vem do arquivo criptografado, o mesmo que será guardado.
if [ "${MODO:-}" = teste ]; then
  if printf '%s' 'senha-errada-de-proposito-123' | gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 0 \
       --decrypt --output /dev/null "$cifrado" 2>/dev/null; then
    erro "A cópia abriu com uma senha errada."
  fi
  echo "Senha errada recusada, como esperado."
fi
restaurado="$trabalho/restaurado.dump"
printf '%s' "$BACKUP_SENHA" | gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 0 \
  --decrypt --output "$restaurado" "$cifrado" || erro "Não foi possível abrir a cópia criptografada."
"$PG_BIN/pg_restore" --list "$restaurado" > /dev/null || erro "A cópia está corrompida."
"$PG_BIN/pg_restore" --exit-on-error --no-owner --no-privileges --dbname="$TESTE_URL" "$restaurado" \
  || erro "A restauração de teste falhou."
rm -f "$restaurado"

# 5. Integridade: as mesmas tabelas, o mesmo número de linhas e o mesmo conteúdo (md5) da origem.
# A origem é lida antes e depois da cópia; a restauração precisa bater com uma das duas leituras.
contar "$TESTE_URL" > "$trabalho/restaurado.txt"
python3 - "$trabalho/antes.txt" "$trabalho/depois.txt" "$trabalho/restaurado.txt" <<'PY'
import sys
def ler(p):
    return {nome: (int(n), h) for nome, n, h in (l.split() for l in open(p) if l.strip())}
antes, depois, rest = (ler(p) for p in sys.argv[1:4])
falhas, avisos = [], []
if not set(antes) == set(depois) == set(rest):
    falhas.append('tabelas diferentes: origem %s, restaurado %s' % (sorted(set(antes) | set(depois)), sorted(rest)))
for nome in sorted(set(rest) & set(antes) & set(depois)):
    (na, ha), (nd, hd), (nr, hr) = antes[nome], depois[nome], rest[nome]
    if not min(na, nd) <= nr <= max(na, nd):
        falhas.append('%s: restaurou %d linhas, a origem tinha entre %d e %d' % (nome, nr, min(na, nd), max(na, nd)))
        estado = 'DIFERENTE'
    elif hr in (ha, hd):
        estado = 'ok'
    elif ha != hd:
        avisos.append('%s mudou durante a cópia; conferida só pelo número de linhas' % nome)
        estado = 'ok (mudou durante a cópia)'
    else:
        falhas.append('%s: o conteúdo restaurado é diferente da origem' % nome)
        estado = 'DIFERENTE'
    print('  %-22s %s' % (nome, estado))
for a in avisos:
    print('::warning::' + a)
if falhas:
    for f in falhas:
        print('::error::Restauração não confere: ' + f)
    sys.exit(1)
print('%d tabelas restauradas com as mesmas linhas e o mesmo conteúdo da origem.' % len(rest))
PY

rm -rf "$trabalho"
echo "Arquivo criptografado: $cifrado ($(du -h "$cifrado" | cut -f1))"
echo "arquivo=$cifrado" >> "${GITHUB_OUTPUT:-/dev/null}"
