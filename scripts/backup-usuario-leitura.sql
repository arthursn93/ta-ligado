-- Cria o usuário que o backup diário usa para ler o banco. Ele só consegue LER: não altera nem apaga nada.
-- Rodar uma vez no SQL Editor do Neon (branch production, banco neondb), com o mesmo usuário do jogo,
-- trocando TROQUE_PELA_SENHA pela senha escolhida (24+ caracteres, só letras e números).
-- O workflow de backup roda este mesmo arquivo nos testes dos PRs. Ver docs/backup.md.
CREATE ROLE backup_leitura WITH LOGIN PASSWORD 'TROQUE_PELA_SENHA';
GRANT CONNECT ON DATABASE neondb TO backup_leitura;
GRANT USAGE ON SCHEMA public TO backup_leitura;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO backup_leitura;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO backup_leitura;
-- Tabelas criadas por migrações futuras também entram no backup sem precisar repetir este passo.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO backup_leitura;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO backup_leitura;
