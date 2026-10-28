# Pedidos sobre dados (exclusão, consulta, correção)

Passo a passo para atender quem pede, pelo e-mail ta.ligado.games.2026@gmail.com (ou por uma issue no GitHub), para ver ou apagar o próprio histórico. A página `privacidade.html` promete só o que está aqui: não há prazo fixo de resposta.

**Antes de tudo:** quem ainda tem o aparelho e o navegador em que jogou pode apagar sozinho, em **Meu perfil → Apagar meus dados** (faz o mesmo que o passo 4, na hora). Responda lembrando disso. Este passo a passo é para quem não tem mais esse acesso (limpou os dados do site, trocou de navegador ou de aparelho).

Nada aqui roda sozinho. Os passos 1 a 3 só leem o banco. O passo 4 apaga e **só deve ser feito por você**, depois de ter certeza de que achou a pessoa certa.

## O que o banco guarda de cada jogador

| Tabela | O que tem |
|---|---|
| `jogadores` | o último nome usado, XP, visual do perfil e um código embaralhado do aparelho (`token_hash`, não dá para reverter) |
| `partida_jogadores` | uma linha por partida que a pessoa jogou, com o nome usado nela e o que fez (pistas, palpites, XP ganho) |
| `conquistas_jogador` | as conquistas desbloqueadas |
| `partidas` | o resultado da turma, o código e o horário da sala. **Não tem nome de ninguém** |

## 1. Responder o pedido

- Agradeça. Se o pedido veio por issue, lembre que ela é pública: a pessoa não deve escrever e-mail, telefone ou outros dados, e o melhor é continuar pelo e-mail.
- Peça só o nome usado nas salas, mais ou menos quando jogou e, se ajudar, com quem jogou.
- Se uma issue já tiver dados pessoais, você pode editar o texto dela para tirá-los.

## 2. Achar o jogador (só leitura)

No Neon, **SQL Editor**, branch `production`, banco `neondb`. Troque `NOME` pelo nome informado:

```sql
SELECT j.id, j.nome AS ultimo_nome, j.criado_em, j.visto_em,
       count(pj.partida_id) AS partidas,
       min(p.iniciada_em) AS primeira, max(p.iniciada_em) AS ultima
FROM jogadores j
LEFT JOIN partida_jogadores pj ON pj.jogador_id = j.id
LEFT JOIN partidas p ON p.id = pj.partida_id
WHERE j.nome ILIKE 'NOME'
   OR j.id IN (SELECT jogador_id FROM partida_jogadores WHERE nome ILIKE 'NOME')
GROUP BY j.id
ORDER BY j.visto_em DESC;
```

- Nomes se repetem (duas pessoas podem se chamar "Ana"). Use as datas para escolher a linha certa.
- Se sobrar mais de uma linha possível, pergunte à pessoa com quem ela jogou e confira:

```sql
SELECT p.iniciada_em, string_agg(pj.nome, ', ') AS turma
FROM partida_jogadores pj JOIN partidas p ON p.id = pj.partida_id
WHERE pj.partida_id IN (SELECT partida_id FROM partida_jogadores WHERE jogador_id = ID)
GROUP BY p.id ORDER BY p.iniciada_em DESC;
```

- Na dúvida, **não apague**. Responda que não foi possível confirmar.

## 3. Pedido de consulta

Para quem só quer saber o que está guardado, responda com os números do passo 2 (quantas partidas, de quando a quando, o XP). Não mande nomes de outros jogadores na resposta.

## 4. Apagar (escrita no banco: só você decide)

Troque `ID` pelo número achado no passo 2:

```sql
DELETE FROM jogadores WHERE id = ID;
```

Isso apaga o jogador e, junto, as linhas dele em `partida_jogadores` e `conquistas_jogador`. As partidas da turma continuam, sem o nome dele. Se o mesmo aparelho jogar de novo, começa do zero.

Depois, responda que foi apagado e lembre que as cópias de segurança diárias guardam os dados por até 30 dias antes de serem descartadas. Se o pedido veio por issue, feche a issue.

## Correção de nome

O nome muda sozinho na próxima partida em que a pessoa usar outro nome. Para trocar nas partidas antigas, o caminho mais simples é apagar (passo 4).
