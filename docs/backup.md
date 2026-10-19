# Backup do banco

Todo dia às 03:00 de Brasília o GitHub copia o banco do Neon, criptografa a cópia, restaura num PostgreSQL temporário para provar que ela funciona e guarda só o arquivo criptografado por 30 dias. Ninguém precisa acompanhar: o resultado fica registrado e um problema vira uma issue no repositório.

## O que roda a cada dia

O workflow é `.github/workflows/backup.yml` e a lógica fica em `scripts/backup-banco.sh`.

1. Instala o `pg_dump` 18, do repositório oficial do PostgreSQL. O Neon roda PostgreSQL 18, e um `pg_dump` mais antigo se recusa a copiar um servidor mais novo; o script confere as duas versões antes de começar.
2. Conecta ao Neon com o usuário `backup_leitura`, que só consegue ler, pelo endereço direto (sem pooling).
3. Lê cada tabela (número de linhas e um resumo md5 do conteúdo), gera a cópia e lê de novo.
4. Criptografa a cópia com AES-256 (`gpg`, senha derivada com SHA-512) e apaga a versão aberta. Um arquivo alterado depois disso não abre.
5. Abre o arquivo criptografado com a senha, restaura num PostgreSQL 18 temporário da própria execução e confere: as mesmas tabelas, o mesmo número de linhas e o mesmo conteúdo. A restauração só pode acontecer em `localhost`; o script recusa qualquer outro endereço.
6. Guarda o arquivo `.gpg` como artefato da execução por 30 dias.

Nos PRs que mexem no backup, o mesmo workflow roda em modo de teste: monta um banco temporário com as migrações do jogo, cria o usuário `backup_leitura` com o mesmo `scripts/backup-usuario-leitura.sql` que vai para o Neon e faz todo o processo, sem nenhum segredo.

## Avisos

| Situação | O que acontece | Onde ver |
| --- | --- | --- |
| Backup ou restauração de teste falhou | A execução fica vermelha e a issue **Backup do banco falhou** é aberta (ou ganha um comentário, se já estiver aberta), mencionando o dono do repositório | Aba **Issues** do repositório e as notificações do GitHub |
| Um backup seguinte deu certo | A issue recebe o link da execução boa e fecha sozinha | Aba **Issues**, filtro de fechadas |
| 45 dias sem nenhum commit no `main` | A issue **Backup diário vai pausar sem um commit** é aberta | Aba **Issues** |
| Tudo certo | Nada é aberto | **Actions → Backup do banco** |

Limites do GitHub que valem aqui:

- Em repositório público, o GitHub pausa workflows agendados depois de 60 dias sem atividade no repositório. O aviso dos 45 dias existe para isso; qualquer merge no `main` resolve.
- Agendamentos podem atrasar quando o GitHub está sobrecarregado, principalmente no começo de cada hora. O backup pode começar alguns minutos depois das 03:00.
- O e-mail nativo de falha de um workflow agendado vai para quem alterou por último a linha `cron` do arquivo, que pode não ser você. Por isso o aviso principal é a issue.
- Se o agendamento não rodar de jeito nenhum, nenhum aviso é gerado. Vale abrir **Actions → Backup do banco** de vez em quando e conferir a data da última execução.

Para conferir se o aviso chega: **Actions → Backup do banco → Run workflow**, marcar **Falhar de propósito** e rodar. A issue deve aparecer. Depois rode de novo sem marcar, e ela fecha.

## Configuração (uma vez)

1. No Neon, **SQL Editor** (branch `production`, banco `neondb`, com o mesmo usuário do jogo): colar `scripts/backup-usuario-leitura.sql`, trocar `TROQUE_PELA_SENHA` por uma senha de 24 ou mais caracteres, só letras e números, e executar. Cria só o usuário de leitura; nenhum dado muda.
2. Montar o endereço do backup: Neon → **Connect**, com **Connection pooling** desligado. No endereço copiado, trocar o usuário e a senha por `backup_leitura` e a senha nova, e manter `sslmode=verify-full`.
3. No GitHub, **Settings → Secrets and variables → Actions → New repository secret**:
   - `NEON_BACKUP_URL`: o endereço do passo 2.
   - `BACKUP_SENHA`: a senha de criptografia, com 20 ou mais caracteres. Guarde também num gerenciador de senhas: sem ela, nenhuma cópia abre.
4. Rodar **Actions → Backup do banco → Run workflow** num horário qualquer e conferir que ficou verde.

## Restaurar uma cópia

Nunca restaure por cima do banco de produção. Restaure num banco vazio (um banco local, ou uma branch ou projeto novo no Neon) e confira antes de trocar qualquer coisa no Render.

1. Em **Actions → Backup do banco**, abra a execução do dia desejado e baixe o artefato `backup-banco-…` (vem num `.zip`).
2. Descompacte e, no Git Bash do Windows (vem com o Git para Windows) ou num terminal Linux/macOS, abra o arquivo. O `gpg` pede a senha de criptografia:

   ```bash
   gpg --pinentry-mode loopback --output banco.dump --decrypt banco-AAAA-MM-DD.dump.gpg
   ```

3. Restaure com `pg_restore` 18 ou mais novo, apontando para o banco vazio:

   ```bash
   pg_restore --no-owner --no-privileges --dbname "ENDERECO_DO_BANCO_VAZIO" banco.dump
   ```

4. Apague o `banco.dump` aberto quando terminar.

## Desligar ou desfazer

- Pausar: **Actions → Backup do banco → ⋯ → Disable workflow**.
- Remover de vez: apagar `.github/workflows/backup.yml` e os segredos `NEON_BACKUP_URL` e `BACKUP_SENHA`.
- Remover o usuário do Neon, no SQL Editor:

  ```sql
  REVOKE ALL ON ALL TABLES IN SCHEMA public FROM backup_leitura;
  REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM backup_leitura;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT ON TABLES FROM backup_leitura;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT ON SEQUENCES FROM backup_leitura;
  REVOKE USAGE ON SCHEMA public FROM backup_leitura;
  REVOKE CONNECT ON DATABASE neondb FROM backup_leitura;
  DROP ROLE backup_leitura;
  ```

Nada disso afeta o jogo.
